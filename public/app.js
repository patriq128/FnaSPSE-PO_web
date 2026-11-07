(() => {
  "use strict";

  const authScreen = document.querySelector("#auth-screen");
  const downloadsScreen = document.querySelector("#downloads-screen");
  const passwordForm = document.querySelector("#password-form");
  const passwordInput = document.querySelector("#password");
  const submitButton = document.querySelector("#submit-button");
  const formError = document.querySelector("#form-error");
  const downloadsTitle = document.querySelector("#downloads-title");
  const description = document.querySelector("#game-description");
  const platformList = document.querySelector("#platforms");
  const siteFooter = document.querySelector("#site-footer");

  let submitting = false;
  let sessionActive = false;

  function setError(message) {
    formError.textContent = message || "";
    passwordInput.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function setFooter(game) {
    const name =
      game && typeof game.name === "string" && game.name.trim()
        ? game.name.trim()
        : "FnaSPSE";
    const version =
      game && typeof game.version === "string" ? game.version.trim() : "";

    siteFooter.textContent = version
      ? `${name} · Version ${version}`
      : name;
  }

  function setBusy(isBusy) {
    submitting = isBusy;
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Checking…" : "Continue";
  }

  function createPlayRow(webGame, gameName) {
    if (
      !webGame ||
      webGame.available !== true ||
      typeof webGame.url !== "string" ||
      webGame.url.length === 0
    ) {
      return null;
    }

    const row = document.createElement("li");
    const details = document.createElement("div");
    const name = document.createElement("span");
    const meta = document.createElement("span");
    const action = document.createElement("a");
    const size = typeof webGame.size === "string" ? webGame.size : "";
    const summary = ["Web", size].filter(Boolean).join(" · ");

    row.className = "platform platform--play";
    details.className = "platform__details";
    name.className = "platform__name";
    name.textContent = "Play in browser";
    meta.className = "platform__meta";
    meta.textContent = summary;

    action.className = "platform__action platform__action--primary";
    action.href = webGame.url;
    action.textContent = "Play";
    action.target = "_blank";
    action.setAttribute("rel", "noopener noreferrer");
    action.setAttribute(
      "aria-label",
      `Play ${gameName} in your browser (opens in a new tab)`,
    );

    details.append(name, meta);
    row.append(details, action);

    return row;
  }

  function createPlatformRow(platform, gameName) {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const name = document.createElement("span");
    const isAvailable =
      platform.available === true &&
      typeof platform.url === "string" &&
      platform.url.length > 0;

    row.className = "platform";
    details.className = "platform__details";
    name.className = "platform__name";
    name.textContent =
      typeof platform.name === "string" ? platform.name : "Platform";

    details.append(name);

    if (isAvailable) {
      const meta = document.createElement("span");
      const format =
        typeof platform.format === "string" ? platform.format : "";
      const size = typeof platform.size === "string" ? platform.size : "";
      const summary = [format, size].filter(Boolean).join(" · ");

      meta.className = "platform__meta";
      meta.textContent = summary;
      details.append(meta);

      if (typeof platform.sha256 === "string" && platform.sha256) {
        const checksum = document.createElement("span");

        checksum.className = "platform__checksum";
        checksum.textContent = `SHA-256 ${platform.sha256}`;
        details.append(checksum);
      }

      const action = document.createElement("a");

      action.className = "platform__action";
      action.href = platform.url;
      action.textContent = "Download";
      action.setAttribute("download", "");
      action.setAttribute("rel", "noopener noreferrer");
      action.setAttribute(
        "aria-label",
        `Download ${gameName} for ${platform.name}`,
      );

      row.append(details, action);
    } else {
      const status = document.createElement("span");

      status.className = "platform__status";
      status.textContent = "Unavailable";

      row.append(details, status);
    }

    return row;
  }

  function showDownloads(data) {
    const game = data && data.game ? data.game : {};
    const gameName =
      typeof game.name === "string" && game.name.trim()
        ? game.name.trim()
        : "FnaSPSE";
    const entries = Array.isArray(data.platforms) ? data.platforms : [];
    const playRow = createPlayRow(data.webGame, gameName);
    const rows = entries.map((platform) =>
      createPlatformRow(platform || {}, gameName),
    );

    downloadsTitle.textContent = gameName;
    description.textContent =
      typeof game.description === "string" ? game.description : "";
    description.hidden = !description.textContent;
    platformList.replaceChildren(...(playRow ? [playRow, ...rows] : rows));

    setFooter(game);

    sessionActive = true;
    setError("");
    authScreen.hidden = true;
    downloadsScreen.hidden = false;
    document.title = `${gameName} — Download`;
  }

  async function readJSON(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function restoreSession() {
    try {
      const response = await fetch("/api/config", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await readJSON(response);

      if (sessionActive) {
        return;
      }

      if (!response.ok || !data) {
        throw new Error("Could not load configuration.");
      }

      setFooter(data.game);

      if (data.authenticated === true) {
        showDownloads(data);
      }
    } catch {
      if (!sessionActive) {
        setError("Could not load the page. Check your connection and refresh.");
      }
    }
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const password = passwordInput.value;

    if (!password) {
      setError("Enter a password.");
      passwordInput.focus();
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = await readJSON(response);

      if (response.ok && data && data.authenticated === true) {
        passwordForm.reset();
        showDownloads(data);
        return;
      }

      if (response.status === 429) {
        setError("Too many attempts. Try again later.");
      } else if (response.status === 401) {
        setError("Incorrect password.");
      } else if (response.status === 400) {
        setError("Enter a password.");
      } else {
        setError("Could not sign in. Try again.");
      }

      passwordInput.focus();
      passwordInput.select();
    } catch {
      setError("Could not sign in. Try again.");
      passwordInput.focus();
    } finally {
      setBusy(false);
    }
  });

  passwordInput.addEventListener("input", () => {
    if (formError.textContent) {
      setError("");
    }
  });

  restoreSession();
})();

import { game, platforms } from "../_config.js";

function text(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function httpsUrl(value) {
  const raw = text(value, 2048);

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function checksum(value) {
  const normalized = text(value, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function publicGame() {
  return {
    name: text(game && game.name, 80) || "FnaSPSE",
    version: text(game && game.version, 40) || "1.0.0",
  };
}

export function publicGameInfo() {
  return publicGame();
}

export function normalizePlatforms(entries) {
  const list = Array.isArray(entries) ? entries : [];

  return list.map((platform, index) => {
    const name = text(platform && platform.name, 80) || `Platform ${index + 1}`;
    const format = text(platform && platform.format, 40);
    const size = text(platform && platform.size, 40);
    const url = httpsUrl(platform && platform.url);
    const available =
      Boolean(platform) &&
      platform.available === true &&
      Boolean(format && size && url);

    return {
      name,
      available,
      format: available ? format : null,
      size: available ? size : null,
      url: available ? url : null,
      sha256: available ? checksum(platform.sha256) : null,
    };
  });
}

export function downloadPageData() {
  return {
    game: {
      ...publicGame(),
      description: text(game && game.description, 500),
    },
    platforms: normalizePlatforms(platforms),
  };
}

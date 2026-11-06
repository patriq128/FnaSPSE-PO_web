import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequest as rejectUnsupportedConfigMethod,
  onRequestGet as getConfig,
} from "../functions/api/config.js";
import {
  onRequest as rejectUnsupportedLoginMethod,
  onRequestPost as signIn,
} from "../functions/api/login.js";
import { onRequest as notFoundApi } from "../functions/api/[[path]].js";
import { normalizePlatforms } from "../functions/_lib/game.js";

const env = {
  GAME_PASSWORD: "correct horse battery staple",
  SESSION_SECRET: "test-session-secret-that-is-long-enough-1234567890",
};

function loginRequest(password, ip = "198.51.100.10", url = "https://example.com/api/login") {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify({ password }),
  });
}

function configRequest(cookie) {
  return new Request("https://example.com/api/config", {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

function extractCookie(response) {
  const header = response.headers.get("Set-Cookie");
  const match = /fnaspse_session=([^;]+)/.exec(header || "");

  assert.ok(match, "expected a session cookie");
  return match[1];
}

test("unauthenticated config exposes only basic game metadata", async () => {
  const response = await getConfig({
    request: configRequest(),
    env,
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.authenticated, false);
  assert.equal(data.game.name, "FnaSPSE");
  assert.equal("platforms" in data, false);
  assert.equal("description" in data.game, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes(env.GAME_PASSWORD), false);
  assert.equal(serialized.includes("releases/download"), false);
});

test("the correct password creates a secure, signed session", async () => {
  const response = await signIn({
    request: loginRequest(env.GAME_PASSWORD, "198.51.100.11"),
    env,
  });
  const data = await response.json();
  const setCookie = response.headers.get("Set-Cookie") || "";

  assert.equal(response.status, 200);
  assert.equal(data.authenticated, true);
  assert.ok(Array.isArray(data.platforms));
  assert.match(setCookie, /fnaspse_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /Max-Age=43200/);
  assert.match(setCookie, /Secure/);
  assert.equal(setCookie.includes(env.GAME_PASSWORD), false);
  assert.equal(JSON.stringify(data).includes(env.GAME_PASSWORD), false);

  const token = extractCookie(response);
  const configResponse = await getConfig({
    request: configRequest(`fnaspse_session=${token}`),
    env,
  });
  const configData = await configResponse.json();

  assert.equal(configResponse.status, 200);
  assert.equal(configData.authenticated, true);
  assert.ok(Array.isArray(configData.platforms));
});

test("local http sign-in does not set the Secure cookie flag", async () => {
  const response = await signIn({
    request: loginRequest(
      env.GAME_PASSWORD,
      "198.51.100.12",
      "http://localhost:8788/api/login",
    ),
    env,
  });
  const setCookie = response.headers.get("Set-Cookie") || "";

  assert.equal(response.status, 200);
  assert.equal(setCookie.includes("Secure"), false);
});

test("a wrong password is rejected and does not create a session", async () => {
  const response = await signIn({
    request: loginRequest("not the password", "198.51.100.13"),
    env,
  });
  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "Incorrect password.");
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("tampered and malformed session cookies are rejected", async () => {
  const loginResponse = await signIn({
    request: loginRequest(env.GAME_PASSWORD, "198.51.100.14"),
    env,
  });
  const token = extractCookie(loginResponse);
  const [payload, signature] = token.split(".");
  const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;

  for (const cookie of [
    "fnaspse_session=nope",
    `fnaspse_session=${tamperedPayload}.${signature}`,
    "fnaspse_session=",
  ]) {
    const response = await getConfig({
      request: configRequest(cookie),
      env,
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.authenticated, false);
  }
});

test("repeated failures are rate limited", async () => {
  const ip = "203.0.113.20";
  let response;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    response = await signIn({
      request: loginRequest("wrong", ip),
      env,
    });
    assert.equal(response.status, 401);
  }

  response = await signIn({
    request: loginRequest(env.GAME_PASSWORD, ip),
    env,
  });

  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("malformed and oversized requests are rejected", async () => {
  const malformed = new Request("https://example.com/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.21",
    },
    body: "{not json",
  });
  const malformedResponse = await signIn({ request: malformed, env });

  assert.equal(malformedResponse.status, 400);

  const wrongTypeResponse = await signIn({
    request: new Request("https://example.com/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.22",
      },
      body: JSON.stringify({ password: 123 }),
    }),
    env,
  });

  assert.equal(wrongTypeResponse.status, 400);

  const oversizedResponse = await signIn({
    request: new Request("https://example.com/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.23",
      },
      body: JSON.stringify({ password: "x".repeat(2000) }),
    }),
    env,
  });

  assert.equal(oversizedResponse.status, 413);
});

test("missing or weak environment secrets fail closed", async (t) => {
  t.mock.method(console, "error", () => {});

  for (const invalidEnv of [
    {},
    { GAME_PASSWORD: "password", SESSION_SECRET: "too-short" },
  ]) {
    const response = await getConfig({
      request: configRequest(),
      env: invalidEnv,
    });
    const data = await response.json();

    assert.equal(response.status, 500);
    assert.equal(data.authenticated, undefined);
    assert.equal(data.error, "The site is not configured correctly.");
  }
});

test("unsupported HTTP methods return JSON 405 responses", async () => {
  const configResponse = rejectUnsupportedConfigMethod();
  const loginResponse = rejectUnsupportedLoginMethod();

  assert.equal(configResponse.status, 405);
  assert.equal(configResponse.headers.get("Allow"), "GET");
  assert.equal(loginResponse.status, 405);
  assert.equal(loginResponse.headers.get("Allow"), "POST");
  assert.deepEqual(await configResponse.json(), { error: "Method not allowed." });
  assert.deepEqual(await loginResponse.json(), { error: "Method not allowed." });
});

test("unknown API routes return a JSON 404", async () => {
  const response = notFoundApi();

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});

test("platform normalization only publishes complete HTTPS builds", () => {
  const sha256 = "a".repeat(64);
  const result = normalizePlatforms([
    {
      name: " Windows ",
      available: true,
      format: "ZIP",
      size: "128 MB",
      url: "https://github.com/owner/repo/releases/download/v1/game.zip",
      sha256: sha256.toUpperCase(),
    },
    {
      name: "Linux",
      available: true,
      format: "",
      size: "128 MB",
      url: "https://github.com/owner/repo/releases/download/v1/game-linux.zip",
    },
    {
      name: "macOS",
      available: true,
      format: "ZIP",
      size: "128 MB",
      url: "javascript:alert(1)",
    },
    {
      name: "Archive",
      available: false,
      format: "ZIP",
      size: "128 MB",
      url: "https://example.com/game.zip",
    },
  ]);

  assert.equal(result.length, 4);
  assert.deepEqual(result[0], {
    name: "Windows",
    available: true,
    format: "ZIP",
    size: "128 MB",
    url: "https://github.com/owner/repo/releases/download/v1/game.zip",
    sha256,
  });
  assert.equal(result[1].available, false);
  assert.equal(result[1].url, null);
  assert.equal(result[2].available, false);
  assert.equal(result[2].url, null);
  assert.equal(result[3].available, false);
});

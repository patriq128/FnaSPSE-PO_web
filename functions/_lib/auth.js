const SESSION_COOKIE = "fnaspse_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret(env, name) {
  const value = env && env[name];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function toBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const padding = "=".repeat((4 - (value.length % 4)) % 4);

  try {
    const binary = atob(
      value.replace(/-/g, "+").replace(/_/g, "/") + padding,
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

function equalBytes(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

async function getSessionKey(env) {
  const sessionSecret = getSecret(env, "SESSION_SECRET");
  const gamePassword = getSecret(env, "GAME_PASSWORD");

  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }

  // Binding the key to the password means rotating the password also
  // invalidates every existing session.
  const material = await sha256(
    `fnaspse-session-v1\0${sessionSecret}\0${gamePassword}`,
  );

  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifyPassword(candidate, env) {
  const expected = getSecret(env, "GAME_PASSWORD");
  const [candidateHash, expectedHash] = await Promise.all([
    sha256(candidate),
    sha256(expected),
  ]);

  return equalBytes(candidateHash, expectedHash);
}

export async function createSession(env) {
  const key = await getSessionKey(env);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ expiresAt })),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );

  return `${payload}.${toBase64Url(signature)}`;
}

async function verifySessionWithKey(token, key) {
  if (typeof token !== "string" || token.length > 512) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;
  const signatureBytes = fromBase64Url(signature);

  if (!signatureBytes || signatureBytes.length !== 32) {
    return false;
  }

  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(payload),
  );

  if (!validSignature) {
    return false;
  }

  const payloadBytes = fromBase64Url(payload);

  if (!payloadBytes) {
    return false;
  }

  try {
    const data = JSON.parse(decoder.decode(payloadBytes));
    const now = Math.floor(Date.now() / 1000);

    return (
      Number.isInteger(data.expiresAt) &&
      data.expiresAt > now &&
      data.expiresAt <= now + SESSION_MAX_AGE_SECONDS + 60
    );
  } catch {
    return false;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie");

  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return null;
}

export async function isAuthenticated(request, env) {
  // Validate the server configuration even when no cookie is present, so a
  // missing secret fails closed instead of yielding a half-working page.
  const key = await getSessionKey(env);
  const token = readCookie(request, SESSION_COOKIE);

  if (!token) {
    return false;
  }

  return verifySessionWithKey(token, key);
}

export function createSessionCookie(token, isSecure) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];

  if (isSecure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

import {
  createSession,
  createSessionCookie,
  verifyPassword,
} from "../_lib/auth.js";
import { downloadPageData } from "../_lib/game.js";
import { isSecureRequest, json } from "../_lib/http.js";
import {
  checkRateLimit,
  clearFailures,
  getClientKey,
  recordFailure,
} from "../_lib/rate-limit.js";

const MAX_BODY_BYTES = 1024;
const MAX_PASSWORD_LENGTH = 256;

export function onRequest() {
  return json(
    { error: "Method not allowed." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function onRequestPost({ request, env }) {
  try {
    const declaredLength = Number(request.headers.get("Content-Length") || 0);

    if (declaredLength > MAX_BODY_BYTES) {
      return json(
        { error: "That request is too large." },
        { status: 413 },
      );
    }

    const clientKey = getClientKey(request);
    const rateLimit = checkRateLimit(clientKey);

    if (rateLimit.limited) {
      return json(
        { error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    let body;

    try {
      const rawBody = await request.text();

      if (rawBody.length > MAX_BODY_BYTES) {
        return json(
          { error: "That request is too large." },
          { status: 413 },
        );
      }

      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid request." }, { status: 400 });
    }

    const password = body && body.password;

    if (
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return json({ error: "Enter a password." }, { status: 400 });
    }

    if (!(await verifyPassword(password, env))) {
      recordFailure(clientKey);
      return json({ error: "Incorrect password." }, { status: 401 });
    }

    clearFailures(clientKey);

    const session = await createSession(env);
    const cookie = createSessionCookie(session, isSecureRequest(request));

    return json(
      {
        authenticated: true,
        ...downloadPageData(),
      },
      { headers: { "Set-Cookie": cookie } },
    );
  } catch (error) {
    console.error("Sign-in failed:", error);
    return json(
      { error: "Could not sign in. Try again." },
      { status: 500 },
    );
  }
}

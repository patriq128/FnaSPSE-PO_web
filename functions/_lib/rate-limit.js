const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_TRACKED_CLIENTS = 1000;

// Best-effort, per-isolate limiter. It slows down repeated guesses without
// requiring a database. Cloudflare may run several isolates, so this is a
// supplement to a strong password, not a replacement for one.
const failures = new Map();

function prune(now) {
  for (const [key, entry] of failures) {
    if (now - entry.startedAt >= WINDOW_MS) {
      failures.delete(key);
    }
  }

  while (failures.size >= MAX_TRACKED_CLIENTS) {
    const oldestKey = failures.keys().next().value;
    failures.delete(oldestKey);
  }
}

export function getClientKey(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

export function checkRateLimit(key) {
  const entry = failures.get(key);

  if (!entry) {
    return { limited: false, retryAfter: 0 };
  }

  const elapsed = Date.now() - entry.startedAt;

  if (elapsed >= WINDOW_MS) {
    failures.delete(key);
    return { limited: false, retryAfter: 0 };
  }

  if (entry.count < MAX_FAILURES) {
    return { limited: false, retryAfter: 0 };
  }

  return {
    limited: true,
    retryAfter: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)),
  };
}

export function recordFailure(key) {
  const now = Date.now();
  const entry = failures.get(key);

  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    failures.set(key, { count: 1, startedAt: now });
  } else {
    entry.count += 1;
  }

  if (failures.size >= MAX_TRACKED_CLIENTS) {
    prune(now);
  }
}

export function clearFailures(key) {
  failures.delete(key);
}

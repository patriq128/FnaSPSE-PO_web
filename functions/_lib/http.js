const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function json(data, { status = 200, headers = {} } = {}) {
  const responseHeaders = new Headers(BASE_HEADERS);

  responseHeaders.set("Content-Type", "application/json; charset=utf-8");

  for (const [name, value] of Object.entries(headers)) {
    responseHeaders.set(name, value);
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function isSecureRequest(request) {
  return new URL(request.url).protocol === "https:";
}

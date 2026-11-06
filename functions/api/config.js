import { isAuthenticated } from "../_lib/auth.js";
import { downloadPageData, publicGameInfo } from "../_lib/game.js";
import { json } from "../_lib/http.js";

export function onRequest() {
  return json(
    { error: "Method not allowed." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export async function onRequestGet({ request, env }) {
  try {
    const authenticated = await isAuthenticated(request, env);

    if (!authenticated) {
      return json({
        authenticated: false,
        game: publicGameInfo(),
      });
    }

    return json({
      authenticated: true,
      ...downloadPageData(),
    });
  } catch (error) {
    console.error("Failed to load site configuration:", error);
    return json(
      { error: "The site is not configured correctly." },
      { status: 500 },
    );
  }
}

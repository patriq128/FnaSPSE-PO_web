import { json } from "../_lib/http.js";

export function onRequest() {
  return json({ error: "Not found." }, { status: 404 });
}

import { createHash, createHmac, randomUUID } from "node:crypto";
import { requireActor } from "./auth.js";
import { userLimit } from "./security.js";
import { HttpError, readBytes, route } from "./http.js";

export function bridgeSecret() {
  const key = process.env.PLOTLINE_BRIDGE_SECRET;
  if (!key || key.length < 32 || key === process.env.AUTH_SECRET) throw new Error("An independent internal bridge secret is required.");
  return key;
}

export function apiOrigin() {
  const url = new URL(process.env.PLOTLINE_INTERNAL_API_URL || "");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "plotline-api", "portfolio-plotline-api"].includes(url.hostname)) throw new Error("A private API origin is required.");
  return url.origin;
}

// No arbitrary URL proxy, auth endpoint proxy or user-supplied trusted headers.
const allowed = /^\/api\/(?:profile|uploads|campaigns(?:\/[A-Za-z0-9_-]+(?:\/(?:settings|start|brand\/fetch|claims\/extract))?)?|threads\/[A-Za-z0-9_-]+(?:\/(?:events|generation-log|artifacts\/[A-Za-z0-9_-]+\/activity|prompts\/[A-Za-z0-9_-]+))?|assets(?:\/[A-Za-z0-9_-]+(?:\/file)?)?|canon(?:\/@?[A-Za-z0-9_-]+)?|templates|ad-cards(?:\/[A-Za-z0-9_-]+(?:\/(?:bundle|mark-live))?)?|performance|agent-runs|media-runs|examples|usage)$/;

export const forward = route(async req => {
  const url = new URL(req.url);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(404, "Resource not found."); }
  if (!allowed.test(pathname) || url.search.length > 1024) throw new HttpError(404, "Resource not found.");
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(req.method)) throw new HttpError(405, "Method not allowed.");
  const write = req.method !== "GET";
  const actor = await requireActor(req, { write });
  await userLimit(actor, write ? "mutation" : "read", write ? 180 : 1500, 300);
  const body = req.body ? await readBytes(req, url.pathname === "/api/uploads" ? 16 * 1024 * 1024 : 512 * 1024) : Buffer.alloc(0);
  const now = Math.floor(Date.now() / 1000);
  const binding = { v: 1, owner_id: actor.id, session_id: actor.sid, nonce: randomUUID(), iat: now, exp: now + 30,
    method: req.method, path: pathname + url.search, sha256: createHash("sha256").update(body).digest("hex") };
  const encoded = Buffer.from(JSON.stringify(binding)).toString("base64url");
  const signed = `${encoded}.${createHmac("sha256", bridgeSecret()).update(encoded).digest("base64url")}`;
  const headers = new Headers({ "x-plotline-actor": signed, "accept": req.headers.get("accept") || "application/json" });
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetch(apiOrigin() + url.pathname + url.search, { method: req.method, headers,
      body: body.length ? body : undefined, redirect: "error", signal: controller.signal, cache: "no-store" });
  } catch { clearTimeout(timer); throw new HttpError(503, "The campaign service is unavailable."); }
  const outgoing = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  for (const name of ["content-type", "content-disposition", "content-length"]) {
    const value = response.headers.get(name); if (value) outgoing.set(name, value);
  }
  if (response.headers.get("content-type")?.includes("image/svg+xml")) outgoing.set("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  if (!response.body) { clearTimeout(timer); return new Response(null, { status: response.status, headers: outgoing }); }
  const reader = response.body.getReader();
  let received = 0;
  const stream = new ReadableStream({
    async pull(sink) {
      try {
        const { done, value } = await reader.read();
        if (done) { clearTimeout(timer); sink.close(); return; }
        received += value.byteLength;
        if (received > 128 * 1024 * 1024) throw new Error("Response exceeds limit");
        sink.enqueue(value);
      } catch (error) { clearTimeout(timer); controller.abort(); sink.error(new Error("Download was interrupted.")); }
    },
    async cancel() { clearTimeout(timer); controller.abort(); await reader.cancel(); },
  });
  return new Response(stream, { status: response.status, headers: outgoing });
});

import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { authSecret, origin } from "@/server/security";
import { apiOrigin, bridgeSecret } from "@/server/bridge";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  authSecret(); origin(); bridgeSecret(); await query("SELECT 1");
  const response = await fetch(apiOrigin() + "/healthz", { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error("Private API is unavailable");
  const health = await response.json();
  if (!health.ok || !health.auth) throw new Error("Private API is not ready");
  return json({ ok: true, auth: true, mock: health.mock_llm, media_mock: health.media_mock });
});

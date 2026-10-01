const loopback = value => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(value);

export function localPreview() {
  if (process.env.PLOTLINE_LOCAL_PREVIEW !== "1") return false;
  const address = new URL(process.env.PUBLIC_ORIGIN || "");
  const database = new URL(process.env.DATABASE_URL || "");
  if (address.origin !== process.env.PUBLIC_ORIGIN || address.protocol !== "http:" || !loopback(address.hostname) || !loopback(database.hostname) || process.env.MOCK_LLM !== "1" || process.env.MOCK_MEDIA !== "1" || process.env.PLOTLINE_BIND_HOST !== "127.0.0.1" || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.PIXELBIN_API_TOKEN || process.env.FAL_KEY) throw new Error("The local preview must be loopback-only with synthetic providers.");
  return true;
}

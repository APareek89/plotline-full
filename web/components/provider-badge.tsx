// Prefer recorded provenance. Only explicit adapter prefixes are legacy evidence.
export function providerLabel(provider: unknown, model?: unknown): string | null {
  const names: Record<string, string> = { pixelbin: "PixelBin", fal: "fal", sample: "Sample", mock: "Sample", prepared: "Sample" };
  if (typeof provider === "string" && names[provider]) return names[provider];
  if (model === "mock") return "Sample";
  if (typeof model === "string" && model.startsWith("pixelbin:")) return "PixelBin";
  if (typeof model === "string" && model.startsWith("fal:")) return "fal";
  return null;
}
export default function ProviderBadge({ provider, model }: { provider?: unknown; model?: unknown }) {
  const label = providerLabel(provider, model);
  return label ? <span className="provider-badge" title="Recorded media provider">{label}</span> : null;
}

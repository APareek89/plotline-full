// Display only recorded provenance. Legacy estimates are not provider invoices.
export function sampleMedia(...records: unknown[]): boolean {
  return records.some((record) => {
    if (!record || typeof record !== 'object') return false;
    const item = record as Record<string, unknown>;
    return item.sample_media === true || item.billing_status === 'sample' || ['sample', 'mock', 'prepared'].includes(String(item.provider)) || item.model === 'mock';
  });
}
export function mediaCost(value: unknown, ...records: unknown[]): string {
  if (sampleMedia(...records)) return 'Sample · $0';
  const unverified = records.some((record) => {
    if (!record || typeof record !== 'object') return false;
    const item = record as Record<string, unknown>;
    return item.billing_status === 'usd_unverified' || item.provider === 'pixelbin' || (typeof item.model === 'string' && item.model.startsWith('pixelbin:'));
  });
  if (unverified) return 'USD cost unverified';
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? `Est. $${value.toFixed(2)} · USD unverified`
    : 'USD cost unverified';
}
export function recordedCredits(value: unknown): string | null {
  const validNumber = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
  const validDecimal = typeof value === 'string' && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/.test(value);
  return validNumber || validDecimal ? `${value} provider credits recorded` : null;
}

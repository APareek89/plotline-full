import { Evidence } from "@/lib/api";

// REF/STAT/TREND render as evidence; PRINCIPLE renders muted — model opinion
// is never dressed up as data (§10).
export function EvidencePill({ ev }: { ev: Evidence }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 text-[12px] leading-snug">
      <span className={`ev ev-${ev.tag}`}>{ev.tag}</span>
      <span className={ev.tag === "PRINCIPLE" ? "text-muted" : "text-ink-soft"}>
        {ev.claim}
        {ev.source_id !== "model" && (
          <span className="mono ml-1 text-muted">[{ev.source_id}]</span>
        )}
        {ev.as_of && <span className="ml-1 text-muted">· as of {ev.as_of}</span>}
      </span>
    </span>
  );
}

export function RatingBadge({
  rating,
  downgraded,
  upgraded,
}: {
  rating: string | null;
  downgraded?: boolean;
  upgraded?: boolean;
}) {
  if (!rating)
    return <span className="text-[12px] font-semibold text-muted">not addressed</span>;
  const label = rating === "H" ? "HIGH" : rating === "M" ? "MED" : "LOW";
  return (
    <span className={`rating-${rating} text-[12px]`}>
      {label}
      {downgraded && <span className="ml-1 text-[11px] font-semibold text-low">↓ red-team</span>}
      {upgraded && <span className="ml-1 text-[11px] font-semibold text-high">↑ red-team</span>}
    </span>
  );
}

export function CcsBadge({ ccs, status }: { ccs: number; status: string }) {
  const tone =
    status === "rework"
      ? "bg-low-wash text-low"
      : status === "strong"
        ? "bg-accent text-white"
        : status === "approved"
          ? "bg-ink text-white"
          : "bg-ref-wash text-ref";
  const label =
    status === "rework" ? "REWORK" : status === "strong" ? "SHIP" : status === "approved" ? "APPROVED" : "QUALIFIED";
  return (
    <span className={`inline-flex items-center gap-2 rounded-[12px] px-3 py-1 ${tone}`}>
      <span className="display text-[16px] font-bold leading-none">{ccs}</span>
      <span className="text-[10px] font-bold tracking-widest">CCS · {label}</span>
    </span>
  );
}

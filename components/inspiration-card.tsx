import { InspirationCard as Card, PLATFORM_LABELS, fmtStat } from "@/lib/api";

// §3.2 launch state: full card UI, wired retrieval, selection disabled with an
// honest "sample data — pipeline pending" label. No fake liveness.
export function InspirationCardView({ card }: { card: Card }) {
  return (
    <div className="card relative flex flex-col gap-2.5 p-4 opacity-95">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip">{card.format?.replace(/_/g, " ")}</span>
        <span className="chip">{PLATFORM_LABELS[card.platform] ?? card.platform}</span>
        {card.duration_s > 0 && <span className="chip">{card.duration_s}s</span>}
        <span
          className="ml-auto cursor-not-allowed rounded-[12px] border border-line px-2.5 py-0.5 text-[11px] text-muted"
          title="Selection is disabled while the inspiration pipeline is pending — cards are sample data"
        >
          select — pending
        </span>
      </div>
      <h4 className="text-[14px] font-bold leading-snug">{card.title}</h4>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">{card.description}</p>
      <p className="mono text-[11px] text-muted">
        {fmtStat(card)} · {card.source_id} · as of {card.as_of}
      </p>
      <p className="text-[12.5px] italic leading-snug text-ink-soft">
        <span className="not-italic font-semibold text-ink">Why it works: </span>
        {card.why_it_works}
      </p>
    </div>
  );
}

"use client";

// Addendum-01 §01: every artifact renders as a card stack inside an agent
// message — never prose. Compact in-thread cards; the right panel (§02) holds
// the full story.

import { ArtifactEnvelope, PLATFORM_LABELS, fmtStat } from "@/lib/api";

export function ProvisionalBadge() {
  return (
    <span className="chip !border-amber-500 !text-amber-700" title="Evidence coverage < 40% — treat scores as provisional (Addendum-01 §7.3)">
      PROVISIONAL
    </span>
  );
}

export function CoverageChip({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  return (
    <span className="chip" title="Share of scoring weight backed by data evidence (REF/STAT/TREND)">
      {pct}% data-backed
    </span>
  );
}

function ActionRow({
  artifact,
  onAction,
  busy,
}: {
  artifact: ArtifactEnvelope;
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
}) {
  if (!artifact.actions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {artifact.actions.map((a) => (
        <button
          key={a.id}
          disabled={busy}
          onClick={() => onAction(artifact.id, a.event)}
          className={
            a.style === "primary" ? "btn btn-primary !px-3 !py-1" :
            a.style === "danger" ? "btn btn-ghost !px-3 !py-1 !text-low" :
            "btn btn-ghost !px-3 !py-1"
          }
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function ArtifactCard({
  artifact,
  onOpen,
  onAction,
  busy,
  approved,
}: {
  artifact: ArtifactEnvelope;
  onOpen: (a: ArtifactEnvelope) => void;
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
  approved?: boolean;
}) {
  const p = artifact.payload ?? {};

  if (artifact.type === "context_summary") {
    const ctx = p.context ?? {};
    const nc = p.niche_coverage;
    return (
      <div className="card cursor-pointer border-l-4 border-l-accent p-4" onClick={() => onOpen(artifact)} role="button" aria-label={`Open ${artifact.title}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="field-label">▣ Context summary — pinned</p>
          {nc?.provisional && <ProvisionalBadge />}
        </div>
        <p className="mt-1 text-[14px] font-bold">{artifact.title}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">
          {ctx.mode === "series" ? "Series" : "One-time"} · {ctx.objective} · {ctx.content_area} ·{" "}
          {(ctx.platforms ?? []).map((x: string) => PLATFORM_LABELS[x] ?? x).join(", ")}
        </p>
        {nc && (
          <p className="mt-1 text-[11.5px] text-muted">
            Niche coverage: {nc.assets} assets / {nc.chunks} chunks
            {nc.provisional && ` — below thresholds (${nc.thresholds.assets}/${nc.thresholds.chunks}), plan runs provisional`}
          </p>
        )}
      </div>
    );
  }

  if (artifact.type === "inspiration_set") {
    const cards = (p.cards ?? []).slice(0, 6);
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="field-label">Reference set</p>
          {p.sample_data && (
            <span className="chip !border-dashed" title="Curated sample corpus — selection disabled until the inspiration pipeline ships">
              sample data — pipeline pending
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {cards.map((c: any) => (
            <div key={c.source_id} className="rounded-[12px] border border-line bg-paper p-2.5">
              <p className="text-[12px] font-semibold leading-snug">{c.title}</p>
              <p className="mono mt-0.5 text-[10.5px] text-muted">
                {fmtStat(c)} · {c.source_id}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.type === "format_options") {
    return (
      <div className="card p-4">
        <p className="field-label">Format options — pick before concepts (PASS 0.5)</p>
        <div className="mt-2 grid gap-2">
          {(p.options ?? []).map((o: any) => (
            <div key={o.format_id} className="rounded-[12px] border border-line bg-paper p-3">
              <div className="flex items-center justify-between">
                <p className="text-[13.5px] font-bold">
                  <span className="mono text-[11px] text-accent">{o.format_id}</span> · {o.name}
                </p>
                <span className="chip">effort {o.effort}</span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">{o.vehicle}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">{o.why_fits} · {o.cadence_fit}</p>
              {(o.evidence ?? []).length > 0 && (
                <p className="mono mt-1 text-[10.5px] text-muted">
                  {(o.evidence ?? []).map((e: any) => `[${e.source_id}]`).join(" ")}
                </p>
              )}
            </div>
          ))}
        </div>
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  if (artifact.type === "concept") {
    const c = p.concept ?? {};
    const status = approved ? "approved" : p.status;
    return (
      <div className="card cursor-pointer p-4 transition-shadow hover:shadow-md" onClick={() => onOpen(artifact)} role="button" aria-label={`Open concept ${artifact.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mono text-[11px] font-bold text-accent">{artifact.id}</span>
              <span className="chip">{(c.format ?? "").replace(/_/g, " ")}</span>
              {c.slot_date && <span className="chip">slot {c.slot_date}</span>}
              <CoverageChip pct={p.coverage} />
              {p.provisional && <ProvisionalBadge />}
            </div>
            <p className="mt-1.5 text-[14px] font-bold leading-snug">{artifact.title}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">“{c.hook?.verbal}”</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="display text-[20px] font-bold">{p.ccs}</p>
            <p className="mono text-[10px] uppercase text-muted">CCS · {status}</p>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
        </div>
      </div>
    );
  }

  if (artifact.type === "plan") {
    const statuses = p.statuses ?? {};
    const ids = Object.keys(statuses);
    return (
      <div className="card cursor-pointer border-l-4 border-l-accent p-4" onClick={() => onOpen(artifact)} role="button" aria-label="Open plan">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-bold">{artifact.title}</p>
          <div className="flex items-center gap-1.5">
            <CoverageChip pct={p.coverage} />
            {p.provisional && <ProvisionalBadge />}
          </div>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          {ids.length} concepts · {ids.filter((i) => ["qualified", "strong"].includes(statuses[i]?.status)).length} qualified ·{" "}
          {ids.filter((i) => statuses[i]?.status === "rework").length} rework
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted">Open for the full timeline; Expand for the board.</p>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
        </div>
      </div>
    );
  }

  if (artifact.type === "escalation") {
    return (
      <div className="card border-l-4 border-l-low p-4">
        <p className="field-label text-low">Escalation</p>
        <p className="mt-1 text-[13.5px] font-bold">{artifact.title}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">{p.reason}</p>
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  // fallback: unknown artifact types stay visible, never silently dropped
  return (
    <div className="card border-dashed p-4">
      <p className="field-label">{artifact.type}</p>
      <p className="text-[13px] font-semibold">{artifact.title}</p>
    </div>
  );
}

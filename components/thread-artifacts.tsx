"use client";

// Addendum-01 §01: every artifact renders as a card stack inside an agent
// message — never prose. Compact in-thread cards; the right panel (§02) holds
// the full story.

import { useState } from "react";
import { API_URL, ArtifactEnvelope, PLATFORM_LABELS, fmtStat } from "@/lib/api";

const media = (url: string) => (url?.startsWith("/") ? `${API_URL}${url}` : url);

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

  // ---- Addendum-02: Creative Studio artifacts ----

  if (artifact.type === "confidence_card") {
    const rec = p.route_rec ?? {};
    return (
      <div className="card border-l-4 border-l-accent p-4">
        <div className="flex items-center justify-between">
          <p className="field-label">Confidence card{p.ccs != null && ` · CCS ${p.ccs}`}</p>
          {p.coverage != null && <CoverageChip pct={p.coverage} />}
        </div>
        {(p.beats ?? []).length > 0 && (
          <ol className="mt-2 space-y-0.5 text-[12.5px] text-ink-soft">
            {p.beats.map((b: string, i: number) => <li key={i}>· {b}</li>)}
          </ol>
        )}
        {rec.route && (
          <p className="mt-2 text-[13px]">
            <span className="font-bold">Route: {rec.route.replace(/_/g, " ")}</span>
            <span className="text-muted"> — {rec.reason}</span>
          </p>
        )}
        {p.cost_estimate_credits != null && (
          <p className="mono mt-1 text-[11.5px] text-muted">
            Est. {p.cost_estimate_credits} credits (~${p.cost_estimate_usd}) · draft-first offered on video
          </p>
        )}
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  if (artifact.type === "script_package") {
    const diff = p.diff ?? {};
    return (
      <div className="card p-4">
        <p className="field-label">Script package · route {String(p.route ?? "").replace(/_/g, " ")}</p>
        <div className="mt-2 space-y-1.5">
          {(p.shots ?? []).map((s: any) => (
            <div key={s.shot_id} className={`rounded-[12px] border p-2.5 ${diff[s.shot_id] ? "border-accent" : "border-line"} bg-paper`}>
              <p className="mono text-[10.5px] uppercase text-muted">{s.shot_id} · {s.duration_s}s · {s.boundary}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold">“{s.vo_segment}”</p>
              {diff[s.shot_id] && (
                <p className="mt-0.5 text-[11.5px] text-muted line-through">“{diff[s.shot_id].was}”</p>
              )}
              <p className="mt-0.5 text-[11.5px] text-ink-soft">{s.keyframe_prompt}</p>
            </div>
          ))}
        </div>
        <p className="mono mt-2 text-[10.5px] text-muted">
          locks: {p.consistency_plan?.wardrobe_lock} · {p.consistency_plan?.lighting_lock}
        </p>
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  if (artifact.type === "voice_options") {
    return (
      <div className="card p-4">
        <p className="field-label">Voice options</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(p.voices ?? []).map((v: any) => (
            <div key={v.id} className="rounded-[12px] border border-line bg-paper p-2.5">
              <p className="text-[12.5px] font-semibold">{v.label}</p>
              {v.preview_url ? (
                <audio controls preload="none" src={media(v.preview_url)} className="mt-1 h-8 w-full" />
              ) : (
                <p className="text-[11px] italic text-muted">no preview</p>
              )}
            </div>
          ))}
        </div>
        {p.note && <p className="mt-1.5 text-[11px] text-muted">{p.note}</p>}
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  if (artifact.type === "asset_prompt") {
    return <AssetPromptCard artifact={artifact} onAction={onAction} busy={busy} />;
  }

  if (artifact.type === "asset_set") {
    return (
      <div className="card p-4">
        <p className="field-label">{artifact.title}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(p.items ?? []).map((it: any) => (
            <div key={it.asset_id} className="rounded-[12px] border border-line bg-paper p-2">
              <p className="mono text-[10px] uppercase text-muted">{it.slot} {it.cost > 0 && `· $${it.cost.toFixed(2)}`}</p>
              {it.kind === "video" && it.preview_url && (
                <video controls muted preload="metadata" src={media(it.preview_url)} className="mt-1 max-h-52 w-full rounded-[8px] bg-ink" />
              )}
              {it.kind === "image" && it.preview_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media(it.preview_url)} alt={it.slot} className="mt-1 max-h-52 w-full rounded-[8px] object-cover" />
              )}
              {it.kind === "audio" && it.preview_url && (
                <audio controls preload="none" src={media(it.preview_url)} className="mt-1 h-8 w-full" />
              )}
              {it.note && <p className="mt-1 text-[11.5px] text-ink-soft">{it.note}</p>}
            </div>
          ))}
        </div>
        <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
      </div>
    );
  }

  if (artifact.type === "post_card") {
    const pc = p.post_content ?? {};
    return (
      <div className="card border-l-4 border-l-accent p-4">
        <div className="flex items-center justify-between">
          <p className="field-label">Post Card · {p.status?.toUpperCase()} · {p.total_cost_credits} credits</p>
          <span className="chip">{(p.platforms ?? []).map((x: string) => PLATFORM_LABELS[x] ?? x).join(" · ")}</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {(p.media ?? []).map((m: any, i: number) => (
            <div key={i} className="w-36 shrink-0">
              {m.kind === "video" && <video controls muted preload="metadata" src={media(m.url)} className="max-h-40 w-full rounded-[8px] bg-ink" />}
              {m.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media(m.url)} alt="" className="max-h-40 w-full rounded-[8px] object-cover" />
              )}
              {m.kind === "audio" && <audio controls preload="none" src={media(m.url)} className="h-8 w-full" />}
              <p className="mono mt-0.5 text-[9.5px] text-muted">{m.params?.prompt_id} · ${m.params?.cost?.toFixed?.(2) ?? "0"}</p>
            </div>
          ))}
        </div>
        {Object.entries(pc.caption_variants ?? {}).map(([plat, text]) => (
          <div key={plat} className="mt-2 rounded-[10px] bg-paper p-2.5">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase text-muted">Caption · {PLATFORM_LABELS[plat] ?? plat}</p>
              <button className="btn btn-ghost !px-2 !py-0.5 !text-[11px]"
                      onClick={() => navigator.clipboard?.writeText(`${text}\n\n${(pc.hashtags ?? []).join(" ")}`)}>
                Copy
              </button>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px]">{String(text)}</p>
          </div>
        ))}
        <p className="mt-1.5 text-[11.5px] text-muted">{(pc.hashtags ?? []).join(" ")} · CTA: {pc.cta}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a className="btn btn-primary !px-3 !py-1" href={`${API_URL}/api/post-cards/${p.id}/bundle`}>
            Download bundle
          </a>
          {p.status !== "posted" && (
            <button className="btn btn-ghost !px-3 !py-1" disabled={busy} onClick={() => onAction(artifact.id, "mark_posted")}>
              Mark Posted
            </button>
          )}
        </div>
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

function AssetPromptCard({
  artifact,
  onAction,
  busy,
}: {
  artifact: ArtifactEnvelope;
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
}) {
  const p = artifact.payload ?? {};
  const editable = p.asset_slot !== "all" && p.asset_slot !== "rest";
  const [text, setText] = useState<string>(p.prompt_text ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="field-label">{artifact.title}</p>
        <span className="mono text-[11px] text-muted">{p.model} · ${Number(p.cost).toFixed(2)}</span>
      </div>
      {editable ? (
        <>
          {/* §08 rule 7: edited text is used VERBATIM */}
          <textarea
            className="input mt-1.5 min-h-[56px] text-[12.5px]"
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(false); }}
            aria-label={`Prompt for ${p.asset_slot}`}
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              className="btn btn-ghost !px-2.5 !py-1 !text-[11.5px]"
              disabled={busy || text === p.prompt_text}
              onClick={async () => {
                await fetch(`${API_URL}/api/threads/${window.location.pathname.split("/").pop()}/prompts/${p.asset_slot}`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt_text: text }),
                });
                setSaved(true);
              }}
            >
              {saved ? "Saved — used verbatim" : "Save edit"}
            </button>
            {(p.locks ?? []).length > 0 && (
              <span className="mono truncate text-[9.5px] text-muted" title={(p.locks ?? []).join("; ")}>
                locks applied
              </span>
            )}
          </div>
        </>
      ) : (
        p.note && <p className="mt-1 text-[12px] text-ink-soft">{p.note}</p>
      )}
      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Concept,
  ConceptState,
  ConceptVerdict,
  ELEMENT_LABELS,
  Option,
  PLATFORM_LABELS,
  WEIGHTS,
  familyOf,
} from "@/lib/api";
import { CcsBadge, EvidencePill, RatingBadge } from "./evidence";

export function ConceptCard({
  concept,
  verdict,
  options,
  state,
  objective,
  onApprove,
  onUnapprove,
  onRegenerate,
  busy,
}: {
  concept: Concept;
  verdict?: ConceptVerdict;
  options?: Option[];
  state?: ConceptState;
  objective: string;
  onApprove: () => void;
  onUnapprove: () => void;
  onRegenerate: (feedback: string) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const weights = WEIGHTS[familyOf(objective)];
  const status = state?.approved ? "approved" : (state?.status ?? "qualified");
  const verdictBy = new Map(verdict?.element_verdicts.map((v) => [v.element, v]) ?? []);

  return (
    <div className="card overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip">{concept.format.replace(/_/g, " ")}</span>
            <span className="chip">{PLATFORM_LABELS[concept.platform] ?? concept.platform}</span>
            <span className="chip">effort {concept.effort}</span>
            {concept.slot_date && <span className="chip">slot {concept.slot_date}</span>}
            {state && state.regen_count > 0 && (
              <span className="chip">regen ×{state.regen_count}</span>
            )}
          </div>
          <h3 className="mt-2 text-[16.5px] font-bold leading-snug">{concept.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{concept.description}</p>
        </div>
        {state && <CcsBadge ccs={state.ccs} status={status} />}
      </div>

      {/* hook + creative direction */}
      <div className="grid grid-cols-2 gap-3 border-t border-line bg-paper/60 px-5 py-3">
        <div>
          <p className="field-label">Hook</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-snug">“{concept.hook.verbal}”</p>
          <p className="mt-0.5 text-[12px] text-muted">First frame: {concept.hook.first_frame}</p>
        </div>
        <div>
          <p className="field-label">Creative direction</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{concept.creative_direction}</p>
          <p className="mt-0.5 text-[12px] text-muted">CTA: {concept.cta}</p>
        </div>
      </div>

      {/* kill flags */}
      {verdict && verdict.kill_flags.length > 0 && (
        <div className="border-t border-line bg-low-wash px-5 py-2.5 text-[12.5px] font-semibold text-low">
          Kill flags: {verdict.kill_flags.join(", ")} — options blocked until fixed
        </div>
      )}

      {/* element table */}
      {expanded && (
        <div className="border-t border-line px-5 py-4">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 pr-3 font-semibold">Element (wt)</th>
                <th className="pb-2 pr-3 font-semibold">Rating</th>
                <th className="pb-2 pr-3 font-semibold">How it&apos;s addressed</th>
                <th className="pb-2 font-semibold">Evidence</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {concept.element_scores.map((score) => {
                const ev = verdictBy.get(score.element);
                const finalRating = ev?.final_rating ?? score.proposed_rating;
                return (
                  <tr key={score.element} className="border-t border-line">
                    <td className="py-2.5 pr-3 text-[12.5px] font-semibold">
                      {ELEMENT_LABELS[score.element]}{" "}
                      <span className="text-muted">({weights[score.element] ?? "—"})</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <RatingBadge
                        rating={score.addressed ? (finalRating ?? null) : null}
                        downgraded={ev?.verdict === "downgrade"}
                        upgraded={ev?.verdict === "upgrade"}
                      />
                      {ev?.verdict !== "agree" && ev?.reason && (
                        <p className="mt-1 max-w-[160px] text-[11.5px] leading-snug text-muted">
                          {ev.reason}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[12.5px] leading-snug text-ink-soft">
                      {score.addressed ? score.how_addressed : (
                        <span className="italic text-muted">not addressed — {score.why_not}</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-col gap-1">
                        {score.evidence.map((e, i) => (
                          <EvidencePill key={i} ev={e} />
                        ))}
                        {(ev?.evidence ?? []).map((e, i) => (
                          <EvidencePill key={`v${i}`} ev={e} />
                        ))}
                        {ev?.evidence_gap && (
                          <span className="text-[11.5px] italic text-muted">no evidence in DB</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* red-team lenses + fixes */}
          {verdict && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-paper p-3 text-[12px] leading-relaxed text-ink-soft">
                <p className="field-label mb-1">Red-team lenses</p>
                <p>
                  Saturation: {verdict.lenses.saturation.similar_count} similar in DB
                  {verdict.lenses.saturation.source_id && (
                    <span className="mono text-muted"> [{verdict.lenses.saturation.source_id}]</span>
                  )}
                </p>
                <p>Claims safety: {verdict.lenses.claims_safety}</p>
                <p>Feasibility: {verdict.lenses.feasibility}</p>
                <p>Platform policy: {verdict.lenses.platform_policy}</p>
              </div>
              {verdict.fixes.length > 0 && (
                <div className="rounded-[12px] bg-trend-wash p-3 text-[12px] leading-relaxed">
                  <p className="field-label mb-1">Fixes (by impact)</p>
                  <ol className="list-inside list-decimal space-y-0.5 text-ink-soft">
                    {verdict.fixes.map((fix) => (
                      <li key={fix.priority}>{fix.change}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* options — creative work always ships as choices, never a single take */}
      {options && options.length === 3 && (
        <div className="border-t border-line px-5 py-4">
          <p className="field-label mb-2">3 options — distinct angles, each scored</p>
          <div className="grid grid-cols-3 gap-3">
            {options.map((option) => (
              <div key={option.option_id} className="rounded-[12px] border border-line bg-paper p-3">
                <div className="flex items-center justify-between">
                  <span className="display text-[13px] font-bold text-accent">
                    {option.option_id}
                  </span>
                  <span className="mono text-[11px] text-muted">CCS {option.ccs}</span>
                </div>
                <p className="mt-1 text-[12.5px] font-semibold leading-snug">{option.angle_label}</p>
                <p className="mt-1 text-[12px] leading-snug text-ink-soft">“{option.hook.verbal}”</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                  {option.creative_direction_delta}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-2 border-t border-line bg-paper/60 px-5 py-3">
        <button className="btn btn-ghost !px-3 !py-1.5" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide scoresheet" : "Show scoresheet"}
        </button>
        {state?.approved ? (
          <button className="btn btn-ghost !px-3 !py-1.5" onClick={onUnapprove} disabled={busy}>
            Unapprove
          </button>
        ) : (
          <button
            className="btn btn-primary !px-3 !py-1.5"
            onClick={onApprove}
            disabled={busy || status === "rework"}
            title={status === "rework" ? "Rework concepts can't be approved — regenerate first" : ""}
          >
            Approve
          </button>
        )}
        <button
          className="btn btn-ghost !px-3 !py-1.5"
          onClick={() => setFeedbackOpen(!feedbackOpen)}
          disabled={busy}
        >
          Feedback & regenerate
        </button>
        <span
          className="btn btn-ghost !px-3 !py-1.5 cursor-not-allowed opacity-50"
          title="Creative Studio arrives in Phase 2"
        >
          → Creative Studio
        </span>
      </div>

      {feedbackOpen && (
        <div className="border-t border-line px-5 py-3">
          <textarea
            className="input min-h-[64px]"
            placeholder="What should change? e.g. 'hook feels generic — anchor it to a money number'"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <button
              className="btn btn-primary !px-3 !py-1.5"
              disabled={busy || !feedbackText.trim()}
              onClick={() => {
                onRegenerate(feedbackText.trim());
                setFeedbackOpen(false);
                setFeedbackText("");
              }}
            >
              Regenerate this concept
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

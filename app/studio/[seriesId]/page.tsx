"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InspirationCard, Series, api } from "@/lib/api";
import { ConceptCard } from "@/components/concept-card";
import { InspirationCardView } from "@/components/inspiration-card";
import { RunProgress } from "@/components/run-progress";

type Stage = "context" | "inspiration" | "plan" | "concepts";

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "context", label: "Context", hint: "what the engine learned" },
  { id: "inspiration", label: "Inspiration", hint: "reference set" },
  { id: "plan", label: "Plan", hint: "timeline of concepts" },
  { id: "concepts", label: "Concepts & options", hint: "review + approve" },
];

export default function StudioPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = use(params);
  const search = useSearchParams();
  const [stage, setStage] = useState<Stage>((search.get("stage") as Stage) || "context");
  const [series, setSeries] = useState<Series | null>(null);
  const [inspiration, setInspiration] = useState<InspirationCard[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSeries(await api.series.get(seriesId));
    } catch (e: any) {
      setError(e.message);
    }
  }, [seriesId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (stage === "inspiration" && inspiration === null) {
      api.series
        .inspiration(seriesId)
        .then((r) => setInspiration(r.cards))
        .catch((e) => setError(e.message));
    }
  }, [stage, inspiration, seriesId]);

  const bundle = series?.plan_bundle ?? null;
  const states = useMemo(
    () => new Map((series?.concept_states ?? []).map((s) => [s.concept_id, s])),
    [series]
  );
  const verdicts = useMemo(
    () => new Map(bundle?.feedback?.concept_verdicts.map((v) => [v.concept_id, v]) ?? []),
    [bundle]
  );
  const optionsBy = useMemo(
    () => new Map(bundle?.options?.concept_options.map((o) => [o.concept_id, o.options]) ?? []),
    [bundle]
  );

  const orderedConcepts = useMemo(() => {
    if (!bundle) return [];
    const order = new Map((series?.concept_states ?? []).map((s) => [s.concept_id, s.order_idx]));
    return [...bundle.plan.concepts].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  }, [bundle, series]);

  // drag & drop reorder
  const [dragId, setDragId] = useState<string | null>(null);
  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = orderedConcepts.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDragId(null);
    await api.series.reorder(seriesId, ids);
    reload();
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await api.series.generate(seriesId);
      setRunId(run_id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const onRunDone = useCallback(
    (_ok: boolean) => {
      setRunId(null);
      setBusy(false);
      reload();
    },
    [reload]
  );

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (conceptId: string, feedback: string) => {
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await api.series.regenerate(seriesId, conceptId, feedback);
      setRunId(run_id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!series)
    return (
      <p className="text-muted">
        {error ? `Couldn't load series: ${error}` : "Loading…"}
      </p>
    );

  const context = series.context;
  const approved = (series.concept_states ?? []).filter((s) => s.approved).length;
  const total = (series.concept_states ?? []).length;

  return (
    <div className="flex gap-8">
      {/* stage sidebar */}
      <aside className="w-52 shrink-0">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Content Studio</p>
        <h1 className="display mt-1 text-[19px] font-bold leading-snug">{series.name}</h1>
        <p className="mt-1 text-[12px] text-muted">
          {context.mode === "series" ? "Series" : "One-time campaign"} · {context.objective}
          {total > 0 && <> · {approved}/{total} approved</>}
        </p>
        <nav className="mt-5 space-y-1">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={
                "block w-full rounded-[12px] px-3 py-2 text-left transition-colors " +
                (stage === s.id ? "bg-accent-wash text-accent-deep" : "hover:bg-card")
              }
            >
              <span className="mono mr-2 text-[11px] text-muted">{i + 1}</span>
              <span className="text-[13.5px] font-semibold">{s.label}</span>
              <p className="ml-6 text-[11px] text-muted">{s.hint}</p>
            </button>
          ))}
        </nav>
        <Link href="/plans" className="mt-6 block text-[12.5px] text-muted hover:text-accent">
          ← All plans
        </Link>
      </aside>

      {/* stage content */}
      <div className="min-w-0 flex-1 space-y-4">
        {error && (
          <div className="rounded-[12px] bg-low-wash px-4 py-3 text-[13px] font-semibold text-low">
            {error}
          </div>
        )}

        {stage === "context" && (
          <div className="space-y-4">
            <section className="card p-6">
              <h3 className="text-[15px] font-bold">What the engine learned</h3>
              <p className="guideline mt-0.5">Extraction echo from the intake step — this feeds every agent call.</p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <p className="field-label">Structured context</p>
                  <ul className="mt-1.5 space-y-1 text-ink-soft">
                    <li>Content area: <b>{context.content_area}</b></li>
                    <li>Objective: <b>{context.objective}</b> (planner optimizes this one)</li>
                    <li>Audience: <b>{context.target_audience ?? "—"}</b></li>
                    <li>Platforms: <b>{(context.platforms ?? []).join(", ")}</b></li>
                    <li>
                      Cadence:{" "}
                      <b>
                        {context.cadence?.type === "series"
                          ? `${context.cadence.posts_per_week}/wk × ${context.cadence.weeks} wks`
                          : `${context.cadence?.concept_count} concepts`}
                      </b>
                    </li>
                    <li>Content type: <b>{context.content_type}</b></li>
                  </ul>
                </div>
                <div>
                  <p className="field-label">Style extracted</p>
                  {(context.style_notes ?? []).length > 0 ? (
                    <ul className="mt-1.5 list-inside list-disc space-y-1 text-ink-soft">
                      {context.style_notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-1.5 italic text-muted">No uploads — nothing extracted.</p>
                  )}
                  {(context.upload_extractions ?? []).map((u: any, i: number) => (
                    <p key={i} className="mt-2 text-[12px] text-muted">
                      <span className="mono">{u.filename}</span>: {u.observations.join("; ")}
                    </p>
                  ))}
                  {(context.clarifying_questions ?? []).length > 0 && (
                    <div className="mt-3 rounded-[12px] bg-trend-wash p-3">
                      <p className="field-label">The engine would ask</p>
                      {context.clarifying_questions.map((q: string, i: number) => (
                        <p key={i} className="mt-1 text-[12.5px] text-ink-soft">{q}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
            <div className="flex justify-end">
              <button className="btn btn-primary" onClick={() => setStage("inspiration")}>
                Next: inspiration →
              </button>
            </div>
          </div>
        )}

        {stage === "inspiration" && (
          <div className="space-y-4">
            <div className="rounded-[12px] border border-line bg-principle-wash px-4 py-3 text-[13px] text-ink-soft">
              <b>Sample data — pipeline pending.</b> These cards come through the live retrieval
              contract, but the corpus is curated sample data and selection is disabled until the
              inspiration pipeline ships. No fake liveness.
            </div>
            {inspiration === null ? (
              <p className="text-muted">Retrieving references…</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {inspiration.map((card) => (
                  <InspirationCardView key={card.source_id} card={card} />
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button className="btn btn-primary" onClick={() => setStage("plan")}>
                Next: build the plan →
              </button>
            </div>
          </div>
        )}

        {(stage === "plan" || stage === "concepts") && (
          <div className="space-y-4">
            {runId && <RunProgress runId={runId} onDone={onRunDone} />}

            {!bundle && !runId && (
              <section className="card p-8 text-center">
                <h3 className="display text-[18px] font-bold">Ready to plan</h3>
                <p className="mx-auto mt-2 max-w-md text-[13.5px] text-ink-soft">
                  The planner drafts {context.cadence?.type === "series"
                    ? `${context.cadence.posts_per_week * context.cadence.weeks} concepts`
                    : `${context.cadence?.concept_count} angle concepts`} with evidence, a red-team
                  agent judges every element, flagged concepts get one refine pass, and every
                  qualified concept ships with 3 creative options.
                </p>
                <button className="btn btn-primary mt-5 !px-8 !py-2.5" onClick={generate} disabled={busy}>
                  Generate plan
                </button>
              </section>
            )}

            {bundle && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="display text-[18px] font-bold">
                      {stage === "plan" ? "Plan timeline" : "Concepts & options"}
                    </h2>
                    <p className="text-[12.5px] text-muted">
                      {bundle.plan.series.pillar_mix && <>Pillar mix: {bundle.plan.series.pillar_mix} · </>}
                      North star: {bundle.plan.series.north_star_metric} · drag cards to reorder
                    </p>
                  </div>
                  <button className="btn btn-ghost" onClick={generate} disabled={busy || !!runId}>
                    Regenerate whole plan
                  </button>
                </div>

                {bundle.plan.changes.length > 0 && (
                  <div className="rounded-[12px] border border-line bg-ref-wash px-4 py-2.5 text-[12.5px] text-ink-soft">
                    <b>Refine pass:</b> {bundle.plan.changes.join(" · ")}
                  </div>
                )}

                <div className="space-y-4">
                  {orderedConcepts.map((concept) => (
                    <div
                      key={concept.id}
                      draggable
                      onDragStart={() => setDragId(concept.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(concept.id)}
                      onDragEnd={() => setDragId(null)}
                      className={dragId === concept.id ? "dragging" : ""}
                    >
                      <ConceptCard
                        concept={concept}
                        verdict={verdicts.get(concept.id)}
                        options={optionsBy.get(concept.id)}
                        state={states.get(concept.id)}
                        objective={context.objective}
                        busy={busy || !!runId}
                        onApprove={() => act(() => api.series.approve(seriesId, concept.id))}
                        onUnapprove={() => act(() => api.series.unapprove(seriesId, concept.id))}
                        onRegenerate={(fb) => regenerate(concept.id, fb)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

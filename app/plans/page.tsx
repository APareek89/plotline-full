"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, Series, api } from "@/lib/api";

// §12 + Addendum-02 §01: Plans = series home. Slot lifecycle Planned → In
// production → Ready → Posted; "Generate next post" opens the next Creative
// Studio thread; posted slots >72h without results get a paste nudge.
const PROD_LABEL: Record<string, [string, string]> = {
  planned: ["Planned", "!border-line !text-muted"],
  in_production: ["In production", "!border-amber-500 !text-amber-700"],
  ready: ["Ready", "!border-emerald-600 !text-emerald-700"],
  posted: ["Posted", "!border-ink !text-ink"],
};

export default function PlansPage() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [states, setStates] = useState<Record<string, any[]>>({});
  const [cards, setCards] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.series.list().then(async (list) => {
      setSeries(list);
      const st: Record<string, any[]> = {};
      const pc: Record<string, any[]> = {};
      await Promise.all(list.slice(0, 10).map(async (s) => {
        const full = await api.series.get(s.id).catch(() => null);
        st[s.id] = full?.concept_states ?? [];
        pc[s.id] = await fetch(`${API_URL}/api/post-cards?series_id=${s.id}`).then((r) => r.json()).catch(() => []);
      }));
      setStates(st);
      setCards(pc);
    }).catch((e) => setError(e.message));
  }, []);

  const generateNext = async (seriesId: string) => {
    const slots = states[seriesId] ?? [];
    const next = slots.find((c) => (c.production_status ?? "planned") === "planned" && c.approved)
      ?? slots.find((c) => (c.production_status ?? "planned") === "planned");
    if (!next) return alert("No planned concepts left — plan more in the Content Studio thread.");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/series/${seriesId}/concepts/${next.concept_id}/produce`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option: "A" }),
      }).then((r) => r.json());
      if (res.thread?.id) router.push(`/studio/thread/${res.thread.id}`);
      else if (res.post_card) alert("Text-only concept — Post Card created directly (see My Space).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Plans</p>
          <h1 className="display mt-1 text-2xl font-bold">Your series & campaigns</h1>
        </div>
        <Link href="/studio" className="btn btn-primary">+ New series</Link>
      </div>

      {error && (
        <div className="rounded-[12px] bg-low-wash px-4 py-3 text-[13px] font-semibold text-low">
          Can&apos;t reach plotline-api: {error}
        </div>
      )}

      {series && series.length === 0 && (
        <div className="card p-10 text-center">
          <h3 className="display text-[17px] font-bold">No plans yet</h3>
          <p className="mt-2 text-[13.5px] text-muted">
            Start in the Content Studio — name your series, teach the engine, and get an
            evidence-backed plan.
          </p>
          <Link href="/studio" className="btn btn-primary mt-5 inline-flex">Start a plan</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {(series ?? []).map((s) => {
          const statusLabel =
            s.status === "locked"
              ? "Plan locked"
              : s.status === "awaiting_review"
                ? "Awaiting review"
                : s.status === "planning"
                  ? "Planning…"
                  : "Setup in progress";
          return (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-bold">{s.name}</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {s.context?.mode === "series" ? "Series" : "One-time campaign"} ·{" "}
                    {s.context?.objective} · {s.context?.content_area}
                  </p>
                </div>
                <span className="chip">{statusLabel}</span>
              </div>
              {typeof s.concept_total === "number" && s.concept_total > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(100 * (s.concept_approved ?? 0)) / s.concept_total}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">
                    {s.concept_approved}/{s.concept_total} concepts approved
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(states[s.id] ?? []).map((c) => {
                      const [label, cls] = PROD_LABEL[c.production_status ?? "planned"] ?? PROD_LABEL.planned;
                      const card = (cards[s.id] ?? []).find((pc) => pc.concept_id === c.concept_id);
                      const nudge = card?.status === "posted" && !card.results_pasted &&
                        Date.now() / 1000 - (card.posted_at ?? 0) > 72 * 3600;
                      return (
                        <span key={c.concept_id} className={`chip ${cls}`}
                              title={nudge ? "Posted >72h — paste results in My Space to feed the next plan" : label}>
                          {c.concept_id} · {label}{nudge ? " · results?" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/studio/${s.id}?stage=${s.concept_total ? "plan" : "context"}`}
                  onClick={async (e) => {
                    e.preventDefault();
                    const threads = await (await fetch(`${API_URL}/api/series/${s.id}/threads`)).json().catch(() => []);
                    window.location.href = threads?.length
                      ? `/studio/thread/${threads[threads.length - 1].id}`
                      : `/studio/${s.id}?stage=${s.concept_total ? "plan" : "context"}`;
                  }}
                  className="btn btn-ghost !px-3 !py-1.5"
                >
                  Open plan
                </Link>
                <button
                  className="btn btn-primary !px-3 !py-1.5"
                  disabled={busy || !s.concept_total}
                  onClick={() => generateNext(s.id)}
                  title="Opens the next Creative Studio thread for this series"
                >
                  Generate next post
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

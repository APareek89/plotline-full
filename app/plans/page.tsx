"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, Series, api } from "@/lib/api";

// §12: Plans = all named series/campaigns with status. Returning users start
// here: "Generate next post" → Creative Studio (Phase 2), "Open plan" → timeline.
export default function PlansPage() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.series.list().then(setSeries).catch((e) => setError(e.message));
  }, []);

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
                <span
                  className="btn btn-ghost !px-3 !py-1.5 cursor-not-allowed opacity-50"
                  title="Jumps into a Creative Studio thread — arrives in Phase 2"
                >
                  Generate next post
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

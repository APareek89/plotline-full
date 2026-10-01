"use client";

// v3 §6 — MY BRAND. The workspace's canon library: the cast, products,
// environments and voices every campaign draws on.
//
// Why this is a top-level tab and not a modal inside a thread: canon sheets are
// WORKSPACE-GLOBAL, not campaign-scoped. That is the retention mechanic — the
// second campaign is materially cheaper than the first precisely because these
// already exist, and a thing that outlives the thread that created it needs a
// home outside that thread.
//
// The page is deliberately honest about emptiness: a workspace with no canon
// says what canon IS and where it comes from, rather than showing an empty grid
// and leaving the user to guess.

import { useCallback, useEffect, useState } from "react";
import ProviderBadge from "@/components/provider-badge";
import { API_URL, req } from "@/lib/api";

type CanonSheet = {
  provider?: string | null;
  model?: string | null;
  id: string;
  kind: "character" | "product" | "environment" | "voice";
  label: string;
  brief: string;
  asset_ids: string[];
  coverage: Record<string, boolean>;
  locks: string[];
  slot_cost: number;
  risk_notes: string[];
  rights: "owned" | "consented" | "fictional" | "unverified";
  version: number;
  _first_campaign_id?: string | null;
};

const KINDS = ["character", "product", "environment", "voice"] as const;

const KIND_BLURB: Record<string, string> = {
  character: "People who recur across shots. Locks keep them the same person.",
  product: "The thing itself. Hardest to keep honest — packaging text most of all.",
  environment: "Places. Light direction and time of day are what drift.",
  voice: "Auditioned on the real line, never on a demo reel.",
};

export default function BrandPage() {
  const [sheets, setSheets] = useState<CanonSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await req<{ sheets: CanonSheet[] }>("/api/canon");
      setSheets(data.sheets ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSheets([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await req(`/api/canon/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this item.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ms-dark min-h-screen px-6 py-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-[20px] font-bold">My Brand</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--ms-text-2,#A6B0C0)]">
          Canon is what keeps the same person, the same product and the same place across
          every shot and every campaign. Sheets are created by a campaign that needs them
          and then belong to the workspace — the next campaign reuses them instead of
          paying to render them again.
        </p>

        {/* ERROR state, named explicitly — §12 rule 3 */}
        {error && (
          <div className="card mt-5 border-l-[3px] border-l-[var(--ms-danger,#FFFFFF)] p-4">
            <p className="text-[13px] font-semibold">Can&apos;t reach the canon library</p>
            <p className="mt-1 text-[12.5px] text-[var(--ms-text-2,#A6B0C0)]">{error}</p>
            <button className="btn mt-3" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {/* LOADING state */}
        {sheets === null && !error && (
          <p className="mt-6 text-[13px] text-[var(--ms-text-2,#A6B0C0)]">
            Loading the canon library…
          </p>
        )}

        {/* EMPTY state — says what is missing and where it comes from */}
        {sheets?.length === 0 && !error && (
          <div className="card mt-5 border-dashed p-6">
            <p className="text-[14px] font-semibold">No canon yet</p>
            <p className="mt-1.5 max-w-[62ch] text-[12.5px] text-[var(--ms-text-2,#A6B0C0)]">
              Canon sheets are planned from a shot board — the board names which characters,
              products and places the campaign needs, and only those get made. Run a campaign
              as far as the board and the sheets it needs will appear here.
            </p>
            <p className="mt-3 text-[12px] text-[var(--ms-text-2,#A6B0C0)]">
              Skipping canon is allowed and costs less up front. It also means identity drifts
              after roughly three shots — which is the trade, stated rather than hidden.
            </p>
          </div>
        )}

        {sheets && sheets.length > 0 && (
          <div className="mt-6 space-y-7">
            {KINDS.map((kind) => {
              const rows = sheets.filter((s) => s.kind === kind);
              if (!rows.length) return null;
              return (
                <section key={kind}>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-[14px] font-bold capitalize">{kind}</h2>
                    <span className="text-[11.5px] text-[var(--ms-text-2,#A6B0C0)]">
                      {KIND_BLURB[kind]}
                    </span>
                  </div>
                  <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((s) => {
                      const views = Object.keys(s.coverage ?? {});
                      const have = views.filter((v) => s.coverage[v]).length;
                      const complete = views.length > 0 && have === views.length;
                      return (
                        <div key={s.id} className="card overflow-hidden p-0">
                          {s.asset_ids?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`${API_URL}/api/assets/${s.asset_ids[0]}/file`}
                              alt={s.label}
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-square items-center justify-center text-[11.5px] text-[var(--ms-text-2,#A6B0C0)]">
                              {s.kind === "voice" ? "auditioned, not viewed" : "no views yet"}
                            </div>
                          )}
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-mono text-[12px] font-bold text-[var(--ms-blue-text,#A3AEFF)]">
                                {s.id}
                              </p>
                              <span className="chip">v{s.version}</span>
                            </div>
                            <p className="mt-1 text-[12.5px] leading-snug">{s.brief}</p>
                            <ProviderBadge provider={s.provider} model={s.model} />

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {s.kind !== "voice" && (
                                <span className={`chip ${complete ? "" : "!border-amber-500"}`}>
                                  {have}/{views.length || "—"} views
                                </span>
                              )}
                              <span
                                className="chip"
                                title="Reference slots this sheet consumes on a generation call (lint B3)"
                              >
                                {s.slot_cost} slot
                              </span>
                              <span
                                className={`chip ${
                                  s.rights === "unverified" ? "!border-red-500" : ""
                                }`}
                                title={
                                  s.rights === "unverified"
                                    ? "A real likeness with no consent record cannot be used"
                                    : undefined
                                }
                              >
                                {s.rights}
                              </span>
                            </div>

                            {s.locks?.length > 0 && (
                              <p className="mt-1.5 text-[11px] text-[var(--ms-text-2,#A6B0C0)]">
                                locks: {s.locks.join(" · ")}
                              </p>
                            )}
                            {s.risk_notes?.length > 0 && (
                              <p className="mt-1.5 border-l-2 border-[var(--ms-danger,#FFFFFF)] pl-2 text-[11px] text-[var(--ms-danger-text,#FFFFFF)]">
                                geometry risk: {s.risk_notes.join(", ")}
                              </p>
                            )}

                            <button
                              className="btn mt-3 w-full"
                              disabled={busy === s.id}
                              onClick={() => void remove(s.id)}
                              title="Campaigns that already used this sheet keep their assets. What you lose is the reuse — the next campaign re-renders it."
                            >
                              {busy === s.id ? "Removing…" : "Remove from library"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

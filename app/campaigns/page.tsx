"use client";

// v2 §MY CAMPAIGNS (main tab 2): campaign rows — name, objective, status
// lifecycle (Draft → Planned → In production → Ready → Live), creative count,
// spend-to-date in credits; CTAs Open + Generate next creative. Live rows carry
// the results-paste nudge (CTR/CPC/CPA/ROAS → performance memory, keyed
// brand × angle × format × placement).
//
// Theme: the page wraps itself in `.ms-dark` and then just uses the shared
// primitives (.card/.chip/.btn/.input) — globals.css re-skins them for the dark
// surface, so there is no CSS here beyond the five lifecycle chip variants,
// which are Tailwind ms-* utilities. Light Phase-1 screens are untouched.
//
// Cost invariant: "Generate next creative" NEVER generates. It fires the
// campaign_detail artifact's generate_creative action, which answers with the
// model-confirm card (cost + single-vs-variants), then takes the user there.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdCard,
  AgentMessage,
  CAMPAIGN_STATUS_LABELS,
  CampaignRecord,
  CampaignStatus,
  CampaignSummary,
  OBJECTIVE_LABELS,
  PLATFORM_LABELS,
  api,
} from "@/lib/api";

const POLL_MS = 6000;
const STALE_H = 72; // v2: live >72h with no pasted results = honesty surface

interface PerfRow {
  id: string;
  series_id: string | null;
  concept_id: string | null;
  platform: string;
  metrics: Record<string, any>;
  pasted_at: number;
}

// Five distinct treatments. --ms-blue and --ms-danger are fill-only on this
// surface (3.2:1 / 4.0:1 as type), so the chips use the -text twins and the
// -wash fills, and Live inverts to a solid for the terminal state.
const CHIP: Record<CampaignStatus, { chip: string; dot: string; hint: string }> = {
  draft: {
    chip: "!text-muted",
    dot: "bg-ms-text-2",
    hint: "Intake cards aren't finished — no approved campaign detail yet.",
  },
  planned: {
    chip: "!border-ms-blue !bg-ms-blue-wash !text-ms-blue-text",
    dot: "bg-ms-blue-text",
    hint: "An option is approved and the campaign detail exists — ready to produce.",
  },
  in_production: {
    chip: "!border-ms-warn !bg-ms-warn-wash !text-ms-warn",
    dot: "bg-ms-warn animate-pulse motion-reduce:animate-none",
    hint: "Generation is running in this campaign's thread.",
  },
  ready: {
    chip: "!border-ms-ok !bg-ms-ok-wash !text-ms-ok",
    dot: "bg-ms-ok",
    hint: "Ad Card assembled — export the bundle or mark it live.",
  },
  live: {
    chip: "!border-transparent !bg-ms-ok !text-ms-bg !font-bold",
    dot: "bg-ms-bg",
    hint: "Running — paste results so performance memory learns.",
  },
};

const credits = (n: number | null | undefined) =>
  `${(Math.round((n ?? 0) * 10) / 10).toLocaleString()} credits`;

function ageLabel(epochSeconds: number): string {
  const h = (Date.now() / 1000 - epochSeconds) / 3600;
  return h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}d`;
}

// ------------------------------------------------------------------ page --

export default function CampaignsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CampaignSummary[] | null>(null);
  const [full, setFull] = useState<Record<string, CampaignRecord>>({});
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNudge, setOpenNudge] = useState<string | null>(null);

  const loadDetails = useCallback(async (list: CampaignSummary[]) => {
    // Threads (Open fallback) + ad cards (the nudge) only live on the detail
    // route, so it's fetched once per load — never on the poll.
    const entries = await Promise.all(
      list.slice(0, 24).map(
        async (c) => [c.id, await api.campaigns.get(c.id).catch(() => null)] as const
      )
    );
    setFull(Object.fromEntries(entries.filter((e): e is [string, CampaignRecord] => !!e[1])));
  }, []);

  const loadPerf = useCallback(() => {
    api.performance.list().then((r) => setPerf(r as PerfRow[])).catch(() => {});
  }, []);

  const loadList = useCallback(
    async (withDetails: boolean) => {
      try {
        const list = await api.campaigns.list();
        setRows(list);
        setError(null);
        if (withDetails && list.length) await loadDetails(list);
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setRows((prev) => prev ?? []);
      }
    },
    [loadDetails]
  );

  useEffect(() => {
    loadList(true);
    loadPerf();
    const iv = setInterval(() => loadList(false), POLL_MS);
    return () => clearInterval(iv);
  }, [loadList, loadPerf]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      count: list.length,
      creatives: list.reduce((a, c) => a + (c.creative_count ?? 0), 0),
      spend: list.reduce((a, c) => a + (c.spend_credits ?? 0), 0),
      live: list.filter((c) => c.status === "live").length,
    };
  }, [rows]);

  const threadIdFor = (c: CampaignSummary): string | null => {
    if (c.thread_id) return c.thread_id;
    const ts = full[c.id]?.threads ?? [];
    return [...ts].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)).at(-1)?.id ?? null;
  };

  const say = (id: string, msg: string) => setNotes((n) => ({ ...n, [id]: msg }));

  const openCampaign = (c: CampaignSummary) => {
    const tid = threadIdFor(c);
    if (!tid) return say(c.id, "This campaign has no thread yet — start it from Campaign Studio.");
    router.push(`/studio/thread/${tid}?kind=campaign`);
  };

  const generateNext = async (c: CampaignSummary) => {
    const tid = threadIdFor(c);
    if (!tid) return say(c.id, "This campaign has no thread yet — start it from Campaign Studio.");
    setBusy(c.id);
    say(c.id, "");
    try {
      const t = await api.threads.get(tid);
      const detail = [...(t.messages ?? [])]
        .reverse()
        .flatMap((m) => (m.role === "agent" ? (m.envelope as AgentMessage).artifacts ?? [] : []))
        .find((a) => a.type === "campaign_detail");
      if (!detail) {
        // Defensive: status says producible but the thread holds no detail to
        // act on. Say so and stay here rather than navigating silently.
        say(c.id, "No campaign detail in the latest thread yet — open the campaign and approve an option first.");
        return;
      }
      await api.threads.sendAction(tid, detail.id, "generate_creative");
      router.push(`/studio/thread/${tid}?kind=campaign`);
    } catch (e: any) {
      say(c.id, `Couldn't start it: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
      loadList(true);
    }
  };

  const hasResults = (c: CampaignSummary) => {
    const cardIds = new Set((full[c.id]?.ad_cards ?? []).map((a) => a.id));
    return perf.some((p) => p.series_id === c.id || (p.concept_id ? cardIds.has(p.concept_id) : false));
  };

  const empty = rows !== null && rows.length === 0;

  return (
    <div className="ms-dark min-h-[calc(100vh-57px)] w-full px-6 py-5">
      {/* ---- header ---- */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
            Marketing Studio
          </p>
          <h1 className="display mt-0.5 text-[22px] font-bold">My campaigns</h1>
          {!!rows?.length && (
            <p className="mt-1 text-[12.5px] text-muted">
              {totals.count} campaign{totals.count === 1 ? "" : "s"} · {totals.creatives} creative
              {totals.creatives === 1 ? "" : "s"} · {credits(totals.spend)} spent
              {totals.live > 0 ? ` · ${totals.live} live` : ""}
            </p>
          )}
        </div>
        <Link href="/studio/campaign" className="btn btn-primary">
          + New campaign
        </Link>
      </div>

      {error && (
        <div className="card mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 !bg-ms-danger-wash !border-ms-danger px-4 py-3 text-[13px]">
          <span className="font-semibold text-ms-danger-text">Can&apos;t reach the campaigns API</span>
          <span className="text-muted">
            {error}
            {rows?.length ? " — the rows below are the last successful load." : ""}
          </span>
          <button className="btn btn-ghost !py-1 !text-[12.5px]" onClick={() => loadList(true)}>
            Retry
          </button>
        </div>
      )}

      {/* ---- empty state ---- */}
      {empty && !error && (
        <div className="card px-8 py-14 text-center">
          <h2 className="display text-[17px] font-bold">No campaigns yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
            Name a campaign, fill the product, campaign and brand cards, and the studio drafts
            options, a detail script and the creative.
          </p>
          <Link href="/studio/campaign" className="btn btn-primary mt-5">
            New campaign
          </Link>
        </div>
      )}

      {rows === null && !error && (
        <p className="py-10 text-center text-[13px] italic text-muted">Loading campaigns…</p>
      )}

      {/* ---- column header (wide only) ---- */}
      {!!rows?.length && (
        <div className="field-label mb-1.5 hidden items-center gap-4 px-4 lg:flex">
          <span className="min-w-0 flex-1">Campaign</span>
          <span className="w-[112px] shrink-0">Status</span>
          <span className="w-[86px] shrink-0 text-right">Creatives</span>
          <span className="w-[110px] shrink-0 text-right">Spend</span>
          <span className="w-[248px] shrink-0" />
        </div>
      )}

      {/* ---- rows ---- */}
      <div className="space-y-2">
        {(rows ?? []).map((c) => {
          const skin = CHIP[c.status] ?? CHIP.draft;
          const cards = full[c.id]?.ad_cards ?? [];
          const liveCards = cards.filter((a) => a.status === "live");
          const anchor = liveCards.length ? Math.max(...liveCards.map((a) => a.created_at ?? 0)) : 0;
          const results = hasResults(c);
          const stale =
            c.status === "live" && !results && anchor > 0 &&
            (Date.now() / 1000 - anchor) / 3600 > STALE_H;
          const canProduce = c.status !== "draft";
          const done = full[c.id]?.cards_done;
          const missing = done
            ? (["product", "campaign", "brand"] as const).filter((k) => !done[k])
            : [];

          return (
            <div key={c.id} className="card px-4 py-3 transition-colors hover:!bg-ms-elev">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:flex-nowrap">
                {/* name + objective */}
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => openCampaign(c)}
                    className="block max-w-full truncate text-left text-[15px] font-bold hover:underline"
                    title={c.name}
                  >
                    {c.name}
                  </button>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    {c.objective ? OBJECTIVE_LABELS[c.objective] ?? c.objective : "Objective not set"}
                    {missing.length > 0 && (
                      <span className="text-ms-warn">
                        {" "}
                        · {missing.length} card{missing.length === 1 ? "" : "s"} left ({missing.join(", ")})
                      </span>
                    )}
                  </p>
                </div>

                {/* lifecycle chip */}
                <div className="w-[112px] shrink-0">
                  <span className={`chip ${skin.chip}`} title={skin.hint}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${skin.dot}`} />
                    {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>

                {/* counts */}
                <div className="w-[86px] shrink-0 text-right text-[13px] tabular-nums">
                  {c.creative_count ?? 0}
                  <span className="text-muted lg:hidden"> creatives</span>
                </div>
                <div
                  className="w-[110px] shrink-0 text-right text-[13px] tabular-nums"
                  title="Spend to date across this campaign's threads"
                >
                  {credits(c.spend_credits)}
                </div>

                {/* CTAs */}
                <div className="flex w-[248px] shrink-0 justify-end gap-2">
                  <button
                    className="btn btn-ghost !px-3.5 !py-1.5"
                    onClick={() => openCampaign(c)}
                    title="Open the campaign's latest thread"
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-primary !px-3.5 !py-1.5"
                    disabled={!canProduce || busy === c.id}
                    onClick={() => generateNext(c)}
                    title={
                      canProduce
                        ? "Posts the cost + single-vs-variants confirmation into the thread — nothing generates until you confirm there"
                        : "No approved campaign detail yet — Open the campaign to finish the intake cards and approve an option"
                    }
                  >
                    {busy === c.id ? "Opening…" : "Generate next creative"}
                  </button>
                </div>
              </div>

              {/* the disabled reason lives in the row, not only in a tooltip */}
              {!canProduce && (
                <p className="mt-2 text-[12px] text-muted">
                  Generate next creative is off until an option is approved and a campaign detail
                  exists — Open is the action that gets you there.
                </p>
              )}

              {notes[c.id] && <p className="mt-2 text-[12px] text-ms-warn">{notes[c.id]}</p>}

              {/* ---- results-paste nudge (live only) ---- */}
              {c.status === "live" && (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="btn btn-ghost !py-1.5 !text-[12.5px]"
                      onClick={() => setOpenNudge(openNudge === c.id ? null : c.id)}
                    >
                      {openNudge === c.id ? "Hide results form" : "Paste results"}
                    </button>
                    {stale ? (
                      <span className="text-[12px] text-ms-warn">
                        Live ad card created {ageLabel(anchor)} ago — no results pasted yet.
                        Performance memory can&apos;t learn from this campaign until you paste them.
                      </span>
                    ) : results ? (
                      <span className="text-[12px] text-ms-ok">
                        Results logged — feeding performance memory.
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted">
                        CTR / CPC / CPA / ROAS keyed brand × angle × format × placement.
                      </span>
                    )}
                  </div>
                  {openNudge === c.id && (
                    <ResultsNudge
                      campaign={c}
                      cards={cards}
                      platforms={full[c.id]?.context?.campaign?.platforms ?? []}
                      stale={stale}
                      onSaved={() => {
                        loadPerf();
                        setOpenNudge(null);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------- results-paste form --

function ResultsNudge({
  campaign,
  cards,
  platforms,
  stale,
  onSaved,
}: {
  campaign: CampaignSummary;
  cards: AdCard[];
  platforms: string[];
  stale: boolean;
  onSaved: () => void;
}) {
  const liveCards = cards.filter((a) => a.status === "live");
  const pickable = liveCards.length ? liveCards : cards;
  const [cardId, setCardId] = useState<string>(pickable[0]?.id ?? "");
  const card = pickable.find((a) => a.id === cardId) ?? pickable[0];

  // Placements: where the creative actually ran, else the campaign's chosen
  // platforms, else the full list.
  const options = useMemo(() => {
    const fromCard = Object.keys(card?.placements ?? {});
    return fromCard.length ? fromCard : platforms.length ? platforms : Object.keys(PLATFORM_LABELS);
  }, [card, platforms]);

  const [platform, setPlatform] = useState<string>(options[0] ?? "instagram_feed");
  const [f, setF] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!options.includes(platform)) setPlatform(options[0] ?? "instagram_feed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join("|")]);

  const num = (v?: string): number | null => {
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const submit = async () => {
    const ctr = num(f.ctr), cpc = num(f.cpc), cpa = num(f.cpa), roas = num(f.roas);
    if (ctr === null && cpc === null && cpa === null && roas === null) {
      setErr("Enter at least one of CTR / CPC / CPA / ROAS.");
      return;
    }
    setErr(null);
    setState("saving");

    // The memory key, written verbatim so the row stays readable in My Space —
    // and so the numbers survive even if the route drops fields it doesn't
    // model yet.
    const angle = card?.option_id
      ? `${card.option_id}${card.variant_id ? `/${card.variant_id}` : ""}`
      : "unknown";
    const key =
      `brand=${campaign.name} · angle=${angle} · ` +
      `format=${card?.creative_type ?? "unknown"} · placement=${platform}`;
    const mirrored = [
      ctr !== null && `CTR ${ctr}%`,
      cpc !== null && `CPC ${cpc}`,
      cpa !== null && `CPA ${cpa}`,
      roas !== null && `ROAS ${roas}`,
    ]
      .filter(Boolean)
      .join(" · ");

    const body: Record<string, any> = {
      series_id: campaign.id, // a campaign IS a series row
      concept_id: card?.id ?? null, // the Ad Card this result belongs to
      campaign_id: campaign.id,
      ad_card_id: card?.id ?? null,
      platform,
      ctr_pct: ctr,
      cpc,
      cpa,
      roas,
      notes: [mirrored, key, f.notes?.trim()].filter(Boolean).join(" — "),
    };

    try {
      try {
        await api.performance.add(body);
      } catch (e: any) {
        // If the route still models only the v1 post metrics, retry with what
        // it does accept — `notes` above already carries the rest verbatim.
        if (!/^422/.test(e?.message ?? "")) throw e;
        const { campaign_id, ad_card_id, cpc: _c, cpa: _a, roas: _r, ...safe } = body;
        await api.performance.add(safe);
      }
      setState("saved");
      setF({});
      setTimeout(onSaved, 900);
    } catch (e: any) {
      setState("idle");
      setErr(`Couldn't save: ${e?.message ?? String(e)}`);
    }
  };

  const field = (key: string, label: string, placeholder: string) => (
    <div key={key}>
      <p className="field-label">{label}</p>
      <input
        className="input mt-1 !py-1.5"
        inputMode="decimal"
        placeholder={placeholder}
        value={f[key] ?? ""}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className={`card mt-2 !bg-ms-elev p-3 ${stale ? "!border-ms-warn" : ""}`}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {pickable.length > 0 && (
          <div>
            <p className="field-label">Ad card</p>
            <select
              className="input mt-1 !py-1.5"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            >
              {pickable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id}
                  {a.variant_id ? ` · ${a.variant_id}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <p className="field-label">Placement</p>
          <select
            className="input mt-1 !py-1.5"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {options.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        {field("ctr", "CTR %", "1.8")}
        {field("cpc", "CPC", "0.42")}
        {field("cpa", "CPA", "12.50")}
        {field("roas", "ROAS", "3.1")}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          className="input min-w-[200px] flex-1 !py-1.5"
          placeholder="Notes — what you'd change next round (optional)"
          value={f.notes ?? ""}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
        <button className="btn btn-primary" onClick={submit} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Logged ✓" : "Log results"}
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] text-ms-danger-text">{err}</p>}
      {pickable.length === 0 && (
        <p className="mt-2 text-[12px] text-muted">
          No Ad Card on this campaign yet — the result will be keyed to the campaign only.
        </p>
      )}
    </div>
  );
}

"use client";
import { Plus, Image, MoreVertical, Search } from "lucide-react";
import { session } from "@/lib/client/session";

// My Campaigns — a folder GRID, which Addendum-03 §02 always wanted and the
// row list never was. Owner decision 2026-08-26 made it the landing surface:
// Current / Archived, search, sort, and a per-card menu that can finally
// DELETE, because until now nothing could and a dev database reached 31 QA
// campaigns with no way to clear them.
//
// Theme: blue and white only. Status stopped being a hue — a lifecycle chip
// now reads by weight and wash, and the terminal state inverts. See the token
// block in globals.css.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignStatus, CampaignSummary, api } from "@/lib/api";
import { CampaignStyles, ErrorStrip, MsApiError, nameError } from "@/components/campaign-blocks";

const POLL_MS = 8000;

// Every campaign that has not reached a terminal state. "Archived" is derived,
// not stored: there is no archive flag on the server yet, so the tab shows the
// campaigns that are DONE rather than pretending a feature exists.
const TERMINAL: CampaignStatus[] = ["live"];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  planned: "Planned",
  in_production: "In production",
  ready: "Ready",
  live: "Live",
};

// One accent, one neutral, one inverted — no second hue anywhere.
function chipClass(status: string): string {
  if (status === "live") return "border-[var(--border-positive)] bg-[var(--bg-positive-translucent)] text-[var(--fg-positive)] font-semibold";
  if (status === "draft") return "border-[var(--ms-line)] text-[var(--ms-text-2)]";
  return "border-[var(--ms-blue)] bg-[var(--ms-blue-wash)] text-[var(--ms-blue-text)]";
}

export default function CampaignsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CampaignSummary[]>([]);
  const [tab, setTab] = useState<"current" | "archived">("current");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [menu, setMenu] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CampaignSummary | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api.campaigns
      .list()
      .then((r) => {
        setRows(r);
        setOffline(false);
      })
      .catch(() => setOffline(true))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) =>
      tab === "archived" ? TERMINAL.includes(r.status) : !TERMINAL.includes(r.status)
    );
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, tab, query, sort]);

  const nameProblem = naming ? nameError(name, rows) : null;

  async function create() {
    if (nameProblem || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const epoch = session.capture();
      const made = await api.campaigns.create(name.trim());
      session.assert(epoch);
      router.push(`/studio/thread/${made.thread.id}?kind=campaign`);
    } catch (e) {
      setError(e instanceof MsApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove(row: CampaignSummary) {
    setBusy(true);
    setError(null);
    try {
      await api.campaigns.remove(row.id);
      setConfirming(null);
      setRows((r) => r.filter((x) => x.id !== row.id));
    } catch (e) {
      setError(e instanceof MsApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="campaign-browse ms-dark min-h-[calc(100dvh-53.5px)] bg-[var(--ms-bg)] px-10 py-8 text-[var(--ms-text)]"
      onClick={() => setMenu(null)}
    >
      <CampaignStyles />

      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-[-0.02em]">Campaigns</h1>
          <p className="mt-1.5 text-[14px] text-[var(--ms-text-2)]">
            Brief once. The agent builds the rest.
          </p>
        </div>
        <label className="flex h-10 w-[330px] items-center gap-2 rounded-[12px] border border-[var(--ms-line)] bg-[var(--ms-surface)] px-3.5">
          <Search size={16} aria-hidden="true" className="shrink-0 text-[var(--ms-text-2)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--ms-text-2)]"
          />
        </label>
      </div>

      <div className="campaign-toolbar mt-6 flex items-center justify-between border-b border-[var(--ms-line)] pb-3.5">
        <div className="flex gap-1">
          {(["current", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-[8px] px-4 py-1.5 text-[14px] capitalize transition-colors ${
                tab === t
                  ? "bg-[var(--ms-elev)] font-semibold text-[var(--ms-text)]"
                  : "text-[var(--ms-text-2)] hover:text-[var(--ms-text)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[13px] text-[var(--ms-text-2)]">
          <span>Sort</span>
          {(["recent", "name"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-[8px] border px-3 py-1.5 capitalize transition-colors ${
                sort === s
                  ? "border-[var(--ms-line-strong)] bg-[var(--ms-elev)] text-[var(--ms-text)]"
                  : "border-[var(--ms-line)] hover:text-[var(--ms-text)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {offline && (
        <p className="mt-4 text-[13px] italic text-[var(--ms-text-2)]">
          Can&apos;t reach the API — retrying. Nothing below is lost.
        </p>
      )}
      {error && <div className="mt-4"><ErrorStrip>{error}</ErrorStrip></div>}

      <p className="mb-3.5 mt-5 text-[14px] font-semibold">My campaigns</p>
      {!loaded && <p role="status" className="mb-4 text-sm text-[var(--ms-text-2)]">Loading your campaigns…</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-x-5 gap-y-6">
        {/* New campaign — the ONLY form in the product is its name */}
        <button
          onClick={() => {
            setNaming(true);
            setName("");
          }}
          className="group text-left"
        >
          <div className="grid aspect-[16/10] place-items-center rounded-[12px] border border-dashed border-[var(--ms-line-strong)] bg-[var(--ms-surface)] transition-colors group-hover:border-[var(--ms-blue)]">
            <Plus size={26} aria-hidden="true" className="text-[var(--ms-text-2)]" />
          </div>
          <p className="mt-2.5 text-[14px] text-[var(--ms-text-2)] group-hover:text-[var(--ms-text)]">
            New campaign
          </p>
        </button>

        {shown.map((row) => (
          <div key={row.id} className="relative">
            <button
              onClick={() =>
                row.thread_id && router.push(`/studio/thread/${row.thread_id}?kind=campaign`)
              }
              className="group w-full text-left"
            >
              <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[12px] border border-[var(--ms-line)] bg-[var(--bg-depth)] transition-colors group-hover:border-[var(--ms-blue)]">
                {row.thumbnail_asset_id ? (
                  // Exact owner-authorized file; no invented placeholder artwork.
                  <img src={api.assets.fileUrl(row.thumbnail_asset_id)} alt={`${row.name} creative`} loading="lazy" className="h-full w-full object-cover" />
                ) : <Image size={26} aria-hidden="true" className="text-[var(--ms-text-2)]" />}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span
                  aria-hidden
                  className="relative h-3 w-[15px] shrink-0 rounded-[2px_3px_3px_3px] bg-[var(--ms-blue-text)] opacity-85 before:absolute before:-top-[3px] before:left-0 before:h-[3px] before:w-[6px] before:rounded-t-[2px] before:bg-[var(--ms-blue-text)] before:content-['']"
                />
                <span className="flex-1 truncate text-[14px]">{row.name}</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 pl-[23px] text-[12px] text-[var(--ms-text-2)]">
                <span
                  className={`rounded-[6px] border px-1.5 py-[1px] text-[10.5px] ${chipClass(row.status)}`}
                >
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
                {row.creative_count > 0 && <span>{row.creative_count} creative</span>}
                {row.cached && <span>· Prepared sample</span>}
              </p>
            </button>

            <button
              aria-label={`Actions for ${row.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenu(menu === row.id ? null : row.id);
              }}
              className="absolute right-0 top-[calc(100%-46px)] px-2 text-[var(--ms-text-2)] hover:text-[var(--ms-text)]"
            >
              <MoreVertical size={18} aria-hidden="true" />
            </button>
            {menu === row.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-[calc(100%-24px)] z-20 w-[168px] overflow-hidden rounded-[10px] border border-[var(--ms-line)] bg-[var(--ms-elev)] shadow-[var(--ms-shadow)]"
              >
                <button
                  onClick={() => {
                    setMenu(null);
                    setConfirming(row);
                  }}
                  className="block w-full px-3.5 py-2.5 text-left text-[13px] hover:bg-[var(--ms-surface)]"
                >
                  Delete campaign
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {loaded && !offline && shown.length === 0 && (
        <p className="mt-10 text-[13.5px] text-[var(--ms-text-2)]">
          {query.trim()
            ? `Nothing matches “${query.trim()}”.`
            : tab === "archived"
              ? "Nothing archived yet — campaigns land here once they go live."
              : "No campaigns yet. Add a product photo and a one-line prompt to start."}
        </p>
      )}

      {/* ---- name modal: the one form in the product ---- */}
      {naming && (
        <div
          className="cb-scrim fixed inset-0 z-50 grid place-items-center backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-label="Name your campaign"
          onClick={() => !busy && setNaming(false)}
        >
          <div className="cb-modal w-[436px] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Name your campaign</h2>
            <p className="mt-1.5 text-[13px] leading-[19px] text-[var(--ms-text-2)]">
              One name, that&apos;s all. Everything else you tell the agent in the thread.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Spring launch"
              aria-label="Campaign name"
              maxLength={120}
              aria-invalid={!!nameProblem}
              className="cb-input mt-5 !h-[46px] !text-[14px]"
            />
            {nameProblem && (
              <p className="mt-2 text-[12px] font-semibold text-[var(--ms-text)]">{nameProblem}</p>
            )}
            <div className="mt-5 flex justify-end gap-2.5">
              <button className="cb-btn cb-btn-ghost" onClick={() => setNaming(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="cb-btn cb-btn-primary"
                onClick={create}
                disabled={busy || !!nameProblem || !name.trim()}
              >
                {busy ? "Opening…" : "Create campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- delete confirm: names what goes, because it does not come back ---- */}
      {confirming && (
        <div
          className="cb-scrim fixed inset-0 z-50 grid place-items-center backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirming(null)}
        >
          <div className="cb-modal w-[436px] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
              Delete “{confirming.name}”?
            </h2>
            <p className="mt-2 text-[13px] leading-[19px] text-[var(--ms-text-2)]">
              The thread, every message and{" "}
              {confirming.creative_count > 0
                ? `all ${confirming.creative_count} creative`
                : "any creative"}{" "}
              go with it. Canon sheets stay — those belong to the workspace, not this campaign.

            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button className="cb-btn cb-btn-ghost" onClick={() => setConfirming(null)} disabled={busy}>
                Keep it
              </button>
              <button
                className="cb-btn !bg-white !text-[var(--ms-bg)] !font-bold"
                onClick={() => remove(confirming)}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

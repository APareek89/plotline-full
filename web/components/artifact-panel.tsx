"use client";
import { mediaCost } from "@/lib/client/media-pricing";

// Addendum-01 §02: right detail panel — one at a time, Concept/Activity tabs,
// metadata rows, expand → full plan board, deep-linkable.
// Addendum-03 (Marketing Studio): campaign artifacts swap the tab row to
// Context | Creative and move Activity under the header ⋮ — the generation_log
// audit stays reachable, it just leaves the tab row.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ActivityEntry,
  AgentMessage,
  ArtifactEnvelope,
  CampaignRecord,
  Concept,
  ConceptVerdict,
  GenerationLogEntry,
  CAMPAIGN_STATUS_LABELS,
  OBJECTIVE_LABELS,
  PLATFORM_LABELS,
  api,
} from "@/lib/api";
import { CoverageChip, ProvisionalBadge } from "./thread-artifacts";
import { CampaignArtifactCard, MsChip, isCampaignArtifact } from "./campaign-artifacts";

type PanelTab = "artifact" | "activity" | "creative";

function MetaRow({
  label,
  value,
  dark,
}: {
  label: string;
  value: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-dotted py-1.5 text-[12.5px] ${
        dark ? "border-[var(--ms-line,#2A3140)]" : "border-line"
      }`}
    >
      <span className={dark ? "text-[var(--ms-text-2,#A6B0C0)]" : "text-muted"}>{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  proposed: "Proposed",
  downgraded: "Feedback downgrade",
  refined: "Refined",
  refine_requested: "Refine requested",
  approved: "Approved",
};

const GEN_LABELS: Record<string, string> = {
  generate: "Generated",
  reroll: "Re-roll",
  seam_qa: "Seam QA",
  edit_prompt: "Prompt edited",
  use_as_reference: "Used as reference",
};

export function ArtifactPanel({
  threadId,
  seriesId,
  artifact,
  objective,
  approved,
  busy,
  onClose,
  onAction,
}: {
  threadId: string;
  seriesId: string;
  artifact: ArtifactEnvelope;
  objective: string;
  approved: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (artifactId: string, event: string) => void;
}) {
  const ms = isCampaignArtifact(artifact.type);
  const [tab, setTab] = useState<PanelTab>("artifact");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [genLog, setGenLog] = useState<GenerationLogEntry[]>([]);
  const [menu, setMenu] = useState(false);
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [creative, setCreative] = useState<ArtifactEnvelope[]>([]);
  const menuWrap = useRef<HTMLDivElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTab("artifact");
    setMenu(false);
  }, [artifact.id]);

  // the audit view carries both records: artifact_activity (what the agent
  // proposed/approved) and generation_log (what the models actually ran)
  useEffect(() => {
    if (tab !== "activity") return;
    api.threads.activity(threadId, artifact.id).then(setActivity).catch(() => setActivity([]));
    api.threads.generationLog(threadId).then(setGenLog).catch(() => setGenLog([]));
  }, [tab, threadId, artifact.id]);

  // Escape must close the MENU, not the panel — the thread page listens for
  // Escape on window (bubble), so capture here and stop it reaching that.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuWrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(false);
      menuBtn.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  // campaign meta for the Context tab (campaign === series row)
  useEffect(() => {
    if (!ms || !seriesId) return;
    api.campaigns.get(seriesId).then(setCampaign).catch(() => setCampaign(null));
  }, [ms, seriesId, artifact.id]);

  // Creative tab = every generated output in this thread, not just the open card
  useEffect(() => {
    if (!ms || tab !== "creative") return;
    api.threads
      .get(threadId, 0)
      .then((t) => {
        const map = new Map<string, ArtifactEnvelope>();
        for (const m of t.messages ?? []) {
          if (m.role !== "agent") continue;
          for (const a of (m.envelope as AgentMessage).artifacts ?? []) {
            if (a.type === "creative_set" || a.type === "ad_card") map.set(a.id, a); // last version wins
          }
        }
        setCreative([...map.values()]);
      })
      .catch(() => setCreative([]));
  }, [ms, tab, threadId, artifact.id]);

  const p = artifact.payload ?? {};

  const ctx = campaign?.context;
  const spend = (campaign?.ad_cards ?? []).reduce(
    (s, c) => s + Number(c.estimated_cost_usd ?? 0),
    0
  );

  const softText = ms ? "text-[var(--ms-text-2,#A6B0C0)]" : "text-muted";
  const logCard = `rounded-[12px] border p-2.5 ${
    ms ? "border-[var(--ms-line,#2A3140)] bg-[var(--ms-elev,#1E242E)]" : "border-line bg-paper"
  }`;

  const tabs: PanelTab[] = ms ? ["artifact", "creative"] : ["artifact", "activity"];
  const tabLabel = (t: string) =>
    t === "creative"
      ? "Creative"
      : t === "activity"
        ? "Activity"
        : ms
          ? "Context"
          : artifact.type === "plan"
            ? "Plan"
            : "Details";

  return (
    <aside
      className={`flex h-full w-full flex-col border-l ${
        ms
          ? "ms-dark border-[var(--ms-line,#2A3140)] bg-[var(--ms-surface,#171B23)] text-[var(--ms-text,#FFFFFF)]"
          : "border-line bg-card"
      }`}
      role="complementary"
      aria-label={`${artifact.title} details`}
    >
      {/* header actions — reference order: expand · overflow · close */}
      <div
        className={`flex items-center justify-between border-b px-4 py-2.5 ${
          ms ? "border-[var(--ms-line,#2A3140)]" : "border-line"
        }`}
      >
        <p
          className={`field-label truncate ${ms ? "!text-[var(--ms-text-2,#A6B0C0)]" : ""}`}
        >
          {artifact.title}
        </p>
        <div className="flex items-center gap-1">
          {artifact.type === "plan" && (
            <Link
              href={`/studio/${seriesId}`}
              className="btn btn-ghost !px-2.5 !py-1 !text-[12px]"
              title="Expand — full-width plan board with drag-to-reorder"
            >
              Expand ⤢
            </Link>
          )}
          <button
            className="btn btn-ghost !px-2.5 !py-1 !text-[12px]"
            title="Copy link"
            aria-label="Copy link to this artifact"
            onClick={() => {
              const url = `${window.location.pathname}?artifact=${artifact.id}`;
              navigator.clipboard?.writeText(`${window.location.origin}${url}`);
            }}
          >
            ⧉
          </button>
          {/* MS: Activity lives here — the audit never disappears, it just moves */}
          {ms && (
            <div className="relative" ref={menuWrap}>
              <button
                ref={menuBtn}
                className="btn btn-ghost !px-2.5 !py-1 !text-[12px]"
                aria-haspopup="menu"
                aria-expanded={menu}
                title="More"
                aria-label="More actions"
                onClick={() => setMenu((v) => !v)}
              >
                ⋮
              </button>
              {menu && (
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-[12px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-elev,#1E242E)] shadow-lg"
                >
                  <button
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-[12.5px] text-[var(--ms-text,#FFFFFF)] hover:bg-[var(--ms-surface,#171B23)]"
                    onClick={() => {
                      setTab("activity");
                      setMenu(false);
                      menuBtn.current?.focus();
                    }}
                  >
                    Audit — activity &amp; generation log
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className="btn btn-ghost !px-2.5 !py-1 !text-[12px]"
            onClick={onClose}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* tabs — legacy: Concept · Activity · MS: Context · Creative */}
      <div
        className={`flex gap-4 border-b px-4 ${ms ? "border-[var(--ms-line,#2A3140)]" : "border-line"}`}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 py-2 text-[12.5px] font-semibold ${
              tab === t
                ? ms
                  ? "border-[var(--ms-blue,#4353FF)] text-[var(--ms-text,#FFFFFF)]"
                  : "border-accent text-ink"
                : ms
                  ? "border-transparent text-[var(--ms-text-2,#A6B0C0)]"
                  : "border-transparent text-muted"
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "activity" ? (
          <>
            {ms && (
              <div className="mb-2 flex items-center justify-between">
                <p className="field-label !text-[var(--ms-text-2,#A6B0C0)]">
                  Audit — activity &amp; generation log
                </p>
                <button
                  className="btn btn-ghost !px-2.5 !py-1 !text-[12px] !border-[var(--ms-line,#2A3140)] !text-[var(--ms-text-2,#A6B0C0)]"
                  onClick={() => setTab("artifact")}
                >
                  ← Context
                </button>
              </div>
            )}
            <p className={`field-label mb-1.5 ${ms ? "!text-[var(--ms-text-2,#A6B0C0)]" : ""}`}>
              Artifact activity — proposed, refined, approved
            </p>
            <ol className="space-y-2">
              {activity.length === 0 && (
                <p className={`text-[12.5px] italic ${softText}`}>No activity recorded yet.</p>
              )}
              {activity.map((a, i) => (
                <li key={i} className={logCard}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold">{ACTIVITY_LABELS[a.event] ?? a.event}</span>
                    <span className={`mono text-[10.5px] ${softText}`}>
                      {new Date(a.created_at * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  {a.detail && (
                    <p className={`mt-0.5 text-[12px] leading-snug ${ms ? "text-[var(--ms-text-2,#A6B0C0)]" : "text-ink-soft"}`}>
                      {a.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            {/* the other half of the audit: what the models actually ran */}
            <p className={`field-label mb-1.5 mt-4 ${ms ? "!text-[var(--ms-text-2,#A6B0C0)]" : ""}`}>
              Generation log — prompt, model, seed, cost
            </p>
            <ol className="space-y-2">
              {genLog.length === 0 && (
                <p className={`text-[12.5px] italic ${softText}`}>
                  Nothing generated in this thread yet.
                </p>
              )}
              {genLog.map((g) => (
                <li key={g.id} className={logCard}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold">{GEN_LABELS[g.event] ?? g.event}</span>
                    <span className={`mono text-[10.5px] ${softText}`}>
                      {new Date(g.created_at * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className={`mono mt-0.5 text-[10.5px] ${softText}`}>
                    {g.model ?? "model not recorded"}
                    {g.seed && g.seed !== "None" ? ` · seed ${g.seed}` : ""}
                    {` · ${mediaCost(g.cost, g)}`}
                    {g.asset_id ? ` · ${g.asset_id}` : ""}
                  </p>
                  {g.prompt && (
                    <p
                      className={`mt-1 whitespace-pre-wrap break-words text-[11.5px] leading-snug ${
                        ms ? "text-[var(--ms-text,#FFFFFF)]" : "text-ink-soft"
                      }`}
                    >
                      {g.prompt}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : ms && tab === "creative" ? (
          // step 8: every generated asset lands here with params + cost
          <div className="space-y-3">
            {creative.length === 0 ? (
              <p className="text-[12.5px] italic text-[var(--ms-text-2,#A6B0C0)]">
                Nothing generated yet — approve the detail, then confirm the model card.
              </p>
            ) : (
              creative.map((a) => (
                <CampaignArtifactCard
                  key={a.id}
                  artifact={a}
                  onAction={onAction}
                  busy={busy}
                  variant="panel"
                />
              ))
            )}
          </div>
        ) : ms ? (
          <>
            <CampaignArtifactCard
              artifact={artifact}
              onAction={onAction}
              busy={busy}
              variant="panel"
            />
            <div className="mt-3">
              <MetaRow dark label="Campaign" value={campaign?.name ?? ctx?.name ?? "—"} />
              <MetaRow
                dark
                label="Objective"
                value={
                  ctx?.campaign
                    ? OBJECTIVE_LABELS[ctx.campaign.objective] ?? ctx.campaign.objective
                    : "—"
                }
              />
              <MetaRow
                dark
                label="Status"
                value={
                  campaign ? (
                    <MsChip tone={campaign.status === "live" ? "ok" : "blue"}>
                      {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                    </MsChip>
                  ) : (
                    "—"
                  )
                }
              />
              <MetaRow
                dark
                label="Platforms"
                value={
                  (ctx?.campaign?.platforms ?? [])
                    .map((x) => PLATFORM_LABELS[x] ?? x)
                    .join(", ") || "—"
                }
              />
              <MetaRow dark label="Creative type" value={ctx?.campaign?.creative_type ?? "—"} />
              <MetaRow dark label="Ad Cards" value={String((campaign?.ad_cards ?? []).length)} />
              <MetaRow dark label="Media estimate" value={mediaCost(spend, { sample_media: Boolean(campaign?.ad_cards?.length) && campaign!.ad_cards.every((c) => c.billing_status === "sample") })} />
              <MetaRow
                dark
                label="Approved claims"
                value={
                  ctx?.brand?.claims_confirmed
                    ? `${(ctx.brand.approved_claims ?? []).length} confirmed`
                    : "not confirmed"
                }
              />
            </div>
          </>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-[12px] bg-paper p-3 text-[11.5px] leading-relaxed text-ink-soft">
            {JSON.stringify(p, null, 2)}
          </pre>
        )}
      </div>
    </aside>
  );
}

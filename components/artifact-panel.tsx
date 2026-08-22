"use client";

// Addendum-01 §02: right detail panel — one at a time, Concept/Activity tabs,
// metadata rows, expand → full plan board, deep-linkable.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ActivityEntry,
  ArtifactEnvelope,
  Concept,
  ConceptVerdict,
  PLATFORM_LABELS,
  api,
} from "@/lib/api";
import { ConceptCard } from "./concept-card";
import { CoverageChip, ProvisionalBadge } from "./thread-artifacts";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-dotted border-line py-1.5 text-[12.5px]">
      <span className="text-muted">{label}</span>
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
  const [tab, setTab] = useState<"artifact" | "activity">("artifact");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    setTab("artifact");
  }, [artifact.id]);

  useEffect(() => {
    if (tab !== "activity") return;
    api.threads.activity(threadId, artifact.id).then(setActivity).catch(() => setActivity([]));
  }, [tab, threadId, artifact.id]);

  const p = artifact.payload ?? {};
  const isConcept = artifact.type === "concept";
  const concept: Concept | null = isConcept ? p.concept : null;
  const verdict: ConceptVerdict | null = isConcept ? p.verdict : null;

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-line bg-card"
      role="complementary"
      aria-label={`${artifact.title} details`}
    >
      {/* header actions — reference order: expand · overflow · close */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="field-label truncate">{artifact.title}</p>
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
            onClick={() => {
              const url = `${window.location.pathname}?artifact=${artifact.id}`;
              navigator.clipboard?.writeText(`${window.location.origin}${url}`);
            }}
          >
            ⧉
          </button>
          <button className="btn btn-ghost !px-2.5 !py-1 !text-[12px]" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>
      </div>

      {/* tabs — Concept (the artifact) · Activity (version history) */}
      <div className="flex gap-4 border-b border-line px-4">
        {(["artifact", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 py-2 text-[12.5px] font-semibold ${
              tab === t ? "border-accent text-ink" : "border-transparent text-muted"
            }`}
          >
            {t === "artifact"
              ? artifact.type === "plan" ? "Plan" : artifact.type === "concept" ? "Concept" : "Details"
              : "Activity"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "activity" ? (
          <ol className="space-y-2">
            {activity.length === 0 && (
              <p className="text-[12.5px] italic text-muted">No activity recorded yet.</p>
            )}
            {activity.map((a, i) => (
              <li key={i} className="rounded-[12px] border border-line bg-paper p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold">{ACTIVITY_LABELS[a.event] ?? a.event}</span>
                  <span className="mono text-[10.5px] text-muted">
                    {new Date(a.created_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
                {a.detail && <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{a.detail}</p>}
              </li>
            ))}
          </ol>
        ) : isConcept && concept ? (
          <>
            {/* full CCF card exactly as specced in v1 §3.8 */}
            <ConceptCard
              concept={concept}
              verdict={verdict ?? undefined}
              options={p.options?.options}
              state={{
                series_id: seriesId, concept_id: concept.id,
                status: approved ? "approved" : (p.status ?? "qualified"),
                ccs: p.ccs, order_idx: 0, regen_count: 0,
                approved: approved ? 1 : 0,
              }}
              objective={objective}
              onApprove={() => onAction(artifact.id, "approve")}
              onUnapprove={() => onAction(artifact.id, "approve")}
              onRegenerate={(note) => onAction(artifact.id, `regenerate:${note}`)}
              busy={busy}
            />
            <div className="mt-3">
              <MetaRow label="CCS" value={`${p.ccs} · ${(approved ? "approved" : p.status ?? "").toUpperCase()}`} />
              <MetaRow
                label="Evidence coverage"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <CoverageChip pct={p.coverage} />
                    {p.provisional && <ProvisionalBadge />}
                  </span>
                }
              />
              <MetaRow label="Slot" value={concept.slot_date ?? "—"} />
              <MetaRow label="Format" value={concept.format.replace(/_/g, " ")} />
              <MetaRow label="Platform" value={PLATFORM_LABELS[concept.platform] ?? concept.platform} />
              <MetaRow label="Status" value={approved ? "Approved" : p.status} />
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

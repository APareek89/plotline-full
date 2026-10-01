"use client";
import PrivateDownload from "./private-download";
import ProviderBadge from "./provider-badge";
import { X } from "lucide-react";

// v5 Stage 5 — the artifact detail view.
//
// Clicking an artifact opens a full-height reading surface with a thin right
// rail. Two constraints from this codebase, both load-bearing:
//
// 1. Approve and reject fire the SAME UserAction events the chat options fire,
//    lifted from the artifact's own declared `actions`. There is no second
//    approval path. This repo has been bitten four times by one fact having two
//    representations, and an approval that only half the app knows about is the
//    worst version of it.
// 2. The panel is read-only for anything that SPENDS. The server stamps
//    `spends` on every action from one set of event names, so this component
//    never has to guess: a re-render is a cost event and belongs in the chat
//    with its price attached. Download, rename and delete are safe.
//
// PHASE 2, deliberately absent: "Select & edit", inpainting, any in-place image
// editing. The reference screenshots show that control; it is not built.

import { useCallback, useEffect, useState } from "react";
import { AssetMeta, ArtifactEnvelope, api } from "@/lib/api";
import { CampaignArtifactCard } from "@/components/campaign-artifacts";

const MUTED = "text-[var(--ms-text-2)]";
const RAIL_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ms-text-2)]";
const CHIP =
  "rounded-[6px] border border-[var(--ms-line,#2A2F3A)] px-2 py-[3px] text-[11px] text-[var(--ms-text-2)]";

/** The one asset a detail view is "about", if the artifact has one.
 *
 * Text artifacts (a brief, a hook rack, a script) have no asset and get the
 * reduced rail — name, download, delete — exactly as the reference screenshots
 * show. Inventing a prompt panel for a document nobody generated as an image
 * would be a rail that lies about where the thing came from. */
export function primaryAssetId(artifact: ArtifactEnvelope): string | null {
  const p: any = artifact.payload ?? {};
  const sheet = (p.sheets ?? [])[0];
  if (sheet?.sheet_asset_id) return sheet.sheet_asset_id;
  const frame = (p.board?.frames ?? [])[0];
  if (frame?.asset_id) return frame.asset_id;
  const item = (p.items ?? [])[0];
  if (item?.asset_id) return item.asset_id;
  return null;
}

export function ArtifactDetail({
  artifact,
  threadId,
  onClose,
  onAction,
}: {
  artifact: ArtifactEnvelope;
  threadId: string;
  onClose: () => void;
  onAction?: (artifactId: string, event: string) => void;
}) {
  const assetId = primaryAssetId(artifact);
  const [meta, setMeta] = useState<AssetMeta | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [gone, setGone] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!assetId) return;
    let live = true;
    api.assets
      .get(assetId)
      .then((m) => live && (setMeta(m), setName(m.name ?? "")))
      .catch((e) => { if (live && e.name !== "AbortError") { setMeta(null); setError(e.message); } });
    return () => {
      live = false;
    };
  }, [assetId]);

  // Escape closes. A full-height overlay with no keyboard exit is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitName = useCallback(() => {
    setRenaming(false);
    if (!assetId || !name.trim()) return;
    api.assets.rename(assetId, name.trim()).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
  }, [assetId, name]);

  // Only what is SAFE reaches this panel. `spends` is stamped server-side, so
  // the rule lives in one place rather than in a regex over event names here.
  //
  // FAILS CLOSED: an action with no flag is treated as possibly-spending and
  // stays in the chat. Envelopes written before the flag existed carry no
  // `spends` at all, and `!a.spends` would have quietly offered every one of
  // them here — which is how a re-render loses its price tag. Verified in the
  // browser against a stored pre-flag turn.
  const safeActions = (artifact.actions ?? []).filter((a) => a.spends === false);
  const prompt = meta?.prompt ?? "";
  const long = prompt.length > 320;

  return (
    <div className="artifact-detail-shell fixed inset-0 z-50 flex bg-[var(--ms-bg,#0B0D12)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-[860px]">
          {meta && meta.kind === "image" ? (
            <img
              src={api.assets.fileUrl(meta.id)}
              alt={artifact.title}
              className="w-full rounded-[10px] border border-[var(--ms-line,#2A2F3A)]"
            />
          ) : meta && meta.kind === "video" ? (
            <video
              src={api.assets.fileUrl(meta.id)}
              controls
              className="w-full rounded-[10px] border border-[var(--ms-line,#2A2F3A)]"
            />
          ) : (
            <CampaignArtifactCard artifact={artifact} readOnly />
          )}
        </div>
      </div>

      <aside className="flex w-[340px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-[var(--ms-line,#2A2F3A)] px-5 py-5">
        <div className="flex items-center justify-between">
          <p className={RAIL_LABEL}>{artifact.title}</p>
          <button
            onClick={onClose}
            aria-label="Close detail"
            className="rounded-[6px] px-2 py-1 text-[13px] text-[var(--ms-text-2)] hover:bg-[var(--ms-elev)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {prompt && (
          <div>
            <div className="flex items-center justify-between">
              <p className={RAIL_LABEL}>Prompt</p>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(prompt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
                className="rounded-[6px] border border-[var(--ms-line,#2A2F3A)] px-2 py-[2px] text-[11px]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-[18px]">
              {expanded || !long ? prompt : prompt.slice(0, 320).trimEnd() + "…"}
            </p>
            {long && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className={`mt-1 text-[11.5px] ${MUTED} underline`}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        <div>
          <p className={RAIL_LABEL}>Name</p>
          {renaming ? (
            <input
              autoFocus
              aria-label="Asset name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
              className="mt-1.5 w-full rounded-[6px] border border-[var(--ms-line,#2A2F3A)] bg-transparent px-2 py-1 text-[12.5px]"
            />
          ) : (
            <p
              onDoubleClick={() => assetId && setRenaming(true)}
              title={assetId ? "Double-click to rename" : "This artifact has no file to name"}
              className={`mt-1.5 text-[12.5px] ${name ? "" : MUTED}`}
            >
              {name || "Double-click to name"}
            </p>
          )}
        </div>

        {meta && (
          <div>
            <p className={RAIL_LABEL}>Settings</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ProviderBadge provider={meta.provider} model={meta.settings.model} />
              {meta.settings.model && <span className={CHIP}>{meta.settings.model}</span>}
              {meta.settings.aspect_ratio && (
                <span className={CHIP}>Aspect ratio: {meta.settings.aspect_ratio}</span>
              )}
              {meta.settings.resolution && (
                <span className={CHIP}>Resolution: {meta.settings.resolution}</span>
              )}
              {meta.settings.seed && <span className={CHIP}>Seed: {meta.settings.seed}</span>}
            </div>
            {/* What actually conditioned this render, and what did not reach it.
                A dropped product reference is how label drift enters a campaign,
                so it is stated here rather than only in a log line. */}
            {meta.refs.length > 0 && (
              <p className={`mt-2 text-[11px] ${MUTED}`}>seeded from: {meta.refs.join(" · ")}</p>
            )}
            {meta.refs_dropped.length > 0 && (
              <p className="mt-1 text-[11px] text-[var(--ms-danger-text,#FFFFFF)]">
                not seeded: {meta.refs_dropped.join(" · ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-1">
          {safeActions.map((a) => (
            <button
              key={a.id}
              onClick={() => onAction?.(artifact.id, a.event)}
              className="rounded-[7px] px-2.5 py-2 text-left text-[12.5px] hover:bg-[var(--ms-elev)]"
            >
              {a.label}
            </button>
          ))}
          {assetId && (
            <PrivateDownload
              href={api.assets.fileUrl(assetId)}
              className="rounded-[7px] px-2.5 py-2 text-left text-[12.5px] hover:bg-[var(--ms-elev)]"
            >
              Download
            </PrivateDownload>
          )}
          {assetId && !gone && (
            <button
              disabled={deleting}
              onClick={async () => {
                setDeleting(true); setError("");
                try { await api.assets.remove(assetId); setGone(true); }
                catch (e) { if (e instanceof Error && e.name !== "AbortError") setError(e.message); }
                finally { setDeleting(false); }
              }}
              className="rounded-[7px] px-2.5 py-2 text-left text-[12.5px] text-[var(--ms-danger-text,#FFFFFF)] hover:bg-[var(--ms-elev)]"
            >
              Delete
            </button>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {gone && <p className={`px-2.5 text-[11px] ${MUTED}`}>Deleted. The file and its cost stay in the log.</p>}
          {(artifact.actions ?? []).some((a) => a.spends) && (
            <p className={`px-2.5 pt-1 text-[11px] ${MUTED}`}>
              Rendering actions stay in the conversation, where you review provider and cost information before proceeding.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

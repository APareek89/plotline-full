"use client";

// Addendum-03 (Marketing Studio v2): the seven campaign artifact types.
// Same contract as thread-artifacts.tsx — compact cards inside the agent
// message, the right panel (§02) holds the full story — but rendered on the
// dark --ms-* surface. Tokens live in globals.css; the literal fallbacks in
// var(--ms-x, #hex) keep these cards legible wherever they mount.

import { useId, useMemo, useState } from "react";
import {
  API_URL,
  AdCard,
  AdMedia,
  api,
  ArtifactEnvelope,
  ArtifactType,
  CampaignDetail,
  CampaignOption,
  Evidence,
  ModelConfirm,
  PLATFORM_LABELS,
  TemplateRef,
} from "@/lib/api";

const media = (url: string) => (url?.startsWith("/") ? `${API_URL}${url}` : url);

// ---- dark primitives (globals.css owns the tokens; these only consume) ----

const CARD =
  "rounded-[16px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-surface,#171B23)] p-4 text-[var(--ms-text,#FFFFFF)]";
// applied to card roots that open the right panel
const CARD_OPEN = "cursor-pointer transition-colors hover:border-[var(--ms-line-strong,#6B7589)]";
const TILE =
  "rounded-[12px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-elev,#1E242E)]";
const MUTED = "text-[var(--ms-text-2,#A6B0C0)]";
const LABEL =
  "text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-text-2,#A6B0C0)]";
const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-[12px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
// --ms-blue-hover as a fill under #fff is 4.25:1; the solid twin is 6.21:1
const BTN_PRIMARY = `${BTN} bg-[var(--ms-blue,#4353FF)] text-white hover:bg-[var(--ms-blue-hover-solid,#3E4CE6)]`;
const BTN_GHOST = `${BTN} border border-[var(--ms-line,#2A3140)] text-[var(--ms-text-2,#A6B0C0)] hover:border-[var(--ms-text-2,#A6B0C0)] hover:text-[var(--ms-text,#FFFFFF)]`;
const BTN_DANGER = `${BTN} border border-[var(--ms-danger,#E5312B)] text-[var(--ms-danger-text,#F98F89)]`;
// rendered, never functional. No native `disabled` — that swallows the hover
// and focus its tooltip needs. Muted, but --ms-text-2 never drops below 4.5:1.
const BTN_INERT = `${BTN} cursor-not-allowed border border-dashed border-[var(--ms-line-strong,#6B7589)] text-[var(--ms-text-2,#A6B0C0)]`;
const PILL =
  "inline-flex items-center gap-1 rounded-[12px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-elev,#1E242E)] px-2.5 py-0.5 text-[11.5px] text-[var(--ms-text-2,#A6B0C0)] whitespace-nowrap";

// The backend bills 1 credit = $0.10 (app/config.py CREDIT_USD) and the Ad Card
// totals in credits, so every USD price carries the bridge to the same unit.
const CREDIT_USD = 0.1;
const credits = (usd: number) => Math.round((usd / CREDIT_USD) * 10) / 10;
const price = (usd: number) => `$${usd.toFixed(2)} (~${credits(usd)} credits)`;

// v2 steps 5 + 8: the card root IS the way into the right panel. Same pattern
// as thread-artifacts.tsx — clickable root, nested controls stop propagation.
function openRoot(
  artifact: ArtifactEnvelope,
  onOpen: ((a: ArtifactEnvelope) => void) | undefined,
  variant: "thread" | "panel",
  label?: string
): React.HTMLAttributes<HTMLDivElement> {
  if (!onOpen || variant === "panel") return {};
  const open = () => onOpen(artifact);
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `Open ${label || artifact.title} in the right panel`,
    onClick: open,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
  };
}

const STOP = {
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

export function MsChip({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "blue";
  title?: string;
}) {
  const toned =
    tone === "ok"
      ? "!border-[var(--ms-ok,#39C36A)] !text-[var(--ms-ok,#39C36A)]"
      : tone === "warn"
        ? "!border-[var(--ms-warn,#E8A13C)] !text-[var(--ms-warn,#E8A13C)]"
        : tone === "danger"
          ? "!border-[var(--ms-danger,#E5312B)] !text-[var(--ms-danger-text,#F98F89)]"
          : tone === "blue"
            ? "!border-[var(--ms-blue,#4353FF)] !text-[var(--ms-blue-text,#A3AEFF)]"
            : "";
  return (
    <span className={`${PILL} ${toned}`} title={title}>
      {children}
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${BTN_GHOST} !px-2 !py-0.5 !text-[11px]`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      onKeyDown={STOP.onKeyDown}
      aria-label={label}
    >
      {done ? "Copied" : label}
    </button>
  );
}

// ---- artifact routing -------------------------------------------------------

// Which artifacts route to THIS renderer rather than the legacy thread card.
// It has to list every type the switch below handles: a type present in the
// switch but absent here never reaches the switch at all, and renders as a
// placeholder with no actions — which is a dead end at a gate, not a cosmetic
// gap. Keep the two in step; the test below is what notices if they drift.
export const CAMPAIGN_ARTIFACT_TYPES: ArtifactType[] = [
  "intake_progress",
  "campaign_option",
  "template_picker",
  "campaign_detail",
  "model_confirm",
  "creative_set",
  "ad_card",
  // v3 gates
  "campaign_brief",
  "hook_rack",
  "canon_sheet",
  "keyframe_board",
  "qc_report",
  "variant_matrix",
];

export function isCampaignArtifact(type: string): boolean {
  return (CAMPAIGN_ARTIFACT_TYPES as string[]).includes(type);
}

// v2 step 7 invariant: these three events SPEND MONEY. They exist on exactly
// one surface — the model_confirm card, behind an explicit single-vs-variants
// choice. Any other artifact carrying one is a contract breach and gets
// filtered out here rather than rendered as a live button.
const GENERATION_EVENTS = ["generate_single", "generate_variants_2", "generate_variants_3", "generate_draft"];

export function isGenerationEvent(event: string): boolean {
  return GENERATION_EVENTS.includes(event);
}

function ActionRow({
  artifact,
  onAction,
  busy,
  omit,
}: {
  artifact: ArtifactEnvelope;
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
  omit?: (event: string) => boolean;
}) {
  const actions = (artifact.actions ?? []).filter(
    (a) =>
      !isGenerationEvent(a.event) && // model_confirm renders its own gated row
      !(omit?.(a.event) ?? false)
  );
  if (!actions.length) return null;
  return (
    // pressing an action must never double as "open the panel"
    <div className="mt-3 flex flex-wrap gap-1.5" {...STOP}>
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={busy}
          onClick={() => onAction(artifact.id, a.event)}
          className={
            a.style === "primary" ? BTN_PRIMARY : a.style === "danger" ? BTN_DANGER : BTN_GHOST
          }
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// REF/STAT/TREND are data; PRINCIPLE is model opinion and stays muted (§10).
function EvidencePills({ evidence }: { evidence: Evidence[] }) {
  if (!evidence?.length) {
    return (
      <MsChip tone="warn" title="The planner found nothing retrievable for this claim — it says so instead of inventing a source">
        no evidence in DB
      </MsChip>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {evidence.map((e, i) => (
        <span
          key={`${e.source_id}-${i}`}
          className={`${PILL} !items-start !whitespace-normal !text-left`}
          title={e.claim}
        >
          <span
            className={`mr-1 font-bold ${
              e.tag === "PRINCIPLE"
                ? "text-[var(--ms-text-2,#A6B0C0)]"
                : "text-[var(--ms-blue-text,#A3AEFF)]"
            }`}
          >
            {e.tag}
          </span>
          <span className="text-[var(--ms-text,#FFFFFF)]">{e.claim}</span>
          {e.source_id !== "model" && <span className="font-mono">[{e.source_id}]</span>}
          {e.as_of && <span>· as of {e.as_of}</span>}
        </span>
      ))}
    </div>
  );
}

export interface CampaignArtifactProps {
  artifact: ArtifactEnvelope;
  /** Every button routes here — same UserEvent path as the typed commands. */
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
  /** Present in-thread; opens the right panel. Absent inside the panel. */
  onOpen?: (a: ArtifactEnvelope) => void;
  /** "thread" = compact card · "panel" = the full story. */
  variant?: "thread" | "panel";
}

// ---- 1. intake_progress -----------------------------------------------------
// payload: {filled:{product,campaign,brand}, next_field}

function IntakeProgressCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const p = artifact.payload ?? {};
  const filled: Record<string, boolean> = p.filled ?? {};
  const next: string | null = p.next_field ?? null;
  const blocks: { key: string; label: string }[] = [
    { key: "product", label: "Product" },
    { key: "campaign", label: "Campaign" },
    { key: "brand", label: "Brand" },
  ];
  const inProgress = (key: string) => !!next && next.toLowerCase().startsWith(key);
  // the summary reads filled{}, not next_field — a null next_field with an
  // empty block means the intake stalled, not that everything is captured
  const missing = blocks.filter((b) => !filled[b.key]);

  return (
    <div className={CARD}>
      <p className={LABEL}>Intake progress</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {blocks.map((b) =>
          filled[b.key] ? (
            <MsChip key={b.key} tone="ok" title={`${b.label} block complete`}>
              {b.label} ✓
            </MsChip>
          ) : inProgress(b.key) ? (
            <MsChip key={b.key} tone="warn" title={`${b.label} block in progress`}>
              {b.label} …
            </MsChip>
          ) : (
            <MsChip key={b.key} title={`${b.label} block empty`}>
              {b.label} ✗
            </MsChip>
          )
        )}
      </div>
      <p className={`mt-2 text-[12px] ${MUTED}`}>
        {next
          ? `Next: ${next.replace(/[._]/g, " ")}`
          : missing.length
            ? `Still open: ${missing.map((b) => b.label.toLowerCase()).join(", ")} — nothing queued to ask.`
            : "All blocks captured — ready to ruminate."}
      </p>
      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- 2. campaign_option -----------------------------------------------------
// payload: {option: CampaignOption}   actions: approve | regenerate

function CampaignOptionCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const o = (artifact.payload?.option ?? {}) as Partial<CampaignOption>;
  return (
    <div className={`${CARD} border-l-[3px] border-l-[var(--ms-blue,#4353FF)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase text-[var(--ms-blue-text,#A3AEFF)]">
            {o.option_id ?? artifact.id}
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold leading-snug">
            {o.name_line ?? artifact.title}
          </h3>
        </div>
        {o.objective_echo && (
          <MsChip tone="blue" title="Objective echoed back from the campaign block">
            {o.objective_echo}
          </MsChip>
        )}
      </div>

      {o.description && (
        <p className="mt-2 text-[13px] leading-relaxed">{o.description}</p>
      )}

      {o.storyline && (
        <div className={`mt-2.5 ${TILE} p-3`}>
          <p className={LABEL}>Storyline</p>
          <p className="mt-1 text-[12.5px] leading-relaxed">{o.storyline}</p>
        </div>
      )}

      {o.why_it_fits && (
        <div className="mt-2.5">
          <p className={LABEL}>Why it fits</p>
          <p className="mt-1 text-[12.5px] leading-relaxed">{o.why_it_fits}</p>
          <div className="mt-1.5">
            <EvidencePills evidence={o.evidence ?? []} />
          </div>
        </div>
      )}

      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- 3. template_picker -----------------------------------------------------
// payload: {templates:[TemplateRef+thumb], skip_allowed:true}
// A pick is a style/composition reference — it constrains look, never copy.
// Skip is first-class: no style constraint at all.

function TemplatePickerCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const p = artifact.payload ?? {};
  const templates: TemplateRef[] = p.templates ?? [];
  const skipAllowed = p.skip_allowed !== false;
  const [picked, setPicked] = useState<string | null>(null);

  const labelFor = (event: string, fallback: string) =>
    artifact.actions?.find((a) => a.event === event)?.label ?? fallback;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>Style reference — optional</p>
        <MsChip title="A template constrains look and composition only; copy is never taken from it">
          look only, never copy
        </MsChip>
      </div>

      {templates.length === 0 ? (
        <p className={`mt-2 text-[12.5px] ${MUTED}`}>
          No templates available — the samples folder is empty. Skip proceeds with no style
          constraint.
        </p>
      ) : (
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {templates.map((t) => {
            const on = picked === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(on ? null : t.id)}
                aria-pressed={on}
                className={`${TILE} overflow-hidden p-0 text-left transition-all ${
                  on
                    ? "!border-[var(--ms-blue,#4353FF)] ring-2 ring-[var(--ms-blue,#4353FF)]"
                    : "hover:!border-[var(--ms-text-2,#A6B0C0)]"
                }`}
              >
                {t.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media(t.thumb)}
                    alt={`${t.type} template ${t.id}`}
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <div className={`flex h-24 w-full items-center justify-center text-[11px] ${MUTED}`}>
                    no thumbnail
                  </div>
                )}
                <div className="p-2">
                  <p className="flex items-center justify-between text-[11.5px] font-semibold">
                    <span className="font-mono">{t.id}</span>
                    {on && <span className="text-[var(--ms-blue-text,#A3AEFF)]">selected ✓</span>}
                  </p>
                  <p className={`mt-0.5 truncate text-[11px] ${MUTED}`} title={(t.style_descriptors ?? []).join(", ")}>
                    {t.type} · {(t.style_descriptors ?? []).join(", ") || "—"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || !picked}
          onClick={() => picked && onAction(artifact.id, `pick_${picked}`)}
        >
          {picked ? labelFor(`pick_${picked}`, `Use ${picked}`) : "Select a template"}
        </button>
        {skipAllowed && (
          <button
            type="button"
            className={BTN_GHOST}
            disabled={busy}
            onClick={() => onAction(artifact.id, "skip")}
            title="No style constraint is injected into downstream prompts"
          >
            {labelFor("skip", "Skip — no style constraint")}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- 4. campaign_detail -----------------------------------------------------
// payload: {detail: CampaignDetail, diff?: {slot: {was: string}}}
// actions: generate_creative  (asks for the model_confirm card — never generates)

function CampaignDetailCard({
  artifact,
  onAction,
  busy,
  onOpen,
  variant = "thread",
}: CampaignArtifactProps) {
  const p = artifact.payload ?? {};
  const d = (p.detail ?? {}) as Partial<CampaignDetail>;
  const diff: Record<string, { was?: string }> = p.diff ?? {};
  const shots = d.shots ?? [];
  const full = variant === "panel";
  const rows = full ? shots : shots.slice(0, 3);
  const isVideo = d.creative_type === "video";
  const root = openRoot(artifact, onOpen, variant);

  return (
    <div className={`${CARD} ${root.role ? CARD_OPEN : ""}`} {...root}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={LABEL}>{isVideo ? "Script" : "Image prompt set"}</p>
          <h3 className="mt-0.5 truncate text-[14px] font-bold">{artifact.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {d.style_ref && (
            <MsChip tone="blue" title={(d.style_ref.style_descriptors ?? []).join(", ")}>
              style {d.style_ref.id}
            </MsChip>
          )}
          <MsChip title="Version marker — refines edit in place">v{d.version ?? 1}</MsChip>
        </div>
      </div>

      {/* refine-loop diff log (step 6): only what was named changed */}
      {(d.changes ?? []).length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {(d.changes ?? []).map((c, i) => (
            <li key={i} className="text-[11.5px] text-[var(--ms-blue-text,#A3AEFF)]">
              ✎ {c}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 space-y-1.5">
        {rows.map((s) => {
          const changed = !!diff[s.slot];
          return (
            <div
              key={s.slot}
              className={`${TILE} p-2.5 ${changed ? "!border-[var(--ms-blue,#4353FF)]" : ""}`}
            >
              <p className={`font-mono text-[10.5px] uppercase ${MUTED}`}>
                {s.slot}
                {s.duration_s != null && ` · ${s.duration_s}s`}
                {changed && (
                  <span className="ml-1.5 text-[var(--ms-blue-text,#A3AEFF)]">edited</span>
                )}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug">{s.visual_prompt}</p>
              {changed && diff[s.slot]?.was && (
                <p className={`mt-0.5 text-[11.5px] line-through ${MUTED}`}>{diff[s.slot].was}</p>
              )}
              {s.vo_or_copy && (
                <p className="mt-1 text-[12px] font-semibold">
                  {isVideo ? "VO: " : "Copy: "}“{s.vo_or_copy}”
                </p>
              )}
            </div>
          );
        })}
        {!full && shots.length > rows.length && (
          <button
            type="button"
            className={`${BTN_GHOST} !w-full`}
            onClick={() => onOpen?.(artifact)}
          >
            +{shots.length - rows.length} more — open Context
          </button>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {d.copy_primary && (
          <div className={`${TILE} p-2.5`}>
            <div className="flex items-center justify-between gap-2">
              <p className={LABEL}>Primary copy</p>
              <CopyButton text={d.copy_primary} />
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{d.copy_primary}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {d.cta && <MsChip tone="blue">CTA · {d.cta}</MsChip>}
          {(d.claims_used ?? []).length > 0 ? (
            (d.claims_used ?? []).map((c, i) => (
              <MsChip key={i} tone="ok" title="Drawn from the confirmed approved-claims list">
                claim: {c}
              </MsChip>
            ))
          ) : (
            <MsChip title="No approved claim is used by this detail">no claims used</MsChip>
          )}
        </div>
      </div>

      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- 5. model_confirm -------------------------------------------------------
// payload: {confirm: ModelConfirm}
// actions: generate_single | generate_variants_2 | generate_variants_3
// THE gate: cost is shown first, and nothing dispatches until the user has
// picked single-or-variants AND pressed the confirm pill.

type GenChoice = "single" | "variants_2" | "variants_3";

const CHOICE_EVENT: Record<GenChoice, string> = {
  single: "generate_single",
  variants_2: "generate_variants_2",
  variants_3: "generate_variants_3",
};

function ModelConfirmCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const c = (artifact.payload?.confirm ?? {}) as Partial<ModelConfirm>;
  const variants = c.variants_proposed ?? [];
  const [choice, setChoice] = useState<GenChoice | null>(null);

  const offered = (ch: GenChoice) => (artifact.actions ?? []).some((a) => a.event === CHOICE_EVENT[ch]);
  const variantCount = (ch: GenChoice) => (ch === "variants_2" ? 2 : ch === "variants_3" ? 3 : 0);
  // Only offer a variant count the orchestrator actually proposed deltas for —
  // a count without named deltas + hypotheses would be an invented test.
  const options: GenChoice[] = (["single", "variants_2", "variants_3"] as GenChoice[]).filter(
    (ch) => offered(ch) && variants.length >= variantCount(ch)
  );

  const costFor = (ch: GenChoice): number =>
    ch === "single"
      ? Number(c.cost_usd ?? 0)
      : variants
          .slice(0, variantCount(ch))
          .reduce((sum, v) => sum + Number(v.cost_usd ?? 0), 0);

  const shown = choice ? variants.slice(0, variantCount(choice)) : variants;
  // the gear's describedby target — artifact ids repeat across turns, ids can't
  const noteId = useId();
  const note = c.settings_note || "Model selection coming — using recommended models";

  return (
    <div className={`${CARD} border-l-[3px] border-l-[var(--ms-blue,#4353FF)]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={LABEL}>Confirm before generating</p>
          <h3 className="mt-0.5 text-[14px] font-bold">{c.recommended_model ?? artifact.title}</h3>
        </div>
        {/* rendered, honestly inert. A native `disabled` would kill the pointer
            events the title needs, so the promise below would never show. */}
        <button
          type="button"
          aria-disabled="true"
          aria-label="Model settings"
          aria-describedby={noteId}
          title={note}
          onClick={(e) => e.preventDefault()}
          className={BTN_INERT}
        >
          ⚙ Settings
        </button>
      </div>

      {c.reason && <p className={`mt-1.5 text-[12.5px] ${MUTED}`}>{c.reason}</p>}
      <p id={noteId} className={`mt-1 text-[11.5px] ${MUTED}`}>
        {note}
      </p>

      <p className={LABEL + " mt-3"}>One creative, or variants?</p>
      {options.length === 0 ? (
        <p className={`mt-1.5 text-[12.5px] ${MUTED}`}>
          No generate options attached to this card yet — nothing can be generated from here.
        </p>
      ) : (
        <div className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="Single or variants">
          {options.map((ch) => {
            const on = choice === ch;
            return (
              <button
                key={ch}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(ch)}
                className={`${TILE} flex w-full items-center justify-between gap-3 p-2.5 text-left transition-all ${
                  on ? "!border-[var(--ms-blue,#4353FF)] ring-1 ring-[var(--ms-blue,#4353FF)]" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">
                    {ch === "single" ? "Single creative" : `Variants × ${variantCount(ch)}`}
                    {ch === "single" && (
                      <span className={`ml-1.5 text-[11px] font-normal ${MUTED}`}>default</span>
                    )}
                  </span>
                  <span className={`block text-[11.5px] ${MUTED}`}>
                    {ch === "single"
                      ? "One asset set from the approved detail."
                      : `${variantCount(ch)} named deltas, one shared variant group.`}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-[11.5px]">
                  ${costFor(ch).toFixed(2)}
                  <span className={`block text-[10.5px] font-normal ${MUTED}`}>
                    ~{credits(costFor(ch))} credits
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* draft-first (video): render one shot before committing the full spend */}
      {(() => {
        const draft = (artifact.actions ?? []).find((a) => a.event === "generate_draft");
        return draft ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(artifact.id, draft.event)}
            className={`${TILE} mt-1.5 flex w-full items-center justify-between gap-3 p-2.5 text-left`}
            title="Renders one shot so you can see the look before the full spend"
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">{draft.label}</span>
              <span className={`block text-[11.5px] ${MUTED}`}>
                See the look first — the rest stays unspent until you say so.
              </span>
            </span>
          </button>
        ) : null;
      })()}

      {/* deltas + hypotheses are shown BEFORE the count is committed */}
      {shown.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <p className={LABEL}>Proposed variants</p>
          {shown.map((v) => (
            <div key={v.variant_id} className={`${TILE} p-2.5`}>
              <p className="flex items-center justify-between text-[12px] font-bold">
                <span>Variant {v.variant_id}</span>
                <span className="font-mono font-normal">${Number(v.cost_usd ?? 0).toFixed(2)}</span>
              </p>
              <p className="mt-0.5 text-[12px]">{v.delta}</p>
              <p className={`mt-0.5 text-[11.5px] italic ${MUTED}`}>{v.hypothesis}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || !choice}
          onClick={() => choice && onAction(artifact.id, CHOICE_EVENT[choice])}
          title={
            choice
              ? `Generate — ${price(costFor(choice))}`
              : "Pick single or variants first — nothing generates without an explicit choice"
          }
        >
          {choice ? `Generate — ${price(costFor(choice))}` : "Generate"}
        </button>
        {!choice && (
          <span className={`text-[11.5px] ${MUTED}`}>
            Pick single or variants — cost is charged on confirm.
          </span>
        )}
      </div>
    </div>
  );
}

// ---- 6. creative_set --------------------------------------------------------
// payload: {items:[{asset_id,slot,kind,preview_url,status,cost,variant_id?}]}
// actions: accept_all | reroll_<slot> | use_as_reference_<slot>

type CreativeItem = {
  asset_id: string;
  slot: string;
  kind: "image" | "video" | "audio";
  preview_url?: string | null;
  status?: string;
  cost?: number;
  variant_id?: string | null;
};

const WORKING_STATES = ["pending", "queued", "running", "generating", "in_progress"];
const FAILED_STATES = ["failed", "error", "policy", "blocked"];

function statusTone(status?: string): "ok" | "warn" | "danger" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (FAILED_STATES.some((f) => s.includes(f))) return "danger";
  if (WORKING_STATES.includes(s)) return "warn";
  if (!s) return "neutral";
  return "ok";
}

function CreativeItemTile({
  item,
  artifact,
  onAction,
  busy,
}: {
  item: CreativeItem;
  artifact: ArtifactEnvelope;
  onAction: (artifactId: string, event: string) => void;
  busy: boolean;
}) {
  const tone = statusTone(item.status);
  const url = item.preview_url ? media(item.preview_url) : null;
  // a re-roll re-runs the same op, so what this asset cost is the estimate
  const est = item.cost != null ? Number(item.cost) : null;
  return (
    // media scrubbing and the per-asset buttons must not open the panel
    <div className={`${TILE} p-2`} {...STOP}>
      <div className="flex items-center justify-between gap-1.5">
        <p className={`font-mono text-[10px] uppercase ${MUTED}`}>{item.slot}</p>
        <MsChip tone={tone} title={`Generation status: ${item.status ?? "unknown"}`}>
          {tone === "warn" ? `${item.status}…` : (item.status ?? "—")}
        </MsChip>
      </div>

      {url && item.kind === "video" && (
        <video controls muted preload="metadata" src={url} className="mt-1 max-h-52 w-full rounded-[8px] bg-black" />
      )}
      {url && item.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.slot} className="mt-1 max-h-52 w-full rounded-[8px] object-cover" />
      )}
      {url && item.kind === "audio" && (
        <audio controls preload="none" src={url} className="mt-1 h-8 w-full" />
      )}
      {!url && (
        <div className={`mt-1 flex h-20 items-center justify-center rounded-[8px] text-[11px] ${MUTED}`}>
          {tone === "warn" ? "rendering…" : "no preview"}
        </div>
      )}

      <p className={`mt-1 font-mono text-[10px] ${MUTED}`}>
        {item.asset_id}
        {est != null && ` · $${est.toFixed(2)}`}
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          className={`${BTN_GHOST} !px-2 !py-0.5 !text-[11px]`}
          disabled={busy}
          onClick={() => onAction(artifact.id, `reroll_${item.slot}`)}
          title={
            est != null
              ? `Re-roll this asset only — the rest of the set is untouched. Charges ${price(est)} on click.`
              : "Re-roll this asset only — the rest of the set is untouched. No cost is on record for this slot, so the charge is unknown."
          }
        >
          {est != null ? `Re-roll · $${est.toFixed(2)}` : "Re-roll · cost unknown"}
        </button>
        <button
          type="button"
          className={`${BTN_GHOST} !px-2 !py-0.5 !text-[11px]`}
          disabled={busy}
          onClick={() => onAction(artifact.id, `use_as_reference_${item.slot}`)}
          title="Feed this frame back as the visual reference for the rest"
        >
          Use as reference
        </button>
        {url && (
          <a
            className={`${BTN_GHOST} !px-2 !py-0.5 !text-[11px]`}
            href={url}
            download
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}

function CreativeSetCard({
  artifact,
  onAction,
  busy,
  onOpen,
  variant = "thread",
}: CampaignArtifactProps) {
  const items: CreativeItem[] = artifact.payload?.items ?? [];

  // variant sets stay visually grouped — a variant group is one test, not a pile
  const groups = useMemo(() => {
    const map = new Map<string, CreativeItem[]>();
    for (const it of items) {
      const key = it.variant_id ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()];
  }, [items]);

  const spend = items.reduce((s, i) => s + Number(i.cost ?? 0), 0);
  const working = items.filter((i) => statusTone(i.status) === "warn").length;
  const root = openRoot(artifact, onOpen, variant, artifact.title || "Creative set");

  return (
    <div className={`${CARD} ${root.role ? CARD_OPEN : ""}`} {...root}>
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>{artifact.title || "Creative set"}</p>
        <div className="flex items-center gap-1.5">
          {working > 0 && <MsChip tone="warn">{working} rendering…</MsChip>}
          <MsChip title="Sum of the per-asset generation cost in this set">
            {price(spend)}
          </MsChip>
        </div>
      </div>

      {items.length === 0 && (
        <p className={`mt-2 text-[12.5px] ${MUTED}`}>Nothing generated in this set yet.</p>
      )}

      {groups.map(([variantId, groupItems]) => (
        <div key={variantId || "_"} className="mt-2.5">
          {variantId && (
            <p className="mb-1 text-[11.5px] font-bold text-[var(--ms-blue-text,#A3AEFF)]">
              Variant {variantId}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {groupItems.map((it) => (
              <CreativeItemTile
                key={it.asset_id || it.slot}
                item={it}
                artifact={artifact}
                onAction={onAction}
                busy={busy}
              />
            ))}
          </div>
        </div>
      ))}

      {/* per-item events already have their own buttons above */}
      <ActionRow
        artifact={artifact}
        onAction={onAction}
        busy={busy}
        omit={(e) => e.startsWith("reroll_") || e.startsWith("use_as_reference_")}
      />
    </div>
  );
}

// ---- 7. ad_card -------------------------------------------------------------
// payload: {card: AdCard}   actions: mark_live

function AdCardCard({
  artifact,
  onAction,
  busy,
  onOpen,
  variant = "thread",
}: CampaignArtifactProps) {
  const card = (artifact.payload?.card ?? {}) as Partial<AdCard>;
  const live = card.status === "live";
  const placements = Object.entries(card.placements ?? {});
  const spendCredits = Number(card.total_cost_credits ?? 0);
  const root = openRoot(artifact, onOpen, variant);

  return (
    <div
      className={`${CARD} border-l-[3px] border-l-[var(--ms-ok,#39C36A)] ${root.role ? CARD_OPEN : ""}`}
      {...root}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>
          Ad Card · {(card.status ?? "draft").toUpperCase()}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {card.variant_id && (
            <MsChip tone="blue" title={`Variant group ${card.variant_group_id ?? "—"}`}>
              Variant {card.variant_id}
            </MsChip>
          )}
          {(card.ratios ?? []).map((r) => (
            <MsChip key={r}>{r}</MsChip>
          ))}
          <MsChip title="Total generation spend booked to this Ad Card">
            {spendCredits} credits (~${(spendCredits * CREDIT_USD).toFixed(2)})
          </MsChip>
        </div>
      </div>

      {card.naming && (
        <div className={`mt-2 flex items-center justify-between gap-2 ${TILE} p-2`}>
          <p className="truncate font-mono text-[11px]" title={card.naming}>
            {card.naming}
          </p>
          <CopyButton text={card.naming} label="Copy name" />
        </div>
      )}

      {(card.media ?? []).length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto" {...STOP}>
          {(card.media ?? []).map((m: AdMedia, i: number) => (
            <div key={i} className="w-36 shrink-0">
              {m.kind === "video" && (
                <video controls muted preload="metadata" src={media(m.url)} className="max-h-40 w-full rounded-[8px] bg-black" />
              )}
              {m.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media(m.url)} alt="" className="max-h-40 w-full rounded-[8px] object-cover" />
              )}
              {m.kind === "audio" && (
                <audio controls preload="none" src={media(m.url)} className="h-8 w-full" />
              )}
              <p className={`mt-0.5 font-mono text-[9.5px] ${MUTED}`}>
                {m.ratio}
                {m.params?.cost != null && ` · $${Number(m.params.cost).toFixed(2)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {placements.map(([plat, copy]) => (
        <div key={plat} className={`mt-2 ${TILE} p-2.5`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`font-mono text-[10px] uppercase ${MUTED}`}>
              {PLATFORM_LABELS[plat] ?? plat}
            </p>
            <CopyButton text={String(copy)} />
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-[12.5px]">{String(copy)}</p>
        </div>
      ))}

      <div className="mt-3 flex flex-wrap gap-1.5" {...STOP}>
        {card.id ? (
          <a className={BTN_PRIMARY} href={api.adCards.bundleUrl(card.id)}>
            Download bundle
          </a>
        ) : (
          // no id yet = nothing stored to zip; a live-looking link would 404
          <span
            className={BTN_INERT}
            aria-disabled="true"
            title="This card has no id yet — the bundle exists once the Ad Card is stored"
          >
            Download bundle — not stored yet
          </span>
        )}
        {!live && (
          <button
            type="button"
            className={BTN_GHOST}
            disabled={busy}
            onClick={() => onAction(artifact.id, "mark_live")}
          >
            Mark Live
          </button>
        )}
        {live && <MsChip tone="ok">Live — paste results to feed performance memory</MsChip>}
      </div>
    </div>
  );
}

// ---- dispatcher -------------------------------------------------------------

export function CampaignArtifactCard(props: CampaignArtifactProps) {
  switch (props.artifact.type) {
    case "intake_progress":
      return <IntakeProgressCard {...props} />;
    case "campaign_option":
      return <CampaignOptionCard {...props} />;
    case "template_picker":
      return <TemplatePickerCard {...props} />;
    case "campaign_detail":
      return <CampaignDetailCard {...props} />;
    case "model_confirm":
      return <ModelConfirmCard {...props} />;
    case "creative_set":
      return <CreativeSetCard {...props} />;
    case "campaign_brief":
      return <CampaignBriefCard {...props} />;
    case "hook_rack":
      return <HookRackCard {...props} />;
    case "canon_sheet":
      return <CanonSheetCard {...props} />;
    case "keyframe_board":
      return <KeyframeBoardCard {...props} />;
    case "qc_report":
      return <QCReportCard {...props} />;
    case "variant_matrix":
      return <VariantMatrixCard {...props} />;
    case "ad_card":
      return <AdCardCard {...props} />;
    default:
      // never silently dropped
      return (
        <div className={`${CARD} border-dashed`}>
          <p className={LABEL}>{props.artifact.type}</p>
          <p className="text-[13px] font-semibold">{props.artifact.title}</p>
        </div>
      );
  }
}

// ---- v3 gates ---------------------------------------------------------------
// §12: never restate an artifact's content in the agent's text — the card IS the
// content. Every one of these carries its own actions from the server, so a gate
// the user cannot act on cannot happen.

// ---- campaign_brief ---------------------------------------------------------
// Order argues for itself top to bottom, and `single_message` renders largest:
// if the user reads one line of this card it has to be that one.

function CampaignBriefCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const b = (artifact.payload?.brief ?? {}) as any;
  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <div className="mt-2.5">
        <p className={LABEL}>{label}</p>
        <div className="mt-1 text-[12.5px] leading-relaxed">{value}</div>
      </div>
    ) : null;

  return (
    <div className={`${CARD} border-l-[3px] border-l-[var(--ms-blue,#4353FF)]`}>
      <div className="flex items-start justify-between gap-3">
        <p className={LABEL}>Campaign brief · v{b.version ?? 1}</p>
        {b.objective && (
          <MsChip tone="blue" title="Echoed from the campaign card, never re-decided">
            {b.objective}
            {b.target_metric ? ` · ${b.target_metric}` : ""}
          </MsChip>
        )}
      </div>

      {b.audience && (
        <div className="mt-2.5">
          <p className={LABEL}>Audience</p>
          <p className="mt-1 text-[12.5px] leading-relaxed">{b.audience}</p>
          {b.audience_current_belief && (
            <p className={`mt-1 text-[11.5px] italic ${MUTED}`}>
              believes now: {b.audience_current_belief}
            </p>
          )}
        </div>
      )}

      {b.single_message && (
        <div className={`mt-3 ${TILE} p-3`}>
          <p className={LABEL}>The one thing they remember</p>
          <p className="mt-1 text-[17px] font-bold leading-snug">{b.single_message}</p>
        </div>
      )}

      {row("Brand's role", b.brand_role)}
      {row(
        "Product truth",
        (b.proof_points ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {b.proof_points.map((p: string, i: number) => (
              <span key={i} className={PILL} title="From the confirmed approved claims">
                {p}
              </span>
            ))}
          </div>
        ) : (
          <MsChip tone="warn" title="No confirmed claim backs this brief — it may make no persuasion claim">
            no confirmed claims
          </MsChip>
        ),
      )}
      {row("Offer / CTA", b.offer_cta)}
      {row(
        "Format",
        <div className="flex flex-wrap gap-1.5">
          {(b.aspect_ratios ?? []).map((r: string) => (
            <MsChip key={r}>{r}</MsChip>
          ))}
          {b.duration_s ? <MsChip>{b.duration_s}s</MsChip> : null}
          {(b.languages ?? []).map((l: string) => (
            <MsChip key={l}>{l}</MsChip>
          ))}
        </div>,
      )}

      {((b.mandatories ?? []).length > 0 || (b.guardrails ?? []).length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className={LABEL}>Mandatories</p>
            <ul className="mt-1 space-y-0.5 text-[12px]">
              {(b.mandatories ?? []).map((m: string, i: number) => <li key={i}>· {m}</li>)}
            </ul>
          </div>
          <div>
            <p className={LABEL}>Guardrails</p>
            <ul className="mt-1 space-y-0.5 text-[12px]">
              {(b.guardrails ?? []).map((g: string, i: number) => (
                <li key={i} className="text-[var(--ms-danger-text,#F98F89)]">never {g}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {(b.warnings ?? []).length > 0 && (
        <div className="mt-3 space-y-1">
          {b.warnings.map((w: string, i: number) => (
            <p key={i} className="text-[11.5px] text-[var(--ms-warn-text,#E3B341)]">⚠ {w}</p>
          ))}
        </div>
      )}

      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- hook_rack --------------------------------------------------------------
// One locked body on top, the hook rack below. The w/s chip is coloured by the
// verdict the SERVER computed, and a `fail` row shows its proposed fix inline.

function wpsTone(v: string): "ok" | "warn" | "danger" {
  return v === "pass" ? "ok" : v === "tight" ? "warn" : "danger";
}

function ScriptLineRow({ line }: { line: any }) {
  return (
    <div className="flex items-start gap-3 border-t border-[var(--ms-line,#2A3140)] py-2 first:border-t-0">
      <span className={`shrink-0 font-mono text-[10.5px] ${MUTED}`}>
        {line.t_in?.toFixed?.(1)}–{line.t_out?.toFixed?.(1)}s
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">{line.text}</p>
        <p className={`text-[11px] italic ${MUTED}`}>{line.emotion}</p>
        {line.wps_verdict === "fail" && line.proposed_fix && (
          <p className="mt-1 text-[11.5px] text-[var(--ms-warn-text,#E3B341)]">
            proposed fix: “{line.proposed_fix}”
          </p>
        )}
      </div>
      <MsChip
        tone={wpsTone(line.wps_verdict)}
        title={`${line.words} words in ${(line.t_out - line.t_in).toFixed(1)}s — over the ceiling a line is rushed, clipped, and lip-sync drifts`}
      >
        {line.wps} w/s
      </MsChip>
    </div>
  );
}

function HookRackCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const rack = (artifact.payload?.rack ?? {}) as any;
  const hooks = rack.hooks ?? [];
  const body = rack.body ?? [];

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Script · {rack.language}</p>
        <MsChip>{rack.total_duration_s}s</MsChip>
      </div>

      <div className={`mt-2.5 ${TILE} p-3`}>
        <p className={LABEL}>Body — locked</p>
        <p className={`mt-0.5 text-[11px] ${MUTED}`}>
          A hook swap re-renders one shot, not the film. That only holds while this stays fixed.
        </p>
        <div className="mt-1.5">
          {body.map((l: any) => <ScriptLineRow key={l.slot} line={l} />)}
        </div>
      </div>

      <div className="mt-3">
        <p className={LABEL}>Hooks — {hooks.length}</p>
        <div className="mt-1">
          {hooks.map((h: any) => (
            <div
              key={h.slot}
              className={
                h.slot === rack.selected_hook_slot
                  ? "rounded-md border border-[var(--ms-blue,#4353FF)] px-2"
                  : "px-2"
              }
            >
              <ScriptLineRow line={h} />
            </div>
          ))}
        </div>
      </div>

      {(rack.loanwords_kept ?? []).length > 0 && (
        <div className="mt-2.5">
          <p className={LABEL}>Kept in English</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {rack.loanwords_kept.map((w: string) => <MsChip key={w}>{w}</MsChip>)}
          </div>
        </div>
      )}

      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- canon_sheet ------------------------------------------------------------
// A coverage meter, the locks, the slot cost that feeds lint B3, and — for a
// product whose geometry mutates — the red at-risk strip.

function CanonSheetCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const sheets = (artifact.payload?.sheets ?? []) as any[];
  return (
    <div className={CARD}>
      <p className={LABEL}>Canon · {sheets.length} sheet(s)</p>
      <p className={`mt-0.5 text-[11px] ${MUTED}`}>
        Reusable across every future campaign — campaign two is cheaper because these exist.
      </p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {sheets.map((s) => {
          const views = Object.keys(s.coverage ?? {});
          const have = views.filter((v) => s.coverage[v]).length;
          return (
            <div key={s.id} className={`${TILE} p-3`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[11.5px] font-bold text-[var(--ms-blue-text,#A3AEFF)]">
                  {s.id}
                </p>
                <MsChip>{s.kind}</MsChip>
              </div>
              <p className="mt-1 text-[12.5px]">{s.brief}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <MsChip tone={views.length && have === views.length ? "ok" : "warn"}>
                  {have}/{views.length || "—"} views
                </MsChip>
                <MsChip title="Reference slots this sheet consumes on a generation call (lint B3)">
                  {s.slot_cost} slot
                </MsChip>
                <MsChip tone={s.rights === "unverified" ? "danger" : "ok"}>{s.rights}</MsChip>
              </div>
              {(s.locks ?? []).length > 0 && (
                <p className={`mt-1.5 text-[11px] ${MUTED}`}>locks: {s.locks.join(" · ")}</p>
              )}
              {(s.risk_notes ?? []).length > 0 && (
                <p className="mt-1.5 border-l-2 border-[var(--ms-danger,#E5312B)] pl-2 text-[11px] text-[var(--ms-danger-text,#F98F89)]">
                  geometry risk: {s.risk_notes.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- keyframe_board ---------------------------------------------------------
// The hard gate. The Approve pill stays disabled until every frame is approved —
// animating an unapproved frame is the mistake the whole cost ladder prevents.

const CHECK_LABEL: Record<string, string> = {
  face: "face",
  hands: "hands",
  product_geometry: "geometry",
  label_legibility: "label",
  composition: "comp",
  safe_area: "safe",
};

function KeyframeBoardCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const board = (artifact.payload?.board ?? {}) as any;
  const frames = (board.frames ?? []) as any[];
  const approved = frames.filter((f) => f.approved).length;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Keyframes · {approved}/{frames.length} approved</p>
        <MsChip tone={board.all_approved ? "ok" : "warn"}>
          {price(board.total_cost_usd ?? 0)}
        </MsChip>
      </div>
      <p className={`mt-0.5 text-[11px] ${MUTED}`}>
        No video is generated until every frame is approved. A still costs a fraction of the
        motion it protects.
      </p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {frames.map((f) => (
          <div key={f.shot_slot} className={`${TILE} overflow-hidden`}>
            {f.asset_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media(`/api/assets/${f.asset_id}/file`)}
                alt={f.shot_slot}
                className="aspect-[9/16] w-full object-cover"
              />
            ) : (
              <div className={`flex aspect-[9/16] items-center justify-center text-[11px] ${MUTED}`}>
                not rendered
              </div>
            )}
            <div className="p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px]">{f.shot_slot}</span>
                <MsChip tone={f.approved ? "ok" : "warn"}>
                  {f.approved ? "approved" : "pending"}
                </MsChip>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(f.checks ?? {}).map(([k, v]) => (
                  <span
                    key={k}
                    title={`${CHECK_LABEL[k] ?? k}: ${v}`}
                    className={`h-1.5 w-1.5 rounded-full ${
                      v === "pass"
                        ? "bg-[var(--ms-ok,#3FB950)]"
                        : v === "fail"
                          ? "bg-[var(--ms-danger,#E5312B)]"
                          : "bg-[var(--ms-line-strong,#6B7589)]"
                    }`}
                  />
                ))}
              </div>
              {(f.repairs ?? []).length > 0 && (
                <p className={`mt-1 text-[10.5px] ${MUTED}`}>repaired: {f.repairs.join("; ")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className={`mt-2 text-[10.5px] ${MUTED}`}>
        A grey dot is a check that has not run — it is not a check that passed.
      </p>
      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- qc_report --------------------------------------------------------------
// Three tiers, blocking expanded. An accepted defect renders its rationale
// inline: without a visible reason it looks like negligence.

const TIER_TONE: Record<string, "danger" | "warn" | "neutral"> = {
  blocking: "danger",
  fix_before_ship: "warn",
  accepted: "neutral",
};
const TIER_LABEL: Record<string, string> = {
  blocking: "Blocking",
  fix_before_ship: "Fix before ship",
  accepted: "Accepted",
};

function QCReportCard({ artifact, onAction, busy }: CampaignArtifactProps) {
  const report = (artifact.payload?.report ?? {}) as any;
  const findings = (report.findings ?? []) as any[];
  const automated = Object.entries(report.automated ?? {}) as [string, string][];

  return (
    <div
      className={`${CARD} border-l-[3px] ${
        report.verdict === "held"
          ? "border-l-[var(--ms-danger,#E5312B)]"
          : "border-l-[var(--ms-ok,#3FB950)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Quality check</p>
        <MsChip tone={report.verdict === "held" ? "danger" : "ok"}>{report.verdict}</MsChip>
      </div>

      {(["blocking", "fix_before_ship", "accepted"] as const).map((tier) => {
        const rows = findings.filter((f) => f.tier === tier);
        if (!rows.length) return null;
        return (
          <div key={tier} className="mt-2.5">
            <p className={LABEL}>
              {TIER_LABEL[tier]} · {rows.length}
            </p>
            <div className="mt-1 space-y-1.5">
              {rows.map((f, i) => (
                <div key={i} className={`${TILE} p-2.5`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12.5px] font-semibold">{f.check}</p>
                    <MsChip tone={TIER_TONE[tier]}>{tier.replace(/_/g, " ")}</MsChip>
                  </div>
                  <p className={`mt-0.5 text-[12px] ${MUTED}`}>{f.detail}</p>
                  {f.resolution && (
                    <p className="mt-1 text-[11.5px]">→ {f.resolution}</p>
                  )}
                  {f.rationale && (
                    <p className={`mt-1 text-[11.5px] italic ${MUTED}`}>
                      accepted because: {f.rationale}
                    </p>
                  )}
                  {f.locator && (
                    <p className={`mt-1 font-mono text-[10.5px] ${MUTED}`}>{f.locator}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {automated.length > 0 && (
        <div className="mt-3">
          <p className={LABEL}>Automated detectors</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {automated.map(([name, state]) => (
              <MsChip
                key={name}
                tone={state === "pass" ? "ok" : state === "fail" ? "danger" : "neutral"}
                title={state === "skip" ? "not wired yet — this is not a pass" : undefined}
              >
                {name.replace(/_/g, " ")}: {state}
              </MsChip>
            ))}
          </div>
        </div>
      )}

      {Object.keys(report.locales ?? {}).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {Object.entries(report.locales).map(([loc, v]) => (
            <MsChip key={loc} tone={v === "cleared" ? "ok" : "danger"}>
              {loc}: {String(v)}
            </MsChip>
          ))}
        </div>
      )}

      <ActionRow artifact={artifact} onAction={onAction} busy={busy} />
    </div>
  );
}

// ---- variant_matrix ---------------------------------------------------------
// The reuse map. `re-renders 1 of 5` and the two totals are the business case
// for having a shot board at all, so they are shown rather than inferable.

const LOCALISATION_LIMIT: Record<string, string> = {
  dub: "audio only; lip-sync drift is visible",
  revoice: "new VO, captions and lip re-sync",
  recast: "new talent and environment — a full board re-render",
};

function VariantMatrixCard({ artifact }: CampaignArtifactProps) {
  const m = (artifact.payload?.matrix ?? {}) as any;
  const cells = (m.cells ?? []) as any[];
  const saved = m.baseline_cost_usd
    ? Math.round((1 - m.matrix_cost_usd / m.baseline_cost_usd) * 100)
    : 0;

  return (
    <div className={CARD}>
      <p className={LABEL}>Variant matrix</p>
      <div className="mt-2 space-y-1.5">
        {cells.map((c) => (
          <div key={c.variant_id} className={`${TILE} p-2.5`}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11.5px] font-bold">{c.variant_id}</span>
              <MsChip tone="blue">{c.axis}</MsChip>
            </div>
            <p className="mt-0.5 text-[12.5px]">{c.delta}</p>
            {c.hypothesis && (
              <p className={`mt-0.5 text-[11.5px] italic ${MUTED}`}>{c.hypothesis}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <MsChip title="Everything else is reused from the board, not re-rendered">
                re-renders {c.shots_rerendered?.length ?? 0} of{" "}
                {(c.shots_rerendered?.length ?? 0) + (c.shots_reused ?? 0)}
              </MsChip>
              <MsChip>{price(c.cost_usd ?? 0)}</MsChip>
              {c.localisation_tier && (
                <MsChip tone="warn" title={LOCALISATION_LIMIT[c.localisation_tier]}>
                  {c.localisation_tier}
                </MsChip>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-[var(--ms-line,#2A3140)] pt-2">
        <span className={`text-[11.5px] ${MUTED}`}>
          from scratch {price(m.baseline_cost_usd ?? 0)} · derived from the board{" "}
          {price(m.matrix_cost_usd ?? 0)}
        </span>
        <MsChip tone="ok">{saved}% less</MsChip>
      </div>
    </div>
  );
}

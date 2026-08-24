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

export const CAMPAIGN_ARTIFACT_TYPES: ArtifactType[] = [
  "intake_progress",
  "campaign_option",
  "template_picker",
  "campaign_detail",
  "model_confirm",
  "creative_set",
  "ad_card",
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

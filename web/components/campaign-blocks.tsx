"use client";

// v2 §Step 2 — the three campaign detail cards + their modals, plus the dark
// Marketing-Studio primitives the campaign screen is built from.
//
// The server is the source of truth: every card PUTs its WHOLE block and
// re-reads {context, cards_done}, so a half-filled card survives Esc, a path
// switch (structured ↔ conversational) and a reload. Drafts live in
// CampaignDetailCards, not inside the modals, which is why Esc keeps them.
//
// Honesty: the brand fetch and the claims extraction are SYSTEM pipelines, not
// agent tools. Their output is labelled CANDIDATE and is never written into the
// block until the user confirms it — approved_claims only ships with
// claims_confirmed:true.

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { API_URL, PLATFORM_LABELS, api, req } from "@/lib/api";

// ---- contracts (mirror app/schemas.py) --------------------------------------

export type CampaignObjective = "awareness" | "traffic" | "conversions";
export type CreativeType = "video" | "image";

export interface ProductBlock {
  name: string;
  description: string;
  image_upload_ids: string[];
}
export interface CampaignBlock {
  objective: CampaignObjective;
  target_audience: string;
  platforms: string[];
  description: string | null;
  creative_type: CreativeType;
}
export interface BrandBlock {
  name?: string | null;
  url: string | null;
  palette: string[];
  font: string | null;
  logo_upload_id: string | null;
  tagline: string | null;
  policy_upload_id: string | null;
  approved_claims: string[];
  banned_words: string[];
  claims_confirmed: boolean;
}
export interface CampaignContext {
  name: string;
  product: ProductBlock | null;
  campaign: CampaignBlock | null;
  brand: BrandBlock | null;
}
export interface CardsDone {
  product: boolean;
  campaign: boolean;
  brand: boolean;
}
export interface CampaignSummary {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  creative_count: number;
  spend_credits: number;
  thread_id: string | null;
}
/** POST /api/campaigns/{id}/brand/fetch — every field best-effort, never invented. */
export interface BrandExtract {
  palette: string[];
  font: string | null;
  logo_url: string | null;
  tagline: string | null;
  source_url: string;
  notes: string[];
}
/** POST /api/campaigns/{id}/claims/extract — candidates + why they look like that. */
export interface ClaimsExtract {
  approved_claims: string[];
  banned_words: string[];
  notes: string[];
}

// All client requests share the account/CSRF boundary, including multipart.
export { ApiError as MsApiError } from "@/lib/client/session";
import { session } from "@/lib/client/session";
import { ApiError as MsApiError } from "@/lib/client/session";
export const msFetch = req;

export const msJson = <T,>(path: string, method: "POST" | "PUT", body?: unknown) =>
  msFetch<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

// ---- theme ------------------------------------------------------------------
// Namespaced .cb-* so it can never collide with the token/utility layer
// globals.css owns — .ms-dark itself is left alone, this only paints .cb-screen.
// Every colour reads an --ms-* token with the v2 hex as fallback, so the screen
// renders correctly whether or not the token layer has landed yet.
//
// --ms-blue and --ms-danger are FILL tokens (3.22:1 and 3.95:1 as type on a dark
// surface), so anything that sets them on text uses the lightened twin instead.

export function CampaignStyles() {
  return (
    <style>{`
.cb-screen { background: var(--ms-bg,#0E1116); color: var(--ms-text,#FFFFFF); }
.cb-line { border-color: var(--ms-line,#2A3140); }
.cb-surface { background: var(--ms-surface,#171B23); border: 1px solid var(--ms-line,#2A3140); }
.cb-elev { background: var(--ms-elev,#1E242E); border: 1px solid var(--ms-line,#2A3140); }
.cb-muted { color: var(--ms-text-2,#A6B0C0); }
/* Blue and white only. ok/warn/danger keep their NAMES so every caller is
   unchanged, but they resolve to accent / secondary / inverted — see the
   token block in globals.css for why status stopped being a hue. */
.cb-ok { color: var(--ms-ok-text,#A3AEFF); }
.cb-warn { color: var(--ms-text-2,#A6B0C0); }
.cb-danger { color: var(--ms-text,#FFFFFF); font-weight: 700; }
.cb-accent-text { color: var(--ms-blue-text,#A3AEFF); }
/* The one INVERTED surface in the app: white fill, dark type. Nothing else on
   a dark screen is a solid white block, so this still shouts — and it owns its
   own text colour, because the inherited .cb-danger white would vanish on it. */
.cb-danger-strip {
  background: var(--ms-danger-wash,#FFFFFF);
  border-left: 3px solid var(--ms-danger,#FFFFFF);
  color: var(--ms-bg,#0E1116) !important;
}

.cb-card {
  background: var(--ms-surface,#171B23);
  border: 1px solid var(--ms-line,#2A3140);
  border-radius: var(--r-card,16px);
  text-align: left;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}
button.cb-card:not(:disabled) { cursor: pointer; }
button.cb-card:not(:disabled):hover { border-color: var(--ms-blue,#4353FF); background: var(--ms-elev,#1E242E); }
button.cb-card:focus-visible { outline: 2px solid var(--ms-focus,#A3AEFF); outline-offset: 2px; }
.cb-card[data-done="true"] { border-color: rgba(57,195,106,.55); }

.cb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 999px; font-weight: 600; font-size: 13.5px; padding: 8px 18px;
  border: 1px solid transparent; cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.cb-btn-primary { background: var(--ms-blue,#4353FF); color: #FFFFFF; }
/* --ms-blue-hover is the v2 hex and stays in the token block, but #fff on it
   is 4.25:1 — the hover of a primary button can't miss AA, so the fill uses
   the solid twin (6.21:1). */
.cb-btn-primary:not(:disabled):hover { background: var(--ms-blue-hover-solid,#3E4CE6); }
.cb-btn-ghost { background: transparent; border-color: var(--ms-line,#2A3140); color: var(--ms-text-2,#A6B0C0); }
.cb-btn-ghost:not(:disabled):hover { border-color: var(--ms-text-2,#A6B0C0); color: var(--ms-text,#FFFFFF); }
.cb-btn:disabled { opacity: .4; cursor: not-allowed; }
.cb-btn:focus-visible { outline: 2px solid var(--ms-focus,#A3AEFF); outline-offset: 2px; }

.cb-input {
  width: 100%; border-radius: var(--r-chip,12px); padding: 8px 12px; font-size: 14px;
  background: var(--ms-bg,#0E1116); color: var(--ms-text,#FFFFFF);
  border: 1px solid var(--ms-line,#2A3140); outline: none;
  transition: border-color 120ms ease;
}
.cb-input:focus { border-color: var(--ms-blue,#4353FF); }
.cb-input::placeholder { color: var(--ms-text-2,#A6B0C0); opacity: .65; }
.cb-input:disabled { opacity: .55; cursor: not-allowed; }
/* The inert prompt field's placeholder IS the reason it is inert (copy map §7),
   so it can't be dimmed twice — .55 element opacity over a .65 placeholder
   composites to 2.11:1. One dim only, which lands it at 5.09:1. */
.cb-prompt-inert:disabled { opacity: 1; }
.cb-prompt-inert::placeholder { color: var(--ms-text-2,#A6B0C0); opacity: 1; }
.cb-input[aria-invalid="true"] { border-color: var(--ms-danger,#FFFFFF); }

.cb-chip {
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; cursor: pointer;
  border-radius: var(--r-chip,12px); border: 1px solid var(--ms-line,#2A3140);
  background: var(--ms-elev,#1E242E); color: var(--ms-text-2,#A6B0C0);
  padding: 4px 11px; font-size: 12.5px; user-select: none;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.cb-chip:hover { border-color: var(--ms-blue,#4353FF); color: var(--ms-text,#FFFFFF); }
/* static chips never react to hover — declared BEFORE [data-on] so a selected
   static chip (the step trail) keeps its wash on hover. */
.cb-chip-static, .cb-chip-static:hover { cursor: default; border-color: var(--ms-line,#2A3140); color: var(--ms-text-2,#A6B0C0); }
.cb-chip[data-on="true"] { background: var(--ms-blue-wash,rgb(67 83 255 / 0.16)); border-color: var(--ms-blue,#4353FF); color: var(--ms-text,#FFFFFF); font-weight: 600; }
.cb-chip:focus-visible { outline: 2px solid var(--ms-focus,#A3AEFF); outline-offset: 2px; }

.cb-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--ms-text-2,#A6B0C0); }
.cb-hint { font-size: 11.5px; color: var(--ms-text-2,#A6B0C0); }
.cb-req { color: var(--ms-danger-text,#FFFFFF); }

.cb-scrim { background: var(--ms-scrim,rgb(0 0 0 / 0.55)); }
.cb-modal {
  background: var(--ms-surface,#171B23); border: 1px solid var(--ms-line,#2A3140);
  border-radius: var(--r-modal,20px); box-shadow: var(--ms-shadow,0 16px 48px rgb(0 0 0 / 0.55));
}

/* Vertical centring that cannot clip: plain \`justify-content: center\` pushes
   the top of an over-tall stack out of reach of the scrollbar, \`safe\` falls
   back to flex-start exactly when that would happen. */
.cb-vcenter { justify-content: safe center; }

.cb-tile { border: 1.5px dashed var(--ms-line,#2A3140); border-radius: var(--r-chip,12px); background: var(--ms-bg,#0E1116); cursor: pointer; transition: border-color 120ms ease; }
.cb-tile:hover { border-color: var(--ms-blue,#4353FF); }
.cb-swatch { width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--ms-line,#2A3140); }

/* Disabled-but-discoverable: NO [disabled] attribute, because browsers swallow
   pointer events on disabled buttons and the title tooltip never appears. This
   stays focusable and announces "unavailable" via aria-disabled, and has no
   click handler at all.
   A blanket opacity is what it must NOT use: .42 composited the label down to
   2.41:1. The dashed border carries "not a live control" instead, so the text
   token stays at full strength (7.12:1 on --ms-elev). */
.cb-inert { cursor: not-allowed; background: transparent; border: 1px dashed var(--ms-line-strong,#6B7589); border-radius: var(--r-chip,12px); color: var(--ms-text-2,#A6B0C0); }
.cb-inert:hover { border-color: var(--ms-line-strong,#6B7589); color: var(--ms-text-2,#A6B0C0); }
.cb-inert:focus-visible { outline: 2px solid var(--ms-text-2,#A6B0C0); outline-offset: 2px; }
`}</style>
  );
}

// ---- small primitives -------------------------------------------------------

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="cb-label">
        {label} {required ? <span className="cb-req">*</span> : <span className="cb-hint font-normal normal-case tracking-normal">optional</span>}
      </p>
      {hint && <p className="cb-hint mb-1.5 mt-0.5">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
      {error && <p className="cb-danger mt-1 text-[11.5px] font-semibold">{error}</p>}
    </div>
  );
}

export function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="cb-chip" data-on={on} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

/** Labelled work step — never a bare spinner (v2 honesty surface). */
export function WorkingLine({ label }: { label: string }) {
  return (
    <p className="cb-muted flex items-center gap-2 text-[12.5px]" role="status">
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none"
        style={{ background: "var(--ms-blue,#4353FF)" }}
      />
      {label}…
    </p>
  );
}

export function ErrorStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="cb-danger-strip cb-danger rounded-[10px] px-3 py-2 text-[12.5px] font-semibold" role="alert">
      {children}
    </div>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Tabbable descendants in DOM order; display:none ones (the hidden file
 *  inputs) drop out because they have no offsetParent. */
function focusables(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
}

export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useRef(`cb-modal-${Math.random().toString(36).slice(2, 8)}`).current;
  const dialog = useRef<HTMLDivElement>(null);
  // Read during render, not in the effect: the modals autoFocus their first
  // field, and that has already happened by the time an effect runs — the
  // opener (the card tile) would be gone.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  // Esc closes — the draft lives in CampaignDetailCards, so nothing is lost.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // aria-modal is a claim about focus, and a plain <div> keeps none of it on
  // its own: pull focus in on open, hand it back to the opener on close. The
  // first field, not the first control — that is where each modal's autoFocus
  // points, and Esc ✕ is a poor thing to land on.
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.contains(document.activeElement)) {
      const items = focusables(node);
      (items.find((el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) ?? items[0] ?? node).focus();
    }
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  // Tab wraps inside the dialog. Shift+Tab off the first control lands on the
  // last, not on the page behind the scrim.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = focusables(dialog.current);
    if (!items.length) return;
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  };

  return (
    <div className="cb-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="cb-modal flex max-h-[88vh] w-[min(720px,94vw)] flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div className="cb-line flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div>
            <h2 id={titleId} className="text-[15px] font-bold">
              {title}
            </h2>
            <p className="cb-hint mt-0.5">{subtitle}</p>
          </div>
          <button type="button" className="cb-btn cb-btn-ghost !px-3 !py-1.5" onClick={onClose} aria-label="Close — draft is kept">
            Esc ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="cb-line flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

// ---- the persistent prompt modal (v2 §APP STRUCTURE) ------------------------
// One implementation for both surfaces, because there is one control: + upload
// with a live n/8 counter · the field · the Settings gear · send. `onSend`
// present ⇒ live (the thread); absent ⇒ inert, which is the honest state on the
// campaign screen, where the prompt has nowhere to go yet.
//
// Needs <CampaignStyles /> on the page — the bar is .cb-* furniture.

export const GEAR_TOOLTIP = "Model selection coming — using recommended models";
/** Per message, mirroring the product pack ceiling in app/schemas.py. */
export const MAX_PROMPT_IMAGES = 8;

export interface PromptAttachment {
  id: string;
  filename: string;
  preview?: string;
}

export function PromptModal({
  placeholder,
  note,
  attachNote,
  sendLabel = "Send",
  onImageAttached,
  value = "",
  onValue,
  onSend,
  onKeyDown,
  inputRef,
  busy = false,
  offline = false,
  children,
}: {
  placeholder: string;
  /** The line under the bar; it is also the field's aria-describedby target. */
  note: React.ReactNode;
  /** Set ⇒ the attach control is inert, and this is the reason it gives. */
  attachNote?: string;
  sendLabel?: string;
  /** Successful image attachment can resolve parent validation, not API errors. */
  onImageAttached?: () => void;
  value?: string;
  onValue?: (value: string) => void;
  /** Omitted ⇒ field and send are inert. Resolves false when the send failed,
   *  which is what keeps the attachments on the bar instead of losing them. */
  onSend?: (text: string, uploadIds: string[]) => Promise<boolean>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  busy?: boolean;
  offline?: boolean;
  /** Rendered above the bar — the thread's panel-focus chip and its offline line. */
  children?: React.ReactNode;
}) {
  const [attached, setAttached] = useState<PromptAttachment[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const created = useRef<string[]>([]);
  useEffect(() => () => created.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const live = !!onSend;
  const count = attached.length;
  // Why attach can't be used right now, in the order the reasons override each
  // other. null ⇒ it works.
  const attachOff =
    attachNote ??
    (busy ? "Wait for the current step to finish before attaching another image." : null) ??
    (!live || offline
      ? "The prompt bar is offline — nothing would upload."
      : count >= MAX_PROMPT_IMAGES
        ? `Maximum ${MAX_PROMPT_IMAGES} images per message — remove one to attach another.`
        : null);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const epoch = session.capture();
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_PROMPT_IMAGES - count;
    setError(
      files.length > room
        ? `Only ${room} more image${room === 1 ? "" : "s"} fit (max ${MAX_PROMPT_IMAGES}) — the extra ${files.length - room} were not attached.`
        : null
    );
    const take = files.slice(0, Math.max(room, 0));
    if (!take.length) return;
    setUploading(`Uploading ${take.length} image${take.length === 1 ? "" : "s"}`);
    let completed = 0;
    try {
      for (const f of take) {
        session.assert(epoch);
        const up = await api.uploads.create(f, "brand_asset");
        session.assert(epoch);
        const preview = URL.createObjectURL(f);
        created.current.push(preview);
        setAttached((a) => [...a, { id: up.id, filename: up.filename, preview }]);
        completed++;
        onImageAttached?.();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(`Upload failed: ${(err as Error).message}${completed ? ` — ${completed} uploaded image${completed === 1 ? " remains" : "s remain"} attached.` : ". Your existing attachments are unchanged."}`);
    } finally {
      setUploading(null);
    }
  };

  const send = async () => {
    if (!onSend || busy || offline || uploading) return;
    if (await onSend(value.trim(), attached.map((a) => a.id))) setAttached([]);
  };

  const keyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="campaign-prompt cb-line shrink-0 border-t px-5 py-3" style={{ background: "var(--ms-surface,#171B23)" }}>
      <div className="mx-auto w-full max-w-[1180px]">
        {children}
        {error && (
          <div className="mb-1.5">
            <ErrorStrip>{error}</ErrorStrip>
          </div>
        )}
        {uploading && (
          <div className="mb-1.5">
            <WorkingLine label={uploading} />
          </div>
        )}
        {count > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {attached.map((a) => (
              <span key={a.id} className="cb-chip cb-chip-static !py-1">
                {a.preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.preview} alt="" className="h-4 w-4 rounded-[4px] object-cover" />
                )}
                <span className="max-w-[150px] truncate">{a.filename}</span>
                <button
                  type="button"
                  className="cb-hint px-0.5"
                  aria-label={`Remove ${a.filename}`}
                  disabled={busy || !!uploading}
                  onClick={() => setAttached((list) => list.filter((x) => x.id !== a.id))}
                >
                  ✕
                </button>
              </span>
            ))}
            <span className="cb-hint">sent with your next message</span>
          </div>
        )}

        <div className="campaign-prompt-row cb-elev flex items-end gap-2.5 rounded-[20px] px-3 py-2">
          {attachOff ? (
            <button
              type="button"
              className="cb-inert flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[13px]"
              aria-disabled="true"
              title={attachOff}
              aria-label={`Attach images — ${count} of ${MAX_PROMPT_IMAGES}`}
              aria-describedby="cb-attach-note"
            >
              <span aria-hidden>+</span>
              <span aria-hidden>
                Images {count}/{MAX_PROMPT_IMAGES}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="cb-chip shrink-0 !py-1.5 !text-[13px]"
              title="Attach images to this message"
              aria-label={`Attach images — ${count} of ${MAX_PROMPT_IMAGES}`}
              onClick={() => fileInput.current?.click()}
              disabled={!!uploading}
            >
              <span aria-hidden>+</span>
              <span aria-hidden>
                Images {count}/{MAX_PROMPT_IMAGES}
              </span>
            </button>
          )}
          {attachOff && (
            <span id="cb-attach-note" className="sr-only">
              {attachOff} Unavailable for now.
            </span>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />

          <textarea
            ref={inputRef}
            rows={1}
            className={`cb-input !border-none !bg-transparent max-h-[168px] min-h-[38px] min-w-0 flex-1 resize-none ${
              live && !offline ? "" : "cb-prompt-inert"
            }`}
            placeholder={placeholder}
            value={value}
            disabled={!live || offline}
            onChange={(e) => onValue?.(e.target.value)}
            onKeyDown={keyDown}
            aria-label="Message the campaign agent"
            aria-describedby="cb-prompt-note"
          />

          {/* Rendered, never fake-functional. Three deliberate choices:
              · no [disabled] attribute — browsers swallow pointer events on
                disabled buttons, so the title tooltip would never appear;
              · aria-disabled + no onClick — announced as unavailable, and a
                click/Enter genuinely does nothing (no dead handler to misfire);
              · the reason lives in aria-describedby, not aria-label, because an
                aria-label would replace the name and bury "coming soon". */}
          <button
            type="button"
            className="cb-inert flex h-8 w-8 shrink-0 items-center justify-center"
            aria-disabled="true"
            title={GEAR_TOOLTIP}
            aria-label="Model settings"
            aria-describedby="cb-gear-note"
          >
            <GearIcon />
          </button>
          <span id="cb-gear-note" className="sr-only">
            {GEAR_TOOLTIP}. Unavailable for now.
          </span>

          <button
            type="button"
            className="cb-btn cb-btn-primary !h-8 !w-8 shrink-0 !p-0"
            onClick={send}
            disabled={!live || busy || offline || !!uploading || (!value.trim() && !count)}
            aria-label={sendLabel}
            title={sendLabel}
          >
            ↑
          </button>
        </div>

        <p id="cb-prompt-note" className="cb-hint mt-1.5">
          {note}
        </p>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ---- draft shapes (looser than the strict schema until save) ----------------

interface ProductDraft {
  name: string;
  description: string;
  image_upload_ids: string[];
}
interface CampaignDraft {
  objective: CampaignObjective | "";
  target_audience: string;
  platforms: string[];
  description: string;
  creative_type: CreativeType;
}
interface BrandDraft {
  name?: string | null;
  url: string;
  palette: string[];
  font: string;
  logo_upload_id: string | null;
  tagline: string;
  policy_upload_id: string | null;
  approved_claims: string[];
  banned_words: string[];
  claims_confirmed: boolean;
}
/** Extractor output + claim picks — held outside the modal so Esc keeps them. */
interface BrandAux {
  fetched: BrandExtract | null;
  candidates: { approved_claims: string[]; banned_words: string[] } | null;
  pickedClaims: Record<string, boolean>;
  pickedBanned: Record<string, boolean>;
}

const EMPTY_PRODUCT: ProductDraft = { name: "", description: "", image_upload_ids: [] };
const EMPTY_CAMPAIGN: CampaignDraft = {
  objective: "",
  target_audience: "",
  platforms: [],
  description: "",
  creative_type: "image",
};
const EMPTY_BRAND: BrandDraft = {
  url: "",
  palette: [],
  font: "",
  logo_upload_id: null,
  tagline: "",
  policy_upload_id: null,
  approved_claims: [],
  banned_words: [],
  claims_confirmed: false,
};
const EMPTY_AUX: BrandAux = { fetched: null, candidates: null, pickedClaims: {}, pickedBanned: {} };

const OBJECTIVES: { id: CampaignObjective; label: string; hint: string }[] = [
  { id: "awareness", label: "Awareness", hint: "reach and recall — weights follow followers_reach" },
  { id: "traffic", label: "Traffic", hint: "clicks through — weights follow engagement" },
  { id: "conversions", label: "Conversions", hint: "purchases / signups — persuasion & proof carries weight" },
];
const PLATFORM_IDS = Object.keys(PLATFORM_LABELS);
const MIN_IMAGES = 1;   // one pack shot is enough to lock consistency; more is better, not required
const MAX_IMAGES = 8;

type UploadMeta = { id: string; filename: string; preview?: string };

// ---- the three cards --------------------------------------------------------

export function CampaignDetailCards({
  campaignId,
  context,
  cardsDone,
  onSaved,
}: {
  campaignId: string;
  context: CampaignContext | null;
  cardsDone: CardsDone;
  onSaved: (context: CampaignContext, cardsDone: CardsDone) => void;
}) {
  const [open, setOpen] = useState<null | "product" | "campaign" | "brand">(null);
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [campaign, setCampaign] = useState<CampaignDraft>(EMPTY_CAMPAIGN);
  const [brand, setBrand] = useState<BrandDraft>(EMPTY_BRAND);
  const [aux, setAux] = useState<BrandAux>(EMPTY_AUX);
  const [uploads, setUploads] = useState<Record<string, UploadMeta>>({});

  // Hydrate a draft from the server when that block's STORED VALUE changes —
  // first load, our own save echo, or path b writing it from the thread.
  //
  // Deliberately not "whenever no modal is open": closing is not a change, and
  // re-seeding on close would wipe the unsaved edit Esc is supposed to keep.
  // A block whose modal is open is left alone (no yanking the field out from
  // under someone typing); it syncs on the next close if the server moved.
  const seeded = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!context) return;
    const sync = (block: "product" | "campaign" | "brand", apply: () => void) => {
      const sig = JSON.stringify(context[block] ?? null);
      if (seeded.current[block] === sig || open === block) return;
      seeded.current[block] = sig;
      apply();
    };
    sync("product", () =>
      setProduct(
        context.product ? { ...context.product, image_upload_ids: [...context.product.image_upload_ids] } : EMPTY_PRODUCT
      )
    );
    sync("campaign", () =>
      setCampaign(
        context.campaign
          ? { ...context.campaign, description: context.campaign.description ?? "", platforms: [...context.campaign.platforms] }
          : EMPTY_CAMPAIGN
      )
    );
    sync("brand", () =>
      setBrand(
        context.brand
          ? {
              ...context.brand,
              url: context.brand.url ?? "",
              font: context.brand.font ?? "",
              tagline: context.brand.tagline ?? "",
              palette: [...context.brand.palette],
              approved_claims: [...context.brand.approved_claims],
              banned_words: [...context.brand.banned_words],
            }
          : EMPTY_BRAND
      )
    );
  }, [context, open]);

  // Filenames for upload ids restored from the server (object-URL previews only
  // exist for files attached in this session — say so rather than fake a thumb).
  useEffect(() => {
    api.uploads
      .list()
      .then((rows) =>
        setUploads((prev) => {
          const next = { ...prev };
          for (const r of rows) if (!next[r.id]) next[r.id] = { id: r.id, filename: r.filename };
          return next;
        })
      )
      .catch(() => {});
  }, [context]);

  // Object URLs are revoked when this screen unmounts.
  const created = useRef<string[]>([]);
  useEffect(() => () => created.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const attach = async (file: File, kind: string): Promise<string> => {
    const epoch = session.capture();
    const up = await api.uploads.create(file, kind);
    session.assert(epoch);
    const preview = URL.createObjectURL(file);
    created.current.push(preview);
    setUploads((u) => ({ ...u, [up.id]: { id: up.id, filename: up.filename, preview } }));
    return up.id;
  };

  const save = async (block: "product" | "campaign" | "brand", payload: unknown) => {
    const res = await msJson<{ context: CampaignContext; cards_done: CardsDone }>(
      `/api/campaigns/${campaignId}/blocks/${block}`,
      "PUT",
      payload
    );
    onSaved(res.context, res.cards_done);
    return res;
  };

  // Saved-but-unconfirmed is its own state on the Brand tile: a green ✓ there
  // would claim an approval the user never gave.
  const complete = cardsComplete(context, cardsDone);
  // saved, but with nothing approved — a note, not a blocker
  const claimsPending = cardsDone.brand && !context?.brand?.claims_confirmed;
  const brandLogo = context?.brand?.logo_upload_id ? uploads[context.brand.logo_upload_id] : undefined;

  return (
    <>
      {/* Sized to their content, not to the canvas: cards stretched to the
          viewport floor read as three empty boxes. The floor keeps the row
          even while the cards are still unfilled; the parent parks the
          leftover height below, where it reads as spacing. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 [&>*]:min-h-[168px]">
        <CardTile
          index={1}
          title="Product Details"
          done={complete.product}
          required="name · description · at least 1 image"
          onOpen={() => setOpen("product")}
          summary={
            context?.product ? (
              <>
                <p className="truncate text-[13px] font-semibold">{context.product.name}</p>
                <p className="cb-hint mt-1 line-clamp-3 leading-relaxed">{context.product.description}</p>
                {/* the pack itself, not a count of it — object-URL previews only
                    exist for this session's uploads, so a reload falls back to
                    named tiles rather than inventing thumbnails */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {context.product.image_upload_ids.slice(0, 8).map((id) => {
                    const meta = uploads[id];
                    return meta?.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={id}
                        src={meta.preview}
                        alt={meta.filename}
                        className="cb-elev h-11 w-11 rounded-[9px] object-cover"
                      />
                    ) : (
                      <span
                        key={id}
                        className="cb-elev flex h-11 w-11 items-center justify-center rounded-[9px] p-1 text-center text-[9px] leading-tight"
                        title={meta?.filename ?? id}
                      >
                        {(meta?.filename ?? id).slice(0, 9)}
                      </span>
                    );
                  })}
                </div>
                <p className="cb-muted mt-1.5 text-[12px]">
                  {context.product.image_upload_ids.length} product image
                  {context.product.image_upload_ids.length === 1 ? "" : "s"} — the consistency lock
                </p>
              </>
            ) : null
          }
        />
        <CardTile
          index={2}
          title="Campaign Details"
          done={complete.campaign}
          required="objective · audience · platforms · creative type"
          onOpen={() => setOpen("campaign")}
          summary={
            context?.campaign ? (
              <>
                <p className="truncate text-[13px] font-semibold capitalize">
                  {context.campaign.objective} · {context.campaign.creative_type}
                </p>
                <p className="cb-hint mt-1 line-clamp-2 leading-relaxed">{context.campaign.target_audience}</p>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {context.campaign.platforms.map((p) => (
                    <span key={p} className="cb-chip cb-chip-static !py-0.5 !text-[11px]">
                      {PLATFORM_LABELS[p] ?? p}
                    </span>
                  ))}
                </div>
                {context.campaign.description && (
                  <p className="cb-hint mt-2 line-clamp-3 leading-relaxed">“{context.campaign.description}”</p>
                )}
              </>
            ) : null
          }
        />
        <CardTile
          index={3}
          title="Brand Details"
          done={complete.brand}
          pending={claimsPending ? "saved · no approved claims" : null}
          required="palette · font · logo"
          onOpen={() => setOpen("brand")}
          summary={
            context?.brand ? (
              <>
                <div className="flex items-center gap-2">
                  {brandLogo?.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={brandLogo.preview}
                      alt={brandLogo.filename}
                      className="cb-elev h-11 w-11 shrink-0 rounded-[9px] object-contain p-1"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {context.brand.palette.slice(0, 6).map((hex, i) => (
                      <span key={`${hex}-${i}`} className="cb-swatch !h-7 !w-7" style={{ background: hex }} title={hex} />
                    ))}
                    {!context.brand.palette.length && <span className="cb-hint">no palette yet</span>}
                  </div>
                </div>
                <p className="cb-hint mt-2 truncate">{context.brand.font || "no font set"}</p>
                {context.brand.tagline && <p className="cb-hint mt-0.5 line-clamp-2">“{context.brand.tagline}”</p>}
                <p className={`mt-2 text-[12px] font-semibold ${context.brand.claims_confirmed ? "cb-ok" : "cb-warn"}`}>
                  {context.brand.claims_confirmed
                    ? `${context.brand.approved_claims.length} claims confirmed · ${context.brand.banned_words.length} banned`
                    : "Claims not confirmed yet"}
                </p>
              </>
            ) : null
          }
        />
      </div>

      {claimsPending && (
        <p className="cb-warn mt-2 text-[12px]">
          No approved claims yet — the campaign can run, but it may not state a claim. Confirm claims in the Brand card to
          allow specific ones; anything unconfirmed is kill-flagged by the council.
        </p>
      )}

      {open === "product" && (
        <ProductModal
          draft={product}
          setDraft={setProduct}
          uploads={uploads}
          attach={attach}
          onSave={(p) => save("product", p)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "campaign" && (
        <CampaignModal
          draft={campaign}
          setDraft={setCampaign}
          onSave={(p) => save("campaign", p)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "brand" && (
        <BrandModal
          campaignId={campaignId}
          draft={brand}
          setDraft={setBrand}
          aux={aux}
          setAux={setAux}
          uploads={uploads}
          attach={attach}
          onSave={(p) => save("brand", p)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function CardTile({
  index,
  title,
  done,
  pending,
  required,
  summary,
  onOpen,
}: {
  index: number;
  title: string;
  done: boolean;
  /** saved, but a gate inside the card is still open (Brand → claims) */
  pending?: string | null;
  required: string;
  summary: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="cb-card flex flex-col p-4" data-done={done} onClick={onOpen}>
      <div className="flex items-center justify-between gap-2">
        <p className="cb-label">
          {index}. {title}
        </p>
        {done ? (
          <span className="cb-ok text-[12px] font-bold" aria-label="saved">
            ✓ saved
          </span>
        ) : pending ? (
          <span className="cb-warn text-right text-[11.5px] font-semibold">{pending}</span>
        ) : (
          <span className="cb-hint">not filled</span>
        )}
      </div>
      {/* content sits under the header, the action anchors to the floor — the
          card reads as a panel at any height the grid hands it */}
      <div className="mt-2.5 min-h-0 flex-1">{summary ?? <p className="cb-hint">{required}</p>}</div>
      <p className="cb-accent-text mt-2 text-[12px] font-semibold">{done ? "Edit →" : "Open →"}</p>
    </button>
  );
}

// ---- 1. product -------------------------------------------------------------

function ProductModal({
  draft,
  setDraft,
  uploads,
  attach,
  onSave,
  onClose,
}: {
  draft: ProductDraft;
  setDraft: Dispatch<SetStateAction<ProductDraft>>;
  uploads: Record<string, UploadMeta>;
  attach: (file: File, kind: string) => Promise<string>;
  onSave: (payload: ProductBlock) => Promise<unknown>;
  onClose: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const count = draft.image_upload_ids.length;
  const errors = {
    name: !draft.name.trim() ? "Product name is required." : null,
    description: !draft.description.trim() ? "Description is required — the claims extractor reads it." : null,
    images:
      count < MIN_IMAGES
        ? `At least ${MIN_IMAGES} image required (up to ${MAX_IMAGES}) — ${count} attached. They become the product pack the generator locks onto.`
        : null,
  };
  const valid = !errors.name && !errors.description && !errors.images;

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - count;
    if (files.length > room) {
      setError(`Only ${room} more image${room === 1 ? "" : "s"} fit (max ${MAX_IMAGES}) — the extra ${files.length - room} were not attached.`);
    } else {
      setError(null);
    }
    setBusy(`Uploading ${Math.min(files.length, room)} image${Math.min(files.length, room) === 1 ? "" : "s"}`);
    const ids: string[] = [];
    try {
      for (const f of files.slice(0, Math.max(room, 0))) ids.push(await attach(f, "brand_asset"));
      setDraft((d) => ({ ...d, image_upload_ids: [...d.image_upload_ids, ...ids] }));
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy("Saving product block");
    setError(null);
    try {
      await onSave({
        name: draft.name.trim(),
        description: draft.description.trim(),
        image_upload_ids: draft.image_upload_ids,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Product Details"
      subtitle="Name, description and at least one shot for the product pack (up to 8)."
      onClose={onClose}
      footer={
        <>
          {busy && <WorkingLine label={busy} />}
          <span className="flex-1" />
          <button type="button" className="cb-btn cb-btn-ghost" onClick={onClose}>
            Close (draft kept)
          </button>
          <button type="button" className="cb-btn cb-btn-primary" onClick={submit} disabled={!!busy || (touched && !valid)}>
            Save product
          </button>
        </>
      }
    >
      {error && <ErrorStrip>{error}</ErrorStrip>}
      <Field label="Product name" required error={touched ? errors.name : null}>
        <input
          autoFocus
          className="cb-input"
          aria-invalid={touched && !!errors.name}
          placeholder='e.g. "Aera Diffuser — Mini"'
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Field>
      <Field
        label="Description"
        required
        hint="What it is, who it is for, what it actually does. Claim candidates are extracted from this text."
        error={touched ? errors.description : null}
      >
        <textarea
          className="cb-input min-h-[84px] resize-y"
          aria-invalid={touched && !!errors.description}
          placeholder="e.g. a cordless room diffuser with a 90-day cartridge, sized for desks and entryways"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
      </Field>
      <Field
        label={`Product images — ${count} of ${MIN_IMAGES}–${MAX_IMAGES}`}
        required
        hint="Real shots of the product from a few angles. The generator locks consistency to these."
        error={touched ? errors.images : null}
      >
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {draft.image_upload_ids.map((id) => {
            const meta = uploads[id];
            return (
              <div key={id} className="cb-elev relative aspect-square overflow-hidden rounded-[12px]">
                {meta?.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meta.preview} alt={meta.filename} className="h-full w-full object-cover" />
                ) : (
                  <span className="cb-hint absolute inset-0 flex items-center justify-center break-all p-1.5 text-center text-[10px]">
                    {meta?.filename ?? id}
                    <br />
                    (no preview after reload)
                  </span>
                )}
                <button
                  type="button"
                  className="cb-btn cb-btn-ghost absolute right-1 top-1 !px-1.5 !py-0 !text-[11px]"
                  style={{ background: "rgba(14,17,22,.8)" }}
                  aria-label={`Remove ${meta?.filename ?? id}`}
                  onClick={() => setDraft((d) => ({ ...d, image_upload_ids: d.image_upload_ids.filter((x) => x !== id) }))}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {count < MAX_IMAGES && (
            <button
              type="button"
              className="cb-tile flex aspect-square flex-col items-center justify-center gap-1"
              onClick={() => fileInput.current?.click()}
            >
              <span className="cb-accent-text text-[18px]">+</span>
              <span className="cb-hint">add</span>
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      </Field>
    </Modal>
  );
}

// ---- 2. campaign ------------------------------------------------------------

function CampaignModal({
  draft,
  setDraft,
  onSave,
  onClose,
}: {
  draft: CampaignDraft;
  setDraft: Dispatch<SetStateAction<CampaignDraft>>;
  onSave: (payload: CampaignBlock) => Promise<unknown>;
  onClose: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    objective: !draft.objective ? "Pick one objective — it sets the scoring weights." : null,
    target_audience: !draft.target_audience.trim() ? "Target audience is required." : null,
    platforms: !draft.platforms.length ? "Pick at least one platform." : null,
  };
  const valid = !errors.objective && !errors.target_audience && !errors.platforms;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy("Saving campaign block");
    setError(null);
    try {
      await onSave({
        objective: draft.objective as CampaignObjective,
        target_audience: draft.target_audience.trim(),
        platforms: draft.platforms,
        description: draft.description.trim() || null,
        creative_type: draft.creative_type,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Campaign Details"
      subtitle="Objective, audience, placements and the kind of creative you want back."
      onClose={onClose}
      footer={
        <>
          {busy && <WorkingLine label={busy} />}
          <span className="flex-1" />
          <button type="button" className="cb-btn cb-btn-ghost" onClick={onClose}>
            Close (draft kept)
          </button>
          <button type="button" className="cb-btn cb-btn-primary" onClick={submit} disabled={!!busy || (touched && !valid)}>
            Save campaign
          </button>
        </>
      }
    >
      {error && <ErrorStrip>{error}</ErrorStrip>}
      <Field
        label="Objective"
        required
        hint="One primary objective — it changes how every option is scored."
        error={touched ? errors.objective : null}
      >
        <div className="flex flex-wrap gap-1.5">
          {OBJECTIVES.map((o) => (
            <Chip key={o.id} on={draft.objective === o.id} title={o.hint} onClick={() => setDraft((d) => ({ ...d, objective: o.id }))}>
              {o.label}
            </Chip>
          ))}
        </div>
        {draft.objective && <p className="cb-hint mt-1.5">{OBJECTIVES.find((o) => o.id === draft.objective)?.hint}</p>}
      </Field>
      <Field
        label="Target audience"
        required
        hint="Who should stop scrolling? Age band + interest works."
        error={touched ? errors.target_audience : null}
      >
        <input
          autoFocus
          className="cb-input"
          aria-invalid={touched && !!errors.target_audience}
          placeholder="e.g. renters furnishing a first apartment, 25–34, metro India"
          value={draft.target_audience}
          onChange={(e) => setDraft((d) => ({ ...d, target_audience: e.target.value }))}
        />
      </Field>
      <Field label="Platforms" required hint="Placement drives ratio and format." error={touched ? errors.platforms : null}>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_IDS.map((p) => (
            <Chip
              key={p}
              on={draft.platforms.includes(p)}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p],
                }))
              }
            >
              {PLATFORM_LABELS[p]}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Creative type" required hint="Video runs a script; image runs a prompt set.">
          <div className="flex gap-1.5">
            {(["video", "image"] as CreativeType[]).map((t) => (
              <Chip key={t} on={draft.creative_type === t} onClick={() => setDraft((d) => ({ ...d, creative_type: t }))}>
                {t === "video" ? "Video" : "Image"}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Campaign description" hint="Angle, offer or story you already have in mind.">
          <textarea
            className="cb-input min-h-[60px] resize-y"
            placeholder="e.g. push the 90-day cartridge as the reason to switch"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---- 3. brand ---------------------------------------------------------------

function BrandModal({
  campaignId,
  draft,
  setDraft,
  aux,
  setAux,
  uploads,
  attach,
  onSave,
  onClose,
}: {
  campaignId: string;
  draft: BrandDraft;
  setDraft: Dispatch<SetStateAction<BrandDraft>>;
  aux: BrandAux;
  setAux: Dispatch<SetStateAction<BrandAux>>;
  uploads: Record<string, UploadMeta>;
  attach: (file: File, kind: string) => Promise<string>;
  onSave: (payload: BrandBlock) => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the extractor's own account of what it could and couldn't read
  const [notes, setNotes] = useState<string[]>([]);
  const [logoBroken, setLogoBroken] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const policyInput = useRef<HTMLInputElement>(null);

  const payload = (over?: Partial<BrandDraft>): BrandBlock => {
    const d = { ...draft, ...over };
    return {
      name: d.name?.trim() || null,
      url: d.url.trim() || null,
      palette: d.palette,
      font: d.font.trim() || null,
      logo_upload_id: d.logo_upload_id,
      tagline: d.tagline.trim() || null,
      policy_upload_id: d.policy_upload_id,
      approved_claims: d.approved_claims,
      banned_words: d.banned_words,
      claims_confirmed: d.claims_confirmed,
    };
  };

  // System extractor — fills nothing directly, the user applies each value.
  const fetchBrand = async () => {
    if (!draft.url.trim()) {
      setError("Enter a brand URL first.");
      return;
    }
    setBusy("Fetching brand from URL");
    setError(null);
    try {
      const res = await msJson<BrandExtract>(`/api/campaigns/${campaignId}/brand/fetch`, "POST", { url: draft.url.trim() });
      setLogoBroken(false);
      setAux((a) => ({ ...a, fetched: res }));
    } catch (err) {
      setError(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // Claims need server-side state (policy doc + product description), so the
  // block is saved first, then the candidates come back for confirmation.
  const extractClaims = async () => {
    setBusy("Saving brand block, then extracting claim candidates");
    setError(null);
    setNotes([]);
    try {
      await onSave(payload());
      const res = await msJson<ClaimsExtract>(`/api/campaigns/${campaignId}/claims/extract`, "POST");
      setAux((a) => ({
        ...a,
        candidates: res,
        // pre-ticked so confirming is one tap — the section says in as many
        // words that a tick is a candidate, not an approval, until Confirm.
        pickedClaims: Object.fromEntries(res.approved_claims.map((c) => [c, true])),
        pickedBanned: Object.fromEntries(res.banned_words.map((w) => [w, true])),
      }));
      // The extractor reports what it read (missing policy doc, unparsable PDF,
      // nothing extractable) — pass that through rather than guess at the cause.
      const found = res.approved_claims.length + res.banned_words.length;
      setNotes([
        ...(res.notes ?? []),
        ...(found
          ? []
          : ["Nothing extracted — the policy document is optional, so add any claims by hand below, or confirm none."]),
      ]);
    } catch (err) {
      setError(`Claim extraction failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // A claim typed by hand is as confirmable as an extracted one. Without this
  // a brand with no policy document and a plain product description could
  // never confirm, and claims_confirmed gates the whole campaign.
  const addManual = (kind: "claim" | "banned", value: string) => {
    const text = value.trim();
    if (!text) return;
    setAux((a) => {
      const key = kind === "claim" ? "approved_claims" : "banned_words";
      const current = a.candidates ?? { approved_claims: [], banned_words: [], notes: [] };
      if ((current as any)[key].includes(text)) return a;
      const candidates = { ...current, [key]: [...(current as any)[key], text] };
      return kind === "claim"
        ? { ...a, candidates, pickedClaims: { ...a.pickedClaims, [text]: true } }
        : { ...a, candidates, pickedBanned: { ...a.pickedBanned, [text]: true } };
    });
  };

  const confirmClaims = async () => {
    const approved = (aux.candidates?.approved_claims ?? []).filter((c) => aux.pickedClaims[c]);
    const banned = (aux.candidates?.banned_words ?? []).filter((w) => aux.pickedBanned[w]);
    setBusy("Confirming claims");
    setError(null);
    try {
      await onSave(payload({ approved_claims: approved, banned_words: banned, claims_confirmed: true }));
      setDraft((d) => ({ ...d, approved_claims: approved, banned_words: banned, claims_confirmed: true }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("Saving brand block");
    setError(null);
    try {
      await onSave(payload());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Uploading logo");
    try {
      const id = await attach(file, "brand_asset");
      setDraft((d) => ({ ...d, logo_upload_id: id }));
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const onPolicy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Uploading brand policy document");
    try {
      const id = await attach(file, "brief");
      setDraft((d) => ({ ...d, policy_upload_id: id }));
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const logo = draft.logo_upload_id ? uploads[draft.logo_upload_id] : undefined;
  const policy = draft.policy_upload_id ? uploads[draft.policy_upload_id] : undefined;
  const pickedCount =
    (aux.candidates?.approved_claims ?? []).filter((c) => aux.pickedClaims[c]).length +
    (aux.candidates?.banned_words ?? []).filter((w) => aux.pickedBanned[w]).length;

  return (
    <Modal
      title="Brand Details"
      subtitle="Palette, font, logo, policy — and the claims the council will hold every line against."
      onClose={onClose}
      footer={
        <>
          {busy && <WorkingLine label={busy} />}
          <span className="flex-1" />
          <button type="button" className="cb-btn cb-btn-ghost" onClick={onClose}>
            Close (draft kept)
          </button>
          <button type="button" className="cb-btn cb-btn-primary" onClick={submit} disabled={!!busy}>
            Save brand
          </button>
        </>
      }
    >
      {error && <ErrorStrip>{error}</ErrorStrip>}

      <Field label="Brand URL" hint="A system extractor reads the page — it never writes into the block on its own.">
        <div className="flex gap-2">
          <input
            autoFocus
            className="cb-input"
            placeholder="https://yourbrand.com"
            value={draft.url}
            onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && fetchBrand()}
          />
          <button type="button" className="cb-btn cb-btn-ghost shrink-0" onClick={fetchBrand} disabled={!!busy}>
            Fetch from URL
          </button>
        </div>
      </Field>

      {aux.fetched && (
        <div className="cb-elev rounded-[12px] p-3">
          <p className="cb-label">Extracted — nothing is applied until you say so</p>
          <p className="cb-hint mt-0.5">Source: {aux.fetched.source_url}</p>
          {aux.fetched.notes.map((n, i) => (
            <p key={i} className="cb-warn mt-1 text-[12px]">
              {n}
            </p>
          ))}
          <div className="mt-2.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="cb-hint w-16 shrink-0">Palette</span>
              {aux.fetched.palette.length ? (
                <>
                  {aux.fetched.palette.map((hex) => (
                    <span key={hex} className="cb-swatch" style={{ background: hex }} title={hex} />
                  ))}
                  <button
                    type="button"
                    className="cb-btn cb-btn-ghost !py-1 !text-[12px]"
                    onClick={() => setDraft((d) => ({ ...d, palette: aux.fetched!.palette }))}
                  >
                    Use these
                  </button>
                </>
              ) : (
                <span className="cb-hint">not found on the page</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cb-hint w-16 shrink-0">Font</span>
              <span className="text-[13px]">{aux.fetched.font ?? <span className="cb-hint">not found</span>}</span>
              {aux.fetched.font && (
                <button
                  type="button"
                  className="cb-btn cb-btn-ghost !py-1 !text-[12px]"
                  onClick={() => setDraft((d) => ({ ...d, font: aux.fetched!.font ?? "" }))}
                >
                  Use
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cb-hint w-16 shrink-0">Tagline</span>
              <span className="text-[13px]">{aux.fetched.tagline ?? <span className="cb-hint">not found</span>}</span>
              {aux.fetched.tagline && (
                <button
                  type="button"
                  className="cb-btn cb-btn-ghost !py-1 !text-[12px]"
                  onClick={() => setDraft((d) => ({ ...d, tagline: aux.fetched!.tagline ?? "" }))}
                >
                  Use
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cb-hint w-16 shrink-0">Logo</span>
              {aux.fetched.logo_url ? (
                <>
                  {/* Hotlink protection and CORS make third-party logos fail
                      often — say the URL was found and didn't load, rather
                      than leaving a broken-image glyph on screen. */}
                  {logoBroken ? (
                    <span className="cb-warn">the file at that URL wouldn&apos;t load here</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={aux.fetched.logo_url}
                      alt="Logo found on the brand page"
                      className="h-7 max-w-[120px] object-contain"
                      onError={() => setLogoBroken(true)}
                    />
                  )}
                  <span className="cb-hint">
                    preview only — logos are stored as uploads, so attach the file below to keep it
                  </span>
                </>
              ) : (
                <span className="cb-hint">not found</span>
              )}
            </div>
          </div>
        </div>
      )}

      <Field label="Palette" hint="Click a swatch to edit it. These hexes go into every generated frame.">
        <div className="flex flex-wrap items-center gap-2">
          {draft.palette.map((hex, i) => (
            <span key={`${hex}-${i}`} className="cb-elev flex items-center gap-1.5 rounded-[10px] px-1.5 py-1">
              <input
                type="color"
                className="cb-swatch cursor-pointer bg-transparent p-0"
                value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"}
                aria-label={`Colour ${i + 1}`}
                onChange={(e) => {
                  const hexed = e.target.value.toUpperCase();
                  setDraft((d) => ({ ...d, palette: d.palette.map((c, j) => (j === i ? hexed : c)) }));
                }}
              />
              <input
                className="cb-input !w-[86px] !border-none !bg-transparent !px-0 !py-0 font-mono text-[12px]"
                value={hex}
                aria-label={`Colour ${i + 1} hex`}
                onChange={(e) => {
                  const typed = e.target.value;
                  setDraft((d) => ({ ...d, palette: d.palette.map((c, j) => (j === i ? typed : c)) }));
                }}
              />
              <button
                type="button"
                className="cb-hint px-1 text-[12px]"
                aria-label={`Remove colour ${hex}`}
                onClick={() => setDraft((d) => ({ ...d, palette: d.palette.filter((_, j) => j !== i) }))}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="cb-btn cb-btn-ghost !py-1 !text-[12px]"
            onClick={() => setDraft((d) => ({ ...d, palette: [...d.palette, "#4353FF"] }))}
          >
            + colour
          </button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Font" hint="Name the family — it is a style instruction, not a webfont load.">
          <input
            className="cb-input"
            placeholder="e.g. Söhne, Inter, Canela"
            value={draft.font}
            onChange={(e) => setDraft((d) => ({ ...d, font: e.target.value }))}
          />
        </Field>
        <Field label="Tagline">
          <input
            className="cb-input"
            placeholder="e.g. scent that stays out of the way"
            value={draft.tagline}
            onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
          />
        </Field>
        <Field label="Logo" hint="PNG or SVG with clear space around it.">
          <div className="flex items-center gap-2">
            <button type="button" className="cb-tile flex h-[52px] w-[92px] items-center justify-center" onClick={() => logoInput.current?.click()}>
              {logo?.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.preview} alt={logo.filename} className="max-h-[44px] max-w-[84px] object-contain" />
              ) : (
                <span className="cb-hint">{logo ? "attached" : "+ upload"}</span>
              )}
            </button>
            {logo && (
              <div className="min-w-0">
                <p className="cb-hint truncate">{logo.filename}</p>
                <button
                  type="button"
                  className="cb-danger text-[12px] font-semibold"
                  onClick={() => setDraft((d) => ({ ...d, logo_upload_id: null }))}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />
        </Field>
        <Field label="Brand Policy Document" hint="Tone/claims policy. Feeds the claim candidates below.">
          <div className="flex items-center gap-2">
            <button type="button" className="cb-btn cb-btn-ghost" onClick={() => policyInput.current?.click()}>
              {policy ? "Replace file" : "+ upload"}
            </button>
            {policy && <p className="cb-hint min-w-0 truncate">{policy.filename}</p>}
          </div>
          <input ref={policyInput} type="file" className="hidden" onChange={onPolicy} />
        </Field>
      </div>

      {/* claims confirm — the compliance surface, no new form field */}
      <div className="cb-elev rounded-[12px] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="cb-label">Claims — optional, but nothing may be claimed without them</p>
            <p className="cb-hint mt-0.5">
              The policy document is optional. Candidates are extracted from it and the product description when present,
              and you can add claims by hand. Nothing counts as approved until you confirm.
            </p>
          </div>
          <button type="button" className="cb-btn cb-btn-ghost shrink-0" onClick={extractClaims} disabled={!!busy}>
            {aux.candidates ? "Re-extract" : "Save & extract claims"}
          </button>
        </div>

        {notes.map((n, i) => (
          <p key={i} className="cb-warn mt-2 text-[12px]">
            {n}
          </p>
        ))}

        {draft.claims_confirmed && !aux.candidates && (
          <p className="cb-ok mt-2 text-[12.5px] font-semibold">
            ✓ {draft.approved_claims.length} approved claims · {draft.banned_words.length} banned words confirmed. Re-extract
            to revise.
          </p>
        )}

        {aux.candidates && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <ClaimList
                title="Candidate approved claims"
                items={aux.candidates.approved_claims}
                picked={aux.pickedClaims}
                onToggle={(item) => setAux((a) => ({ ...a, pickedClaims: { ...a.pickedClaims, [item]: !a.pickedClaims[item] } }))}
              />
              <ClaimList
                title="Candidate banned words"
                items={aux.candidates.banned_words}
                picked={aux.pickedBanned}
                onToggle={(item) => setAux((a) => ({ ...a, pickedBanned: { ...a.pickedBanned, [item]: !a.pickedBanned[item] } }))}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <ManualAdd label="Add an approved claim" placeholder="e.g. Ships with a 5-year warranty"
                         onAdd={(v) => addManual("claim", v)} />
              <ManualAdd label="Add a banned word" placeholder="e.g. medical-grade"
                         onAdd={(v) => addManual("banned", v)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="cb-btn cb-btn-primary" onClick={confirmClaims} disabled={!!busy}>
                Confirm claims ({pickedCount} selected)
              </button>
              {draft.claims_confirmed && <span className="cb-ok text-[12.5px] font-semibold">✓ confirmed</span>}
              {pickedCount === 0 && (
                // Confirming zero is a legitimate answer, not a loophole: with no
                // approved claim, EVERY persuasion claim is unmapped, so the
                // council kill-flags it. Say that plainly instead of blocking.
                <span className="cb-warn text-[12px]">
                  Confirming none means the campaign may state no claims — the council kill-flags any it finds.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ManualAdd({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const commit = () => {
    onAdd(value);
    setValue("");
  };
  return (
    <div>
      <p className="cb-label">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          className="cb-input min-w-0 flex-1"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" className="cb-btn cb-btn-ghost shrink-0" onClick={commit} disabled={!value.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function ClaimList({
  title,
  items,
  picked,
  onToggle,
}: {
  title: string;
  items: string[];
  picked: Record<string, boolean>;
  onToggle: (item: string) => void;
}) {
  return (
    <div>
      <p className="cb-label">{title}</p>
      {items.length ? (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item}>
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 accent-[#4353FF]"
                  checked={!!picked[item]}
                  onChange={() => onToggle(item)}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cb-hint mt-1.5">none found</p>
      )}
    </div>
  );
}

// ---- completion rule --------------------------------------------------------
// The server sends two different answers to "is the brand card done?": the HTTP
// cards_done says yes as soon as the block is saved, while the thread's
// intake_progress card and POST /start both require claims_confirmed. Take the
// stricter one — the confirmed list IS the claims source of truth, and a Start
// button that lights up only to come back 422 teaches the user nothing.

export function cardsComplete(context: CampaignContext | null, cardsDone: CardsDone): CardsDone {
  // Confirming claims GRANTS permission to make them; it is not a toll on
  // starting. An unconfirmed brand simply has no approved claims, so any claim
  // the detail tries to use is unmapped and gets rejected server-side. Mirror
  // the server's cards_done exactly — a second, stricter gate here is how the
  // Brand card became impossible to finish for brands with nothing quotable.
  return { ...cardsDone };
}

/** What Start campaign is still waiting on, in the user's words. */
export function missingLabels(context: CampaignContext | null, cardsDone: CardsDone): string[] {
  const done = cardsComplete(context, cardsDone);
  const out: string[] = [];
  if (!done.product) out.push("Product Details");
  if (!done.campaign) out.push("Campaign Details");
  if (!done.brand) out.push("Brand Details");
  return out;
}

// ---- name validation shared with step 0 ------------------------------------

export function nameError(name: string, existing: CampaignSummary[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "A campaign name is required.";
  if (existing.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()))
    return `"${trimmed}" already exists — campaign names are the handle in My Campaigns, so they have to be unique.`;
  return null;
}

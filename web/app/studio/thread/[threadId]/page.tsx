"use client";

// Campaign Studio thread — two panes (owner decision 2026-08-26).
//
//   LEFT   the conversation. Every CTA lives here: the agent asks, and the
//          options above the composer ARE the approve / regenerate buttons.
//   RIGHT  a READ-ONLY review surface with five tabs the agent drives. It
//          switches to a tab the moment it has something to put there.
//
// The left campaign rail is gone, and so is the old inline artifact stack —
// a card is reviewed on the right, never pressed there. The options the
// composer renders are LIFTED server-side from each artifact's own actions,
// so the two surfaces cannot disagree about what the user may do.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AgentMessage,
  AgentQuestion,
  ArtifactEnvelope,
  Thread,
  ThreadMessage,
  api,
} from "@/lib/api";
import {
  ARTIFACT_TABS,
  CampaignArtifactCard,
  TabId,
  isCampaignArtifact,
  tabFor,
} from "@/components/campaign-artifacts";
import { CampaignStyles, PromptModal } from "@/components/campaign-blocks";
import { useAccount } from "@/components/account-shell";
import { ownerKey } from "@/lib/client/session";
import { campaignArtifactForReview, latestCampaignQuestion } from "@/lib/client/campaign-flow";
import { ArtifactDetail } from "@/components/artifact-detail";

const POLL_MS = 1200;
const PROMPT_HINT = "⌘↵ send · / focus · ↑ edits last message";
const PLACEHOLDER = "Tell me what to change, or just answer above…";

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const account = useAccount();
  const owner = account.user?.id ?? "local-fixture";

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draftFocus, setDraftFocus] = useState<string | null>(null);
  const [awaitingUpdate, setAwaitingUpdate] = useState(false);
  const submittedAfter = useRef<number | null>(null);
  const submitting = useRef(false);

  // Which tab the user is looking at, and whether the AGENT is still allowed to
  // move it. Touching a tab yourself takes the wheel — an auto-switch that
  // yanks the view away while you are reading is the panel fighting you.
  const [tab, setTab] = useState<TabId>("brief");
  // The artifact whose full-height detail view is open, if any.
  const [detail, setDetail] = useState<ArtifactEnvelope | null>(null);
  const [following, setFollowing] = useState(true);

  const lastSeq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const kindKey = ownerKey(owner, "threadkind", threadId);
  const draftKey = ownerKey(owner, "draft", threadId);
  const [kindHint, setKindHint] = useState<string | null>(search.get("kind"));
  useEffect(() => {
    try { setKindHint(search.get("kind") ?? localStorage.getItem(kindKey)); } catch { setKindHint(search.get("kind")); }
  }, [kindKey, search]);
  useEffect(() => {
    if (thread?.kind) { try { localStorage.setItem(kindKey, thread.kind); } catch {} }
  }, [kindKey, thread?.kind]);

  // Measured, not assumed: layout.tsx belongs to another lane and the Phase-1
  // 57px guess left a 3.5px dead strip.
  const shell = useRef<HTMLDivElement>(null);
  const [shellTop, setShellTop] = useState(53.5);
  useEffect(() => {
    const measure = () => {
      const top = shell.current?.getBoundingClientRect().top;
      if (top != null) setShellTop(top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const restoredDraft = useRef<string | null>(null);
  useEffect(() => {
    let value = ""; try { value = localStorage.getItem(draftKey) ?? ""; } catch {}
    setDraft(value); restoredDraft.current = draftKey;
  }, [draftKey]);
  const changeDraft = (value: string) => {
    setDraft(value);
    if (restoredDraft.current === draftKey) { try { localStorage.setItem(draftKey, value); } catch {} }
  };

  // Each poll belongs to this mounted thread; account changes also abort it centrally.
  const lifetime = useRef<AbortController | null>(null);
  const polling = useRef(false);
  const poll = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || polling.current) return;
    polling.current = true;
    try {
      const t = await api.threads.get(threadId, lastSeq.current, signal);
      if (signal.aborted) return;
      setOffline(false); setConnectionError(null);
      if (submittedAfter.current !== null && t.messages?.some((m) => m.seq > submittedAfter.current!)) {
        submittedAfter.current = null; setAwaitingUpdate(false);
      }
      setThread({ ...t, messages: undefined }); setWorking(t.working ?? null);
      if (t.messages?.length) {
        setMessages((prev) => {
          const have = new Set(prev.map((p) => p.seq));
          const fresh = t.messages!.filter((m) => !have.has(m.seq));
          if (!fresh.length) return prev;
          const merged = [...prev, ...fresh]; lastSeq.current = merged[merged.length - 1].seq; return merged;
        });
      }
    } catch (e) {
      if (!signal.aborted && !(e instanceof Error && e.name === "AbortError")) { setOffline(true); setConnectionError(e instanceof Error ? e.message : "Thread is unavailable."); }
    } finally { polling.current = false; }
  }, [threadId]);
  useEffect(() => {
    lifetime.current = new AbortController(); lastSeq.current = 0; setMessages([]);
    submittedAfter.current = null; setAwaitingUpdate(false); setDraftFocus(null);
    void poll(); const iv = setInterval(() => void poll(), POLL_MS);
    return () => { clearInterval(iv); lifetime.current?.abort(); };
  }, [poll]);

  // ---- artifacts, newest version of each id, bucketed by tab ----
  // A card like the intake tile is re-posted every turn. Only the newest
  // instance is live; the older ones are superseded, not history.
  const byTab = useMemo(() => {
    const live = new Map<string, ArtifactEnvelope>();
    for (const m of messages) {
      if (m.role !== "agent") continue;
      for (const a of (m.envelope as AgentMessage).artifacts ?? []) live.set(a.id, a);
    }
    const out: Record<TabId, ArtifactEnvelope[]> = {
      brief: [], script: [], cast: [], keyframes: [], creative: [],
    };
    for (const a of live.values()) {
      if (a.type === "intake_progress" && thread?.stage && thread.stage !== "intake") continue;
      if (isCampaignArtifact(a.type)) out[tabFor(a.type)].push(a);
    }
    return out;
  }, [messages, thread?.stage]);

  // The newest artifact overall decides where the agent wants you looking.
  const latestTab = useMemo<TabId | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "agent") continue;
      const arts = ((m.envelope as AgentMessage).artifacts ?? []).filter((a) =>
        isCampaignArtifact(a.type)
      );
      if (arts.length) return tabFor(arts[arts.length - 1].type);
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (following && latestTab && latestTab !== tab) setTab(latestTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTab, following]);

  // The newest turn owns the ask. A newer status/error must not resurrect a
  // prior approval; an accepted request also hides its controls until readback.
  const question = useMemo(() => awaitingUpdate ? null : latestCampaignQuestion(messages), [messages, awaitingUpdate]);

  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [question?.msgId]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, working]);

  // ---- input paths (both normalize to UserEvent server-side) ----
  const sendText = async (text: string, uploadIds: string[] = []) => {
    text = text.trim();
    if ((!text && !uploadIds.length) || submitting.current || busy || offline || working || awaitingUpdate) return false;
    submitting.current = true; setBusy(true);
    changeDraft(""); setError(null);
    try {
      submittedAfter.current = lastSeq.current; setAwaitingUpdate(true);
      await api.threads.sendText(threadId, text, draftFocus, uploadIds);
      setDraftFocus(null);
      await poll();
      return true;
    } catch (e) {
      submittedAfter.current = null; setAwaitingUpdate(false);
      if (e instanceof Error && e.name === "AbortError") return false;
      changeDraft(text); setError(e instanceof Error ? e.message : "Your message was not sent.");
      return false;
    } finally {
      submitting.current = false; setBusy(false);
    }
  };

  const sendAction = async (artifactId: string, event: string, values: string[] = []) => {
    if (submitting.current || busy || offline || working || awaitingUpdate) return false;
    if (event === "feedback") {
      const artifact = Object.values(byTab).flat().find((a) => a.id === artifactId);
      setDraftFocus(artifactId);
      changeDraft(`Please change ${artifact?.title ?? "this option"}: `);
      promptRef.current?.focus();
      return false;
    }
    submitting.current = true; setBusy(true);
    try {
      setError(null); submittedAfter.current = lastSeq.current; setAwaitingUpdate(true);
      await api.threads.sendAction(threadId, artifactId, event, values);
      await poll();
      return true;
    } catch (e) {
      submittedAfter.current = null; setAwaitingUpdate(false);
      if (e instanceof Error && e.name !== "AbortError") setError(e.message);
      return false;
    } finally {
      submitting.current = false; setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "TEXTAREA" && tag !== "INPUT") {
        e.preventDefault();
        promptRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPromptKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void sendText(draft);
    }
    if (e.key === "ArrowUp" && !draft) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const t = (lastUser?.envelope as any)?.text;
      if (t) changeDraft(t);
    }
  };

  const kind = thread?.kind ?? kindHint;
  const fill = { height: `calc(100dvh - ${shellTop}px)` };

  if (!kind) {
    return (
      <div ref={shell} className="flex items-center justify-center" style={fill} role="status">
        <p className="text-[13px] italic text-muted">
          {offline ? connectionError ?? "Thread is unavailable — retrying…" : "Loading thread…"}
        </p>
      </div>
    );
  }

  if (kind !== "campaign") {
    // Content and Creative Studio threads were deleted; the server 410s them.
    // Say what happened rather than render a shell that cannot send.
    return (
      <div ref={shell} className="ms-dark cb-screen grid place-items-center px-6" style={fill}>
        <p className="max-w-[420px] text-center text-[13.5px] text-[var(--ms-text-2)]">
          This is a <b>{kind}</b> thread from the pre-campaign app. Those were removed — the
          messages are still in the database, but nothing can be sent to it.
        </p>
      </div>
    );
  }

  const name = thread?.series_name || "…";
  const cards = byTab[tab];

  return (
    <div
      ref={shell}
      className="thread-shell ms-dark flex overflow-hidden bg-[var(--ms-bg)] text-[var(--ms-text)]"
      style={fill}
    >
      <CampaignStyles />

      {/* ══ LEFT — the conversation, and every CTA in it ══ */}
      <section className="thread-conversation flex min-w-0 flex-1 flex-col border-r border-[var(--ms-line)]">
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-[var(--ms-line)] px-4">
          <span className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-[var(--ms-blue)]">
            <span className="h-[5px] w-[5px] rounded-full bg-white shadow-[4px_0_0_#fff]" />
          </span>
          <span className="flex-1 truncate text-[14px] font-semibold">{name}</span>
          <span className="text-[13px] text-[var(--ms-text-2)]">
            {thread?.stage ? `stage · ${thread.stage}` : ""}
          </span>
        </header>

        {(thread?.cached || thread?.prepared) && <div className="prepared-thread-note">Prepared sample · zero provider calls. Artifacts and follow-ups use fixture content.</div>}
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4.5 py-5"
        >
          {messages.map((m) =>
            m.role === "agent" ? (
              <AgentTurn key={m.id} envelope={m.envelope as AgentMessage} />
            ) : (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-[12px] bg-[var(--ms-elev)] px-3.5 py-2.5 text-[15px] leading-[22px]">
                  {(m.envelope as any).text ??
                    friendlyAction(m.envelope as any)}
                </div>
              </div>
            )
          )}

          {/* labelled step, never a bare spinner */}
          {working && (
            <div className="flex items-center gap-2.5 text-[14px] text-[var(--ms-text-2)]" role="status">
              <span className="h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--ms-line-strong)] border-t-[var(--ms-blue)] motion-reduce:animate-none" />
              {working}…
            </div>
          )}
          {!messages.length && !working && (
            <p className="py-10 text-center text-[13px] italic text-[var(--ms-text-2)]">
              Thread loading…
            </p>
          )}
        </div>

        <div className="shrink-0 px-4.5 pb-2.5">
          {error && <p className="form-error mb-2" role="alert">{error}</p>}
          {offline && (
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--ms-text)]">
              {connectionError || "Connection lost — reconnecting…"}
            </p>
          )}

          {thread?.recovery && (
            <div className="mb-3 rounded-xl border border-[var(--ms-line)] bg-[var(--ms-elev)] p-3">
              <p className="mb-2 text-[12px] text-[var(--ms-text-2)]">{thread.recovery.warning}</p>
              <button className="cb-btn cb-btn-primary" disabled={busy || offline || Boolean(working) || awaitingUpdate}
                onClick={() => thread.recovery && sendAction(thread.recovery.artifact_id, thread.recovery.event)}>
                {busy ? "Retrying…" : thread.recovery.label}
              </button>
            </div>
          )}

          {/* ---- the ask, directly above the composer ---- */}
          {question && !thread?.recovery && (
            <AskStrip
              question={question.q}
              picked={picked}
              onPick={setPicked}
              busy={busy || offline || Boolean(working) || awaitingUpdate}
              onAnswer={(event, artifactId, values) =>
                sendAction(artifactId ?? "intake", event, values)
              }
            />
          )}

          <PromptModal
            placeholder={PLACEHOLDER}
            note={PROMPT_HINT}
            value={draft}
            onValue={changeDraft}
            onSend={sendText}
            onKeyDown={onPromptKey}
            inputRef={promptRef}
            busy={busy || Boolean(working) || awaitingUpdate}
            offline={offline}
          >
            {draftFocus && <div className="mb-2 flex items-center gap-2 text-[12px] text-[var(--ms-text-2)]"><span>Editing {Object.values(byTab).flat().find((a) => a.id === draftFocus)?.title ?? "selected option"}</span><button type="button" aria-label="Clear editing focus" onClick={() => setDraftFocus(null)}>✕</button></div>}
          </PromptModal>
        </div>
      </section>

      {/* ══ RIGHT — read-only review, tabs the agent drives ══ */}
      <section className="thread-artifacts flex min-w-0 flex-1 flex-col">
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-[var(--ms-line)] px-4">
          <span className="flex-1 truncate text-[14px] font-semibold">{name}</span>
          <button
            onClick={() => setFollowing((f) => !f)}
            title={
              following
                ? "The agent switches tabs as it works. Click to hold this tab."
                : "Holding this tab. Click to follow the agent again."
            }
            className={`flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] transition-colors ${
              following
                ? "text-[var(--ms-blue-text)]"
                : "text-[var(--ms-text-2)] hover:text-[var(--ms-text)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                following
                  ? "bg-[var(--ms-blue)] animate-pulse motion-reduce:animate-none"
                  : "bg-[var(--ms-line-strong)]"
              }`}
            />
            {following ? "Following" : "Held"}
          </button>
        </header>

        <nav className="flex shrink-0 gap-0.5 border-b border-[var(--ms-line)] px-3" role="tablist">
          {ARTIFACT_TABS.map((t) => {
            const n = byTab[t.id].length;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(t.id);
                  setFollowing(false);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] transition-colors ${
                  on
                    ? "border-b-[var(--ms-blue)] font-semibold text-[var(--ms-text)]"
                    : "border-b-transparent text-[var(--ms-text-2)] hover:text-[var(--ms-text)]"
                }`}
              >
                {on && working && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ms-blue)] motion-reduce:animate-none" />
                )}
                {t.label}
                {n > 0 && (
                  <span
                    className={`rounded-[4px] px-1.5 text-[10px] font-mono ${
                      on
                        ? "bg-[var(--ms-blue-wash)] text-[var(--ms-blue-text)]"
                        : "bg-[var(--ms-elev)] text-[var(--ms-text-2)]"
                    }`}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {cards.length ? (
            <div className="space-y-4">
              {cards.map((a) => (
                <div key={a.id}>
                  <div className="mb-2 flex justify-end"><button type="button" onClick={() => setDetail(a)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[var(--ms-blue-text)] hover:bg-[var(--ms-blue-wash)]">View details<span className="sr-only">: {a.title}</span></button></div>
                  <CampaignArtifactCard artifact={campaignArtifactForReview(a, question?.q ?? null)} readOnly />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-10 text-center">
              <p className="text-[14px] text-[var(--ms-text-2)]">Nothing here yet</p>
              <p className="max-w-[290px] text-[13px] leading-[19px] text-[var(--ms-text-2)] opacity-70">
                The agent fills this tab and switches to it the moment it has something.
              </p>
            </div>
          )}
        </div>
      </section>

      {detail && (
        <ArtifactDetail
          artifact={campaignArtifactForReview(detail, question?.q ?? null)}
          busy={busy || offline || Boolean(working) || awaitingUpdate}
          threadId={threadId}
          onClose={() => setDetail(null)}
          onAction={async (artifactId, event) => {
            const accepted = await sendAction(artifactId, event);
            setDetail(null); // Any validation error remains visible in the conversation.
            return accepted;
          }}
        />
      )}
    </div>
  );
}

// ---- one agent turn: envelope text only; content lives in the panel ---------
function AgentTurn({ envelope }: { envelope: AgentMessage }) {
  if (!envelope.text) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-[var(--ms-blue)]">
          <span className="h-[5px] w-[5px] rounded-full bg-white shadow-[4px_0_0_#fff]" />
        </span>
        <b className="text-[14px] font-semibold">Plotline</b>
        {envelope.artifacts?.length > 0 && (
          <span className="rounded-[5px] bg-[var(--ms-blue-wash)] px-1.5 py-[1px] text-[11px] font-semibold text-[var(--ms-blue-text)]">
            {envelope.artifacts.length === 1
              ? envelope.artifacts[0].title
              : `${envelope.artifacts.length} cards`}
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[15px] leading-[24px]">{envelope.text}</p>
    </div>
  );
}

// A tapped option shows as what it MEANT, not as its wire event.
function friendlyAction(envelope: any): string {
  const a = envelope?.action;
  if (!a) return "";
  if (a.values?.length) return a.values.join(", ");
  return String(a.event ?? "").replace(/_/g, " ");
}

// ---- the ask: sits directly above the composer, Claude-Code style -----------
function AskStrip({
  question,
  picked,
  onPick,
  busy,
  onAnswer,
}: {
  question: AgentQuestion;
  picked: string[];
  onPick: (v: string[]) => void;
  busy: boolean;
  onAnswer: (event: string, artifactId: string | null, values: string[]) => void;
}) {
  // Answer-only options (no event) are the CHOICES; the ones carrying an event
  // are the commit buttons. In a single-select question the choice IS the
  // commit, so it fires immediately.
  const choices = question.options.filter((o) => !o.event);
  const commits = question.options.filter((o) => o.event);

  const toggle = (label: string) => {
    if (!question.multi) {
      onPick([label]);
      return;
    }
    onPick(picked.includes(label) ? picked.filter((p) => p !== label) : [...picked, label]);
  };

  return (
    <div className="mb-2.5 max-h-[42dvh] overflow-y-auto rounded-[12px] border border-[var(--ms-blue)] bg-[var(--ms-blue-wash)] px-3.5 py-3">
      <p className="text-[14px] font-semibold leading-[20px]">{question.text}</p>

      {choices.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {choices.map((o) => {
            const on = picked.includes(o.label);
            return (
              <button
                key={o.label}
                disabled={busy}
                onClick={() => toggle(o.label)}
                aria-pressed={on}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${
                  on
                    ? "border-[var(--ms-blue)] bg-[var(--ms-blue)] font-semibold text-white"
                    : "border-[var(--ms-blue)] text-[var(--ms-blue-text)] hover:bg-[var(--ms-blue)] hover:text-white"
                }`}
              >
                {question.multi && <span aria-hidden className="mr-1.5">{on ? "✓" : "○"}</span>}
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {commits.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {commits.map((o) => (
            <button
              key={`${o.event}-${o.label}`}
              disabled={busy}
              onClick={() => onAnswer(o.event!, o.artifact_id, picked)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                o.primary
                  ? "bg-[var(--ms-blue)] text-white hover:bg-[var(--ms-blue-hover-solid)]"
                  : "border border-[var(--ms-line-strong)] text-[var(--ms-text-2)] hover:text-[var(--ms-text)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {question.note && (
        <p className="mt-2.5 text-[13px] leading-[19px] text-[var(--ms-text-2)]">{question.note}</p>
      )}
      {question.free_text && (
        <p className="mt-2 text-[12px] text-[var(--ms-text-2)] opacity-75">
          …or just type your answer below.
        </p>
      )}
    </div>
  );
}

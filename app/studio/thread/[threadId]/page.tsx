"use client";

// Addendum-01 §01–§04: chat-first Content Studio. Left = series rail (no
// stages, numbered threads). Center = thread with artifact card stacks +
// prompt bar. Right = detail panel on card click.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  API_URL,
  AgentMessage,
  ArtifactEnvelope,
  ConceptState,
  Series,
  Thread,
  ThreadMessage,
  api,
} from "@/lib/api";
import { ArtifactCard } from "@/components/thread-artifacts";
import { CampaignArtifactCard, isCampaignArtifact } from "@/components/campaign-artifacts";
import { ArtifactPanel } from "@/components/artifact-panel";
import { CampaignStyles, PromptModal } from "@/components/campaign-blocks";

const POLL_MS = 1200;

// The kind decides the whole theme, so it can't wait for the first poll: the
// campaign screens navigate with ?kind=campaign, and every thread caches what
// it turned out to be for the next visit.
const KIND_PREFIX = "plotline.threadkind.";

const PROMPT_HINT = "⌘↵ send · / focus · Esc closes panel · ↑ edits last message";
const PLACEHOLDER_MS = 'Tweak anything… ("approve o2", "regenerate o1 — punchier", "skip templates")';
const PLACEHOLDER_LEGACY = 'Tweak anything… ("approve c2", "regenerate c3 — punchier", "pick f1")';

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const search = useSearchParams();
  const router = useRouter();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [states, setStates] = useState<Record<string, ConceptState>>({});
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [campaignList, setCampaignList] = useState<any[]>([]);
  const [threadsBySeries, setThreadsBySeries] = useState<Record<string, Thread[]>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [panel, setPanel] = useState<ArtifactEnvelope | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const lastSeq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  // ---- theme kind: hint → cache → the thread itself (§Addendum-03) ----
  const kindKey = `${KIND_PREFIX}${threadId}`;
  const [kindHint, setKindHint] = useState<string | null>(search.get("kind"));
  useEffect(() => {
    setKindHint(search.get("kind") ?? localStorage.getItem(kindKey));
  }, [kindKey, search]);
  useEffect(() => {
    if (thread?.kind) localStorage.setItem(kindKey, thread.kind);
  }, [kindKey, thread?.kind]);

  // The thread fills from under the app header to the viewport floor. Measured,
  // not assumed: layout.tsx belongs to another lane, and the 57px Phase-1 guess
  // left a 3.5px dead strip (h-14 + 1px border at a 15px root is 53.5px).
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

  // ---- draft persistence per thread (§04) ----
  useEffect(() => {
    setDraft(localStorage.getItem(`plotline.draft.${threadId}`) ?? "");
  }, [threadId]);
  useEffect(() => {
    localStorage.setItem(`plotline.draft.${threadId}`, draft);
  }, [draft, threadId]);

  // ---- polling ----
  const poll = useCallback(async () => {
    try {
      const t = await api.threads.get(threadId, lastSeq.current);
      setOffline(false);
      setThread((prev) => ({ ...t, messages: undefined }));
      setWorking(t.working ?? null);
      if (t.concept_states) {
        setStates(Object.fromEntries(t.concept_states.map((s) => [s.concept_id, s])));
      }
      if (t.messages?.length) {
        setMessages((prev) => {
          // concurrent polls can overlap — dedupe by seq, order stays stable
          const have = new Set(prev.map((p) => p.seq));
          const fresh = t.messages!.filter((m) => !have.has(m.seq));
          if (!fresh.length) return prev;
          const merged = [...prev, ...fresh];
          lastSeq.current = merged[merged.length - 1].seq;
          return merged;
        });
      }
    } catch {
      setOffline(true); // §04: thread persists locally, prompt bar disables
    }
  }, [threadId]);

  useEffect(() => {
    lastSeq.current = 0;
    setMessages([]);
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  // ---- rail data ----
  useEffect(() => {
    api.campaigns.list().then(setCampaignList).catch(() => setCampaignList([]));
  }, [threadId]);

  // ---- deep link: ?artifact= restores the open panel (§02) ----
  const allArtifacts = useMemo(() => {
    const map = new Map<string, ArtifactEnvelope>();
    for (const m of messages) {
      if (m.role !== "agent") continue;
      for (const a of (m.envelope as AgentMessage).artifacts ?? []) map.set(a.id, a); // last version wins
    }
    return map;
  }, [messages]);

  useEffect(() => {
    const target = search.get("artifact");
    if (target && !panel && allArtifacts.has(target)) setPanel(allArtifacts.get(target)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allArtifacts]);

  const openPanel = (a: ArtifactEnvelope) => {
    setPanel(a); // one panel at a time — clicking another card swaps content
    router.replace(`/studio/thread/${threadId}?artifact=${a.id}`, { scroll: false });
  };
  const closePanel = useCallback(() => {
    setPanel(null);
    router.replace(`/studio/thread/${threadId}`, { scroll: false });
  }, [router, threadId]);

  // keep the panel showing the latest version of its artifact
  useEffect(() => {
    if (panel) {
      const fresh = allArtifacts.get(panel.id);
      if (fresh && fresh !== panel) setPanel(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allArtifacts]);

  // ---- autoscroll (respects user scroll-up) ----
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, working]);

  // ---- input paths (§05: both normalize to UserEvent) ----
  // UserEvent is Strict and has no attachment field, so upload ids ride in the
  // message body on their own line. Worded with no bare digit and no dash on
  // purpose: app/campaign.py's command grammar reads counts, option ids and the
  // "— note" tail out of this same string, and must still see only the user's.
  const sendText = async (uploadIds: string[] = []) => {
    const text = draft.trim();
    if ((!text && !uploadIds.length) || busy || offline) return false;
    setBusy(true);
    setDraft("");
    try {
      const body = [text, uploadIds.length ? `[attached images: ${uploadIds.join(" ")}]` : ""]
        .filter(Boolean)
        .join("\n");
      await api.threads.sendText(threadId, body, panel?.id ?? null);
      await poll();
      return true;
    } catch {
      setDraft(text); // don't lose the message
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendAction = async (artifactId: string, event: string) => {
    if (busy || offline) return;
    // ConceptCard's regenerate path carries a note: "regenerate:<note>"
    if (event.startsWith("regenerate:")) {
      const note = event.slice("regenerate:".length);
      setBusy(true);
      try {
        await api.threads.sendText(threadId, `regenerate ${artifactId} — ${note}`);
        await poll();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (event === "feedback") {
      // Feedback = prompt-bar prefill; the note travels the typed path
      setDraft(`feedback ${artifactId} — `);
      promptRef.current?.focus();
      return;
    }
    if (event === "regenerate" && !confirm(`Regenerate ${artifactId}? This overwrites the current concept.`)) {
      return; // §04: destructive confirm — approvals never get one
    }
    setBusy(true);
    try {
      await api.threads.sendAction(threadId, artifactId, event);
      await poll();
    } finally {
      setBusy(false);
    }
  };

  // ---- keyboard (§04): Cmd+Enter send · Esc close · / focus · ↑ edit last ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        promptRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel]);

  const onPromptKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendText();
    }
    if (e.key === "ArrowUp" && !draft) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const t = (lastUser?.envelope as any)?.text;
      if (t) setDraft(t);
    }
  };

  const ctx = thread ? seriesList.find((s) => s.id === thread.series_id)?.context : null;
  const objective = ctx?.objective ?? "followers";
  const threadLabel = thread ? `${thread.series_name || "…"} — ${String(thread.ordinal).padStart(2, "0")}` : "…";
  // Addendum-03: campaign threads run the dark Marketing Studio theme; the
  // legacy Plotline threads keep the light surfaces untouched.
  const kind = thread?.kind ?? kindHint;
  const msMode = kind === "campaign";
  const fill = { height: `calc(100dvh - ${shellTop}px)` };

  // Same two lines above either prompt bar.
  const offlineLine = offline ? (
    <p className="mb-1.5 text-[12px] font-semibold text-low">Connection lost — the thread is safe; reconnecting…</p>
  ) : null;
  const panelChip = panel ? (
    <button
      className="chip mb-1.5 !border-accent !text-accent"
      onClick={closePanel}
      title='Messages resolve "this / it" to the open artifact'
    >
      {panel.id} · {panel.title.slice(0, 40)} ✕
    </button>
  ) : null;

  // Neither theme is known yet (a cold link to a thread this browser has never
  // opened). Light chrome here would be repainted dark a poll later, so hold
  // the surfaces and show the one honest thing we have.
  if (!kind) {
    return (
      <div ref={shell} className="flex items-center justify-center" style={fill} role="status">
        <p className="text-[13px] italic text-muted">
          {offline ? "Can't reach the thread API — retrying…" : "Loading thread…"}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={shell}
      className={`flex overflow-hidden ${msMode ? "ms-dark bg-[var(--ms-bg,#0E1116)] text-[var(--ms-text,#FFFFFF)]" : ""}`}
      style={{ ...fill, ["--thread-top" as string]: `${shellTop}px` } as React.CSSProperties}
    >
      {msMode && <CampaignStyles />}
      {/* ---- left rail: series only, numbered threads, no stages (§03) ---- */}
      <aside
        className="hidden w-[230px] shrink-0 overflow-y-auto border-r border-line bg-paper/60 p-3 lg:block"
        aria-label={msMode ? "Campaigns" : "Series"}
      >
        <div className="flex items-center justify-between px-1">
          {/* one mode's vocabulary at a time — a campaign thread never says series */}
          <p className="field-label">{msMode ? "Campaigns" : "Series"}</p>
          <Link href={msMode ? "/studio/campaign" : "/studio"} className="text-[12px] font-semibold text-accent">
            + New
          </Link>
        </div>
        <div className="mt-2 space-y-3">
          {msMode
            ? campaignList.map((c: any) => {
                const active = c.thread_id === threadId;
                return (
                  <Link
                    key={c.id}
                    href={`/studio/thread/${c.thread_id}?kind=campaign`}
                    className={`block truncate rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-[12.5px] ${
                      active
                        ? "border-l-[var(--ms-blue,#4353FF)] bg-[var(--ms-elev,#1E242E)] font-bold"
                        : "border-l-transparent hover:bg-[var(--ms-elev,#1E242E)]"
                    }`}
                    title={`${c.name} — ${c.status}`}
                  >
                    {active && <span className="mr-1 text-[var(--ms-blue-text,#A3AEFF)]">●</span>}
                    {c.name}
                  </Link>
                );
              })
            : null}
          {!msMode && (["active", "done"] as const).map((group) => {
            const items = seriesList.filter((s) =>
              group === "active" ? s.status !== "approved" : s.status === "approved"
            );
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted">{group}</p>
                <div className="mt-1 space-y-0.5">
                  {items.map((s) => {
                    const threads = threadsBySeries[s.id] ?? [];
                    return threads.length ? (
                      threads.map((t) => {
                        const active = t.id === threadId;
                        return (
                          <Link
                            key={t.id}
                            href={`/studio/thread/${t.id}`}
                            className={`block truncate rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-[12.5px] ${
                              active
                                ? "border-l-accent bg-card font-bold"
                                : "border-l-transparent text-ink-soft hover:bg-card"
                            }`}
                            title={s.name}
                          >
                            {active && <span className="mr-1 text-accent">●</span>}
                            {s.name} — {String(t.ordinal).padStart(2, "0")}
                          </Link>
                        );
                      })
                    ) : (
                      <Link
                        key={s.id}
                        href={`/studio/${s.id}`}
                        className="block truncate rounded-[10px] border-l-[3px] border-l-transparent px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-card"
                        title={`${s.name} (pre-thread series)`}
                      >
                        {s.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ---- center: the thread ---- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-card px-5 py-2.5">
          <p className="mono text-[10.5px] uppercase tracking-wider text-accent">
            {msMode ? "Campaign Studio" : "Content Studio"}
          </p>
          <h1 className="text-[15px] font-bold">{threadLabel}</h1>
        </div>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          <div className="w-full space-y-4 pr-2">
            {messages.map((m) =>
              m.role === "agent" ? (
                <div key={m.id} className="space-y-2">
                  {(m.envelope as AgentMessage).text && (
                    <p className="text-[13.5px] leading-relaxed text-ink-soft">
                      {(m.envelope as AgentMessage).text}
                    </p>
                  )}
                  {((m.envelope as AgentMessage).artifacts ?? []).map((a) =>
                    isCampaignArtifact(a.type) ? (
                      <CampaignArtifactCard
                        key={`${m.id}-${a.id}`}
                        artifact={a}
                        onOpen={openPanel}
                        onAction={sendAction}
                        busy={busy}
                      />
                    ) : (
                      <ArtifactCard
                        key={`${m.id}-${a.id}`}
                        artifact={a}
                        onOpen={openPanel}
                        onAction={sendAction}
                        busy={busy}
                        approved={states[a.id]?.approved === 1}
                      />
                    )
                  )}
                  {(m.envelope as AgentMessage).question && (
                    <p className="text-[13.5px] font-semibold">{(m.envelope as AgentMessage).question}</p>
                  )}
                </div>
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[75%] rounded-[14px] rounded-br-[4px] border border-line bg-card px-3.5 py-2 text-[13.5px]">
                    {(m.envelope as any).text ??
                      `${(m.envelope as any).action?.event} ${(m.envelope as any).action?.artifact_id}`}
                  </div>
                </div>
              )
            )}

            {/* §04: labeled steps, never a bare spinner */}
            {working && (
              <div className="flex items-center gap-2 text-[13px] text-muted" role="status">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
                {working}…
              </div>
            )}
            {!messages.length && !working && (
              <p className="py-10 text-center text-[13px] italic text-muted">Thread loading…</p>
            )}
          </div>
        </div>

        {/* ---- prompt bar: the v2 modal on campaign threads, with the attach
             counter and the honestly-inert gear; legacy threads keep theirs ---- */}
        {msMode ? (
          <PromptModal
            placeholder={PLACEHOLDER_MS}
            note={PROMPT_HINT}
            value={draft}
            onValue={setDraft}
            onSend={(_text, uploadIds) => sendText(uploadIds)}
            onKeyDown={onPromptKey}
            inputRef={promptRef}
            busy={busy}
            offline={offline}
          >
            {offlineLine}
            {panelChip}
          </PromptModal>
        ) : (
          <div className="border-t border-line bg-card px-5 py-3">
            <div className="w-full">
              {offlineLine}
              {panelChip}
              <div className="flex items-end gap-2">
                <textarea
                  ref={promptRef}
                  className="input min-h-[44px] flex-1 resize-none"
                  placeholder={PLACEHOLDER_LEGACY}
                  value={draft}
                  disabled={offline}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onPromptKey}
                  aria-label="Message the planning agent"
                />
                <button
                  className="btn btn-primary !rounded-full !px-4 !py-2.5"
                  onClick={() => sendText()}
                  disabled={busy || offline || !draft.trim()}
                  aria-label="Send"
                >
                  ↑
                </button>
              </div>
              <p className="mt-1 text-[10.5px] text-muted">{PROMPT_HINT}</p>
            </div>
          </div>
        )}
      </main>

      {/* ---- right panel (§02) — ≥1200px sits beside; below, overlay ---- */}
      {panel && (
        <>
          <div
            className="fixed inset-0 z-20 bg-ink/20 min-[1200px]:hidden"
            onClick={closePanel}
            aria-hidden
          />
          {/* --thread-top is the measured header height, set on the shell */}
          <div className="fixed right-0 top-[var(--thread-top)] z-30 h-[calc(100dvh-var(--thread-top))] w-[min(92vw,560px)] min-[1200px]:static min-[1200px]:z-auto min-[1200px]:h-full min-[1200px]:w-[40%] min-[1200px]:shrink-0">
            <ArtifactPanel
              threadId={threadId}
              seriesId={thread?.series_id ?? ""}
              artifact={panel}
              objective={objective}
              approved={states[panel.id]?.approved === 1}
              busy={busy}
              onClose={closePanel}
              onAction={sendAction}
            />
          </div>
        </>
      )}
    </div>
  );
}

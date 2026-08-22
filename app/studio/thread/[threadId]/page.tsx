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
import { ArtifactPanel } from "@/components/artifact-panel";

const POLL_MS = 1200;

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const search = useSearchParams();
  const router = useRouter();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [states, setStates] = useState<Record<string, ConceptState>>({});
  const [seriesList, setSeriesList] = useState<Series[]>([]);
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
    api.series.list().then(async (list) => {
      setSeriesList(list);
      const entries = await Promise.all(
        list.slice(0, 12).map(async (s) => [s.id, await api.series.threads(s.id).catch(() => [])] as const)
      );
      setThreadsBySeries(Object.fromEntries(entries));
    }).catch(() => {});
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
  const sendText = async () => {
    const text = draft.trim();
    if (!text || busy || offline) return;
    setBusy(true);
    setDraft("");
    try {
      await api.threads.sendText(threadId, text, panel?.id ?? null);
      await poll();
    } catch (e) {
      setDraft(text); // don't lose the message
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
    if (event === "edit_context") {
      router.push(`/studio?edit=${thread?.series_id}`);
      return;
    }
    if (event === "produce") {
      // Addendum-02 §01: concept card → Creative Studio per-post thread
      setBusy(true);
      try {
        const res = await fetch(`${API_URL}/api/series/${thread?.series_id}/concepts/${artifactId}/produce`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ option: "A" }),
        }).then((r) => r.json());
        if (res.thread?.id) router.push(`/studio/thread/${res.thread.id}`);
      } finally {
        setBusy(false);
      }
      return;
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

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* ---- left rail: series only, numbered threads, no stages (§03) ---- */}
      <aside className="hidden w-[230px] shrink-0 overflow-y-auto border-r border-line bg-paper/60 p-3 lg:block" aria-label="Series">
        <div className="flex items-center justify-between px-1">
          <p className="field-label">Series</p>
          <Link href="/studio" className="text-[12px] font-semibold text-accent">+ New</Link>
        </div>
        <div className="mt-2 space-y-3">
          {(["active", "done"] as const).map((group) => {
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
          <p className="mono text-[10.5px] uppercase tracking-wider text-accent">Content Studio</p>
          <h1 className="text-[15px] font-bold">{threadLabel}</h1>
        </div>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          <div className="mx-auto max-w-[760px] space-y-4">
            {messages.map((m) =>
              m.role === "agent" ? (
                <div key={m.id} className="space-y-2">
                  {(m.envelope as AgentMessage).text && (
                    <p className="text-[13.5px] leading-relaxed text-ink-soft">
                      {(m.envelope as AgentMessage).text}
                    </p>
                  )}
                  {((m.envelope as AgentMessage).artifacts ?? []).map((a) => (
                    <ArtifactCard
                      key={`${m.id}-${a.id}`}
                      artifact={a}
                      onOpen={openPanel}
                      onAction={sendAction}
                      busy={busy}
                      approved={states[a.id]?.approved === 1}
                    />
                  ))}
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

        {/* ---- prompt bar ---- */}
        <div className="border-t border-line bg-card px-5 py-3">
          <div className="mx-auto max-w-[760px]">
            {offline && (
              <p className="mb-1.5 text-[12px] font-semibold text-low">
                Connection lost — the thread is safe; reconnecting…
              </p>
            )}
            {panel && (
              <button
                className="chip mb-1.5 !border-accent !text-accent"
                onClick={closePanel}
                title='Messages resolve "this / it" to the open artifact'
              >
                {panel.id} · {panel.title.slice(0, 40)} ✕
              </button>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={promptRef}
                className="input min-h-[44px] flex-1 resize-none"
                placeholder='Tweak anything… ("approve c2", "regenerate c3 — punchier", "pick f1")'
                value={draft}
                disabled={offline}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onPromptKey}
                aria-label="Message the planning agent"
              />
              <button
                className="btn btn-primary !rounded-full !px-4 !py-2.5"
                onClick={sendText}
                disabled={busy || offline || !draft.trim()}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
            <p className="mt-1 text-[10.5px] text-muted">⌘↵ send · / focus · Esc closes panel · ↑ edits last message</p>
          </div>
        </div>
      </main>

      {/* ---- right panel (§02) — ≥1200px sits beside; below, overlay ---- */}
      {panel && (
        <>
          <div
            className="fixed inset-0 z-20 bg-ink/20 min-[1200px]:hidden"
            onClick={closePanel}
            aria-hidden
          />
          <div className="fixed right-0 top-[57px] z-30 h-[calc(100vh-57px)] min-[1200px]:static min-[1200px]:z-auto min-[1200px]:h-full">
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

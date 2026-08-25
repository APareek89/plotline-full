"use client";

/* TEMPORARY debug surface — its own tab, not attached to a thread.
 *
 * "Which node failed, and what was it asked?" is a question you ask ACROSS
 * runs. Hanging it off one campaign's panel meant you could only inspect a run
 * whose thread you had already opened, and it put a developer tool inside the
 * user's flow. This page is the whole log, newest first, filterable.
 *
 * Dev-only twice over: the server route 404s unless MOCK_LLM or
 * PLOTLINE_DEBUG_OBSERVABILITY is set, and the nav entry is hidden in a
 * production build. Delete this directory and the nav entry to remove it.
 */

import { useEffect, useMemo, useState } from "react";
import { AgentRun, api } from "@/lib/api";

export default function ObservabilityPage() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);

  const load = () => {
    api
      .agentRuns(300)
      .then((r) => {
        setRuns([...r.runs].reverse()); // newest first
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(load, []);

  const shown = useMemo(() => {
    if (!runs) return [];
    const needle = q.trim().toLowerCase();
    return runs.filter((r) => {
      if (onlyFailed && !(r.validation_errors ?? []).length) return false;
      if (!needle) return true;
      return (
        r.agent.toLowerCase().includes(needle) ||
        (r.campaign_name ?? "").toLowerCase().includes(needle) ||
        (r.thread_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [runs, q, onlyFailed]);

  const failedCount = (runs ?? []).filter((r) => (r.validation_errors ?? []).length).length;

  return (
    <div className="ms-dark min-h-screen bg-[var(--ms-bg,#0E1116)] px-6 py-6 text-[var(--ms-text,#fff)]">
      <div className="mx-auto max-w-[1100px]">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--ms-text-2,#A9B3C4)]">
          Debug · not part of the product
        </p>
        <h1 className="display mt-1 text-[21px] font-bold">Observability — agent nodes</h1>
        <p className="mt-1 text-[13px] text-[var(--ms-text-2,#A9B3C4)]">
          Every agent node that has run, newest first: what it was asked, what it returned, which tools it
          called, and every validation error (each one cost a retry).
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className="min-w-[260px] flex-1 rounded-[10px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-elev,#1E242E)] px-3 py-2 text-[13px] outline-none"
            placeholder="Filter by agent, campaign or thread id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setOnlyFailed((v) => !v)}
            className={`rounded-[10px] border px-3 py-2 text-[12.5px] ${
              onlyFailed
                ? "border-[var(--ms-danger,#E5312B)] text-[var(--ms-danger,#E5312B)]"
                : "border-[var(--ms-line,#2A3140)] text-[var(--ms-text-2,#A9B3C4)]"
            }`}
          >
            Only retried/failed ({failedCount})
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-[10px] border border-[var(--ms-line,#2A3140)] px-3 py-2 text-[12.5px] text-[var(--ms-text-2,#A9B3C4)]"
          >
            Refresh
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-[10px] border border-[var(--ms-warn,#E8A13C)] p-3 text-[13px] text-[var(--ms-warn,#E8A13C)]">
            {error.includes("404")
              ? "Observability is disabled on this server. Set PLOTLINE_DEBUG_OBSERVABILITY=1 (it exposes full prompts and payloads, so it stays off by default)."
              : error}
          </p>
        )}

        {runs === null && !error && (
          <p className="mt-6 text-[13px] text-[var(--ms-text-2,#A9B3C4)]">Loading…</p>
        )}

        {runs !== null && !shown.length && !error && (
          <p className="mt-6 text-[13px] text-[var(--ms-text-2,#A9B3C4)]">
            No runs match. Runs are captured from the moment an agent turn starts — anything older than the
            capture has no thread attribution.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {shown.map((r) => {
            const isOpen = open === r.run_id;
            const failed = (r.validation_errors ?? []).length > 0;
            return (
              <div
                key={r.run_id}
                className="rounded-[12px] border border-[var(--ms-line,#2A3140)] bg-[var(--ms-surface,#171B23)] p-3"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setOpen(isOpen ? null : r.run_id)}
                >
                  <span className="min-w-0">
                    <span className="mono text-[13px] font-semibold">{r.agent}</span>
                    {failed && (
                      <span className="ml-2 rounded-[6px] border border-[var(--ms-danger,#E5312B)] px-1.5 py-0.5 text-[10px] text-[var(--ms-danger,#E5312B)]">
                        {r.validation_errors.length} retry error{r.validation_errors.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="ml-2 block text-[12px] text-[var(--ms-text-2,#A9B3C4)]">
                      {r.campaign_name ? `${r.campaign_name} · ` : ""}
                      {r.duration_s}s · {r.attempts} attempt{r.attempts === 1 ? "" : "s"} · {r.model}
                      {r.mock ? " · mock" : ""}
                      {r.prompt_version ? ` · prompt ${r.prompt_version}` : ""}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--ms-text-2,#A9B3C4)]">{isOpen ? "▴" : "▾"}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-2">
                    {!!(r.cited_source_ids ?? []).length && (
                      <p className="text-[12px] text-[var(--ms-text-2,#A9B3C4)]">
                        <span className="mono uppercase tracking-[0.1em]">cited</span> ·{" "}
                        {r.cited_source_ids.join(", ")}
                      </p>
                    )}
                    {failed && (
                      <Block title="validation errors — each cost a retry" body={r.validation_errors.join("\n\n")} />
                    )}
                    {!!(r.tool_calls ?? []).length && (
                      <Block
                        title={`tool calls (${r.tool_calls.length})`}
                        body={r.tool_calls
                          .map((t) => `${t.tool} → ${t.result_count ?? "?"} result(s)\n${JSON.stringify(t.input)}`)
                          .join("\n\n")}
                      />
                    )}
                    <Block title="input" body={JSON.stringify(r.node_input, null, 2)} />
                    <Block title="output" body={JSON.stringify(r.node_output, null, 2)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <details className="rounded-[10px] border border-[var(--ms-line,#2A3140)] p-2">
      <summary className="mono cursor-pointer text-[11px] uppercase tracking-[0.1em] text-[var(--ms-text-2,#A9B3C4)]">
        {title}
      </summary>
      <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
        {body}
      </pre>
    </details>
  );
}

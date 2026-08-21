"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

interface RunEvent {
  ts: number;
  stage: string;
  message: string;
  terminal?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  retrieve: "Retrieving evidence",
  plan: "Planner drafting",
  critique: "Red-team judging",
  refine: "Refining flagged concepts",
  options: "Generating options",
  done: "Done",
  error: "Failed",
};

export function RunProgress({
  runId,
  onDone,
}: {
  runId: string;
  onDone: (ok: boolean) => void;
}) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const doneRef = useRef(false);

  useEffect(() => {
    const source = new EventSource(`${API_URL}/api/runs/${runId}/events`);
    source.onmessage = (msg) => {
      const event: RunEvent = JSON.parse(msg.data);
      setEvents((prev) => [...prev, event]);
      if (event.terminal && !doneRef.current) {
        doneRef.current = true;
        source.close();
        onDone(event.stage !== "error");
      }
    };
    source.onerror = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        source.close();
        onDone(false);
      }
    };
    return () => source.close();
  }, [runId, onDone]);

  const current = events[events.length - 1];
  const failed = current?.stage === "error";

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        {!current?.terminal && (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        )}
        <h3 className="text-[15px] font-bold">
          {failed ? "Pipeline failed" : current?.terminal ? "Plan ready" : "Planning in progress…"}
        </h3>
      </div>
      <ol className="mt-4 space-y-2">
        {events.map((event, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            <span
              className={
                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " +
                (event.stage === "error" ? "bg-low" : "bg-accent")
              }
            />
            <span>
              <span className="font-semibold">{STAGE_LABELS[event.stage] ?? event.stage}</span>{" "}
              <span className={event.stage === "error" ? "text-low" : "text-ink-soft"}>
                — {event.message}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

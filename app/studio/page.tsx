"use client";

// Addendum-01 §01: context blocks are the only form surface — on submit the
// form collapses into a pinned Context Summary card and planning is a thread.

import { useRouter } from "next/navigation";
import { ContextForm } from "@/components/context-form";

export default function NewSeriesPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-4xl anim-morph">
      <div className="mb-6">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Content Studio</p>
        <h1 className="display mt-1 text-2xl font-bold">Start a new plan</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Fill the context blocks once — then everything is a conversation with the planning agent.
        </p>
      </div>
      <ContextForm
        onCreated={(id, _context, thread) =>
          router.push(thread ? `/studio/thread/${thread.id}` : `/studio/${id}?stage=inspiration`)
        }
      />
    </div>
  );
}

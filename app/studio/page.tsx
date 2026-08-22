"use client";

// Addendum-01 §01: context blocks are the only form surface — on submit the
// form collapses into a pinned Context Summary card and planning is a thread.

import { useRouter } from "next/navigation";
import { ContextForm } from "@/components/context-form";

export default function NewSeriesPage() {
  const router = useRouter();
  return (
    <div className="anim-morph px-6 py-3">
      <div className="mb-3 flex items-baseline gap-3">
        <h1 className="display text-xl font-bold">Start a new plan</h1>
        <p className="text-[12.5px] text-muted">
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

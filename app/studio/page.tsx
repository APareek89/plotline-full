"use client";

import { useRouter } from "next/navigation";
import { ContextForm } from "@/components/context-form";

export default function NewSeriesPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Content Studio</p>
        <h1 className="display mt-1 text-2xl font-bold">Start a new plan</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Context → Inspiration → Plan → Concepts &amp; options. The engine plans only what it can defend with evidence.
        </p>
      </div>
      <ContextForm onCreated={(id) => router.push(`/studio/${id}?stage=inspiration`)} />
    </div>
  );
}

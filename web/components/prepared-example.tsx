"use client";
import { session } from "@/lib/client/session";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { api } from "@/lib/api";

export default function PreparedExample() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function open() {
    if (busy) return; setBusy(true); setError("");
    try { const epoch = session.capture(); const made = await api.examples.create(); session.assert(epoch); router.push(`/studio/thread/${made.thread.id}?kind=campaign`); }
    catch (e) { if (e instanceof Error && e.name !== "AbortError") setError(e.message); setBusy(false); }
  }
  return <aside className="prepared-example">
    <span className="prepared-badge"><BookOpen size={14} aria-hidden="true" />Prepared sample · zero provider calls</span>
    <p>Explore a prepared ceramic mugs image campaign, reviewing each step from its brief to the final creative. Follow-up actions stay in prepared mode.</p>
    <button className="ui-button pill" disabled={busy} aria-busy={busy} onClick={open}>{busy ? "Preparing example…" : "Try with an example"}<ArrowRight size={16} aria-hidden="true" /></button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </aside>;
}

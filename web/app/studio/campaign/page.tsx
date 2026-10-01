"use client";
import { session } from "@/lib/client/session";

// Starting a campaign requires a product image and a short prompt. Planning
// details are captured by the agent in chat; naming is derived, not another gate.
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PreparedExample from "@/components/prepared-example";
import { CampaignSummary, api } from "@/lib/api";
import { CampaignStyles, ErrorStrip, PromptModal } from "@/components/campaign-blocks";
import { campaignNameFromPrompt, campaignStartProblem } from "@/lib/client/campaign-flow";

export default function CampaignStudioPage() {
  return <><CampaignStyles /><Suspense fallback={<div className="ms-dark cb-screen h-[calc(100dvh-53.5px)]" />}><StartCampaign /></Suspense></>;
}

function StartCampaign() {
  const router = useRouter();
  const [existing, setExisting] = useState<CampaignSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedThread, setSavedThread] = useState<string | null>(null);
  const created = useRef<{ campaign_id: string; thread: { id: string } } | null>(null);
  const submitting = useRef(false);

  useEffect(() => { api.campaigns.list().then(setExisting).catch(() => setExisting([])); }, []);

  const start = async (text: string, uploadIds: string[]) => {
    if (submitting.current) return false;
    const problem = campaignStartProblem(text, uploadIds);
    if (problem) { setValidationError(problem); return false; }
    submitting.current = true;
    setBusy(true); setError(null); setValidationError(null);
    try {
      const epoch = session.capture();
      if (!created.current) {
        const name = campaignNameFromPrompt(text, existing.map((campaign) => campaign.name));
        const made = await api.campaigns.create(name);
        session.assert(epoch);
        created.current = made;
        setSavedThread(made.thread.id);
      }
      await api.threads.sendText(created.current.thread.id, text.trim(), null, uploadIds);
      session.assert(epoch);
      router.push(`/studio/thread/${created.current.thread.id}?kind=campaign`);
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return false;
      setError(e instanceof Error ? e.message : "Your campaign could not be started.");
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="campaign-create ms-dark cb-screen flex h-[calc(100dvh-53.5px)] flex-col items-center justify-center px-6">
      <div className="w-[640px] max-w-full">
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em]">What are we making?</h1>
        <p className="mt-3 text-[15px] leading-6 text-[var(--ms-text-2)]">Add a product photo and a one-line prompt. I&apos;ll ask about anything else in the conversation.</p>
        <div className="mt-6 overflow-hidden rounded-[16px] border border-[var(--ms-line)]">
          <PromptModal
            placeholder="Create a summer campaign for these casual T-shirts…"
            note={busy ? "Opening your campaign…" : "Product image + one line to start. Brand, audience and channel can be worked out in chat."}
            value={prompt}
            onValue={(value) => { setPrompt(value); setValidationError(null); }}
            onImageAttached={() => setValidationError(null)}
            onSend={start}
            busy={busy}
            sendLabel={savedThread ? "Send opening message" : "Start campaign"}
          />
        </div>
        {validationError && <div className="mt-3"><ErrorStrip>{validationError}</ErrorStrip></div>}
        {error && <div className="mt-3"><ErrorStrip>{error}</ErrorStrip></div>}
        {error && savedThread && <p className="mt-3 text-[13px] leading-5 text-[var(--ms-text-2)]">Your campaign was saved. <Link className="font-semibold underline" href={`/studio/thread/${savedThread}?kind=campaign`}>Open it</Link> to check whether your message arrived before sending it again; an accepted request may already have started work.</p>}
        {existing.length > 0 && <Link href="/campaigns" className="mt-5 inline-block text-[13.5px] text-[var(--ms-text-2)] underline underline-offset-4">Open an existing campaign</Link>}
        <PreparedExample />
      </div>
    </div>
  );
}

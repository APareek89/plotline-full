"use client";

// Campaign Studio — the create surface. Owner decision 2026-08-26: landing
// here starts the journey by naming the campaign, full stop. There is no path
// fork and no detail-card screen any more; naming is the only form in the
// product and everything else is said to the agent in the thread.
//
// My Campaigns is the BROWSE surface. This one exists to start something.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampaignSummary, api } from "@/lib/api";
import {
  CampaignStyles,
  ErrorStrip,
  MsApiError,
  nameError,
} from "@/components/campaign-blocks";

export default function CampaignStudioPage() {
  return (
    <>
      <CampaignStyles />
      <Suspense fallback={<div className="ms-dark cb-screen h-[calc(100dvh-53.5px)]" />}>
        <NameCampaign />
      </Suspense>
    </>
  );
}

function NameCampaign() {
  const router = useRouter();
  const [existing, setExisting] = useState<CampaignSummary[]>([]);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.campaigns.list().then(setExisting).catch(() => setExisting([]));
  }, []);

  const problem = touched ? nameError(name, existing) : null;

  const create = useCallback(async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    if (nameError(clean, existing)) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const made = await api.campaigns.create(clean);
      router.push(`/studio/thread/${made.thread.id}?kind=campaign`);
    } catch (e) {
      setError(e instanceof MsApiError ? e.message : String(e));
      setBusy(false);
    }
  }, [name, busy, existing, router]);

  return (
    <div className="ms-dark cb-screen flex h-[calc(100dvh-53.5px)] flex-col items-center justify-center px-6">
      <div className="w-[485px] max-w-full">
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em]">
          What are we making?
        </h1>
        <p className="mt-2 text-[14px] text-[var(--ms-text-2)]">
          Give it a name. You&apos;ll tell me the rest in the thread.
        </p>

        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setTouched(true);
          }}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Spring launch"
          aria-label="Campaign name"
          aria-invalid={!!problem}
          className="cb-input mt-6 !h-[50px] !rounded-[12px] !text-[15px]"
        />

        {problem && (
          <p className="mt-2 text-[12.5px] font-semibold text-[var(--ms-text)]">{problem}</p>
        )}
        {error && <div className="mt-3"><ErrorStrip>{error}</ErrorStrip></div>}

        <div className="mt-5 flex items-center gap-3">
          <button
            className="cb-btn cb-btn-primary"
            onClick={create}
            disabled={busy || !name.trim() || !!problem}
          >
            {busy ? "Opening…" : "Start campaign"}
          </button>
          {existing.length > 0 && (
            <Link
              href="/campaigns"
              className="text-[13.5px] text-[var(--ms-text-2)] transition-colors hover:text-[var(--ms-text)]"
            >
              or open an existing one
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

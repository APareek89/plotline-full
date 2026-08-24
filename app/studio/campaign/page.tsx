"use client";

// v2 steps 0–2 — Campaign Studio's pre-thread screen, all three states on ONE
// dark canvas (no page navigation between them; the campaign and its thread
// already exist from step 0 onward).
//
//   step 0  near-blank: name the campaign (required, unique)
//   step 1  two path cards: structured here, or conversational in the thread
//   step 2  the three detail cards → Start campaign → thread
//
// The screen never owns campaign data: every card reads and writes the server,
// so switching to the conversational path and back keeps half-filled cards.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CampaignContext,
  CampaignDetailCards,
  CampaignStyles,
  CampaignSummary,
  CardsDone,
  ErrorStrip,
  MsApiError,
  PromptModal,
  WorkingLine,
  missingLabels,
  msFetch,
  msJson,
  nameError,
} from "@/components/campaign-blocks";

const LAST_CAMPAIGN_KEY = "plotline.campaign.current";

interface CampaignDetail {
  id: string;
  name: string;
  context: CampaignContext;
  status: string;
  cards_done: CardsDone;
  threads: { id: string; ordinal: number }[];
  ad_cards: unknown[];
}

const NO_CARDS: CardsDone = { product: false, campaign: false, brand: false };

export default function CampaignStudioPage() {
  // useSearchParams needs a boundary — /studio/campaign is a static route.
  // The style block sits outside it so the fallback is already dark.
  return (
    <>
      <CampaignStyles />
      <Suspense fallback={<div className="ms-dark cb-screen h-[calc(100dvh-53.5px)]" />}>
        <CampaignStudio />
      </Suspense>
    </>
  );
}

function CampaignStudio() {
  const router = useRouter();
  const search = useSearchParams();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listOffline, setListOffline] = useState(false);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The screen fills exactly from under the app header to the viewport floor.
  // Measured rather than hard-coded: layout.tsx belongs to another lane, and
  // 57px (the Phase-1 guess) leaves 3.5px of dead space at a 15px root.
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

  const campaignId = detail?.id ?? null;
  const threadId = detail?.threads?.[0]?.id ?? null;
  const cardsDone = detail?.cards_done ?? NO_CARDS;
  // cardsComplete, not cards_done: the API calls the brand card done the moment
  // the block saves, but /start (and the thread's own progress card) also want
  // the claims confirmed. Gate on the same rule the server enforces.
  const missing = missingLabels(detail?.context ?? null, cardsDone);
  const allDone = missing.length === 0;

  const loadList = useCallback(() => {
    msFetch<CampaignSummary[]>("/api/campaigns")
      .then((rows) => {
        setCampaigns(rows);
        setListOffline(false);
      })
      .catch(() => setListOffline(true));
  }, []);

  const loadCampaign = useCallback(async (id: string) => {
    const d = await msFetch<CampaignDetail>(`/api/campaigns/${id}`);
    setDetail(d);
    return d;
  }, []);

  // ---- resume: ?id= wins, then the last campaign started on this browser ----
  useEffect(() => {
    loadList();
    const id = search.get("id") ?? localStorage.getItem(LAST_CAMPAIGN_KEY);
    if (!id) return;
    loadCampaign(id)
      .then((d) => {
        setName(d.name);
        // Any saved card means the structured path was already chosen.
        setStep(d.cards_done.product || d.cards_done.campaign || d.cards_done.brand ? 2 : 1);
        localStorage.setItem(LAST_CAMPAIGN_KEY, d.id);
      })
      .catch(() => {
        localStorage.removeItem(LAST_CAMPAIGN_KEY); // stale id (dev DB reset)
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Path b writes the same blocks — re-read on return from the thread tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && campaignId) loadCampaign(campaignId).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [campaignId, loadCampaign]);

  const nameErr = nameError(name, campaigns);

  const createCampaign = async () => {
    setTouched(true);
    if (nameErr || working) return;
    setWorking("Creating the campaign and its first thread");
    setError(null);
    try {
      const res = await msJson<{ campaign_id: string; thread: { id: string; ordinal: number } }>(
        "/api/campaigns",
        "POST",
        { name: name.trim() }
      );
      localStorage.setItem(LAST_CAMPAIGN_KEY, res.campaign_id);
      router.replace(`/studio/campaign?id=${res.campaign_id}`, { scroll: false });
      await loadCampaign(res.campaign_id);
      loadList();
      setStep(1); // in place — no page navigation
    } catch (err) {
      setError(readError(err));
    } finally {
      setWorking(null);
    }
  };

  const startCampaign = async () => {
    if (!campaignId || working) return;
    setWorking("Starting the campaign");
    setError(null);
    try {
      await msJson<{ ok: boolean }>(`/api/campaigns/${campaignId}/start`, "POST");
      localStorage.removeItem(LAST_CAMPAIGN_KEY);
      if (threadId) router.push(`/studio/thread/${threadId}?kind=campaign`);
      else setError("The campaign started but has no thread yet — reload this page.");
    } catch (err) {
      setError(readError(err));
      if (campaignId) loadCampaign(campaignId).catch(() => {}); // resync the ✓ states
    } finally {
      setWorking(null);
    }
  };

  const newCampaign = () => {
    localStorage.removeItem(LAST_CAMPAIGN_KEY);
    router.replace("/studio/campaign", { scroll: false });
    setDetail(null);
    setName("");
    setTouched(false);
    setError(null);
    setStep(0);
    loadList();
  };

  return (
    <div
      ref={shell}
      className="ms-dark cb-screen flex flex-col overflow-hidden"
      style={{ height: `calc(100dvh - ${shellTop}px)` }}
    >
      {/* ---- studio top bar ---- */}
      <header className="cb-line flex shrink-0 items-center justify-between gap-4 border-b px-5 py-2.5">
        <div className="min-w-0">
          <p className="cb-accent-text text-[10.5px] font-bold uppercase tracking-[0.14em]">Campaign Studio</p>
          <h1 className="truncate text-[15px] font-bold">{detail?.name || "New campaign"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StepTrail step={step} />
          {campaigns.length > 0 && (
            <button type="button" className="cb-btn cb-btn-ghost !py-1.5" onClick={newCampaign}>
              + New campaign
            </button>
          )}
        </div>
      </header>

      {/* ---- the canvas ---- */}
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {step === 0 && (
          <div className="cb-vcenter flex min-h-full items-center">
            <div className="w-[min(560px,94vw)]">
              <h2 className="text-[26px] font-bold tracking-tight">Campaign Name</h2>
              <p className="cb-muted mt-1 text-[14px]">Give a name to your campaign.</p>
              <input
                autoFocus
                className="cb-input mt-4 !py-3 !text-[16px]"
                placeholder="e.g. Diffuser launch — Q4"
                aria-label="Campaign name"
                aria-invalid={touched && !!nameErr}
                aria-describedby="cb-name-help"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createCampaign();
                  }
                }}
              />
              {touched && nameErr ? (
                <p className="cb-danger mt-2 text-[12.5px] font-semibold" role="alert">
                  {nameErr}
                </p>
              ) : (
                <p id="cb-name-help" className="cb-hint mt-2">
                  Required. It becomes the handle in My Campaigns and numbers this campaign&apos;s threads —{" "}
                  <span className="font-mono">{(name.trim() || "Campaign") + " — 01"}</span>.
                </p>
              )}
              {listOffline && (
                <p className="cb-warn mt-2 text-[12px]">
                  Couldn&apos;t reach the API to check existing names — the uniqueness check will run on submit.
                </p>
              )}
              {error && <div className="mt-3">{<ErrorStrip>{error}</ErrorStrip>}</div>}
              <div className="mt-4 flex items-center gap-3">
                {/* Not disabled on an empty name — a click that does nothing
                    teaches nothing; this one surfaces the reason instead. */}
                <button type="button" className="cb-btn cb-btn-primary" onClick={createCampaign} disabled={!!working}>
                  Create campaign
                </button>
                {working ? <WorkingLine label={working} /> : <span className="cb-hint">or press ↵</span>}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="cb-vcenter flex min-h-full flex-col">
            <h2 className="text-[20px] font-bold tracking-tight">How do you want to brief this?</h2>
            <p className="cb-muted mt-1 text-[13.5px]">
              Both paths fill the same three blocks — the second one just asks you the questions instead.
            </p>
            {/* full-bleed width, but capped height — two cards stretched to the
                canvas floor read as empty boxes, so the block centres instead */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-h-[190px]">
              <button type="button" className="cb-card flex flex-col p-5" onClick={() => setStep(2)}>
                <p className="text-[16px] font-bold">Provide Campaign Details</p>
                <p className="cb-muted mt-1.5 text-[13px] leading-relaxed">
                  Fill three cards yourself — product, campaign, brand. Fastest when you already have the brief, the
                  shots and the brand kit on hand.
                </p>
                <span className="flex-1" />
                <p className="cb-hint">Product · Campaign · Brand → Start campaign</p>
              </button>
              <button
                type="button"
                className="cb-card flex flex-col p-5"
                onClick={() => threadId && router.push(`/studio/thread/${threadId}?kind=campaign`)}
                disabled={!threadId}
              >
                <p className="text-[16px] font-bold">Help me define campaign</p>
                <p className="cb-muted mt-1.5 text-[13px] leading-relaxed">
                  The agent asks one question at a time in the thread and writes the same blocks. Come back here any
                  time — whatever is filled will already be here.
                </p>
                <span className="flex-1" />
                <p className="cb-hint">{threadId ? "Opens the campaign thread" : "Thread not ready yet — reload this page"}</p>
              </button>
            </div>
            {error && <div className="mt-3">{<ErrorStrip>{error}</ErrorStrip>}</div>}
          </div>
        )}

        {step === 2 && campaignId && (
          // min-h-full + cb-vcenter (`justify-content: safe center`): the stack
          // centres in the canvas when it fits and grows into a scroll when it
          // doesn't. A fixed h-full would instead let the third card spill under
          // the prompt modal with nothing to scroll to it.
          <div className="cb-vcenter flex min-h-full flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight">Campaign details</h2>
                <p className="cb-muted mt-0.5 text-[13px]">
                  Each card saves on its own. Esc closes a card and keeps the draft.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {threadId && (
                  <button
                    type="button"
                    className="cb-btn cb-btn-ghost !py-1.5"
                    onClick={() => router.push(`/studio/thread/${threadId}?kind=campaign`)}
                    title="Half-filled cards persist — the agent picks up where you left off"
                  >
                    Rather talk it through →
                  </button>
                )}
                {/* Disabled, but never mute: the reason rides the tooltip and
                    repeats in the hint line under the cards. */}
                <button
                  type="button"
                  className="cb-btn cb-btn-primary"
                  onClick={startCampaign}
                  disabled={!allDone || !!working}
                  title={allDone ? "Hand the brief to the agent chain" : `Still needed: ${missing.join(" · ")}`}
                >
                  Start campaign
                </button>
              </div>
            </div>

            {/* Cards size to their content — stretched to the canvas floor they
                read as three empty boxes. The slack goes to the centring above,
                not into the cards. */}
            <div className="shrink-0">
              <CampaignDetailCards
                campaignId={campaignId}
                context={detail?.context ?? null}
                cardsDone={cardsDone}
                onSaved={(context, cards_done) =>
                  setDetail((d) => (d ? { ...d, context, cards_done, name: context.name || d.name } : d))
                }
              />
            </div>

            <NextUp />

            <div className="flex items-center gap-3">
              {working ? (
                <WorkingLine label={working} />
              ) : (
                <p className="cb-hint">
                  {allDone
                    ? "All three cards saved — Start campaign hands the brief to the agent chain."
                    : `Still needed: ${missing.join(" · ")}.`}
                </p>
              )}
            </div>
            {error && <ErrorStrip>{error}</ErrorStrip>}
          </div>
        )}
      </main>

      {/* The thread's own bar, honestly inert before the thread opens: the
          prompt has nowhere to go yet, so it says so instead of pretending. */}
      <PromptModal
        attachNote={ATTACH_TOOLTIP}
        placeholder={
          step === 2
            ? "The conversation starts once the cards are filled…"
            : "The conversation starts in the campaign thread…"
        }
        note="The prompt bar wakes up in the thread — nothing typed here would reach an agent yet."
      />
    </div>
  );
}

const ATTACH_TOOLTIP = "Attachments open with the thread — product images go in the Product Details card";

// ---- bits -------------------------------------------------------------------

// What Start campaign actually kicks off. Orienting, not decorative — every
// line names a real stage of the chain, and none of it runs before the button.
const NEXT_UP: [string, string][] = [
  ["Rumination", "retrieve evidence → draft options → council review, each step labelled in the thread"],
  ["Campaign options", "2–3 named angles with storyline and evidence — approve one or regenerate"],
  ["Template + detail", "an optional style reference, then the script (video) or prompt set (image)"],
  ["Creative", "cost shown first, single or variants by your choice, then the Ad Card"],
];

function NextUp() {
  return (
    <div className="shrink-0">
      <p className="cb-label">After Start campaign</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {NEXT_UP.map(([title, body], i) => (
          <div key={title} className="cb-elev rounded-[12px] px-3 py-2.5">
            <p className="text-[12.5px] font-bold">
              <span className="cb-accent-text mr-1.5">{i + 1}</span>
              {title}
            </p>
            <p className="cb-hint mt-1 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTrail({ step }: { step: 0 | 1 | 2 }) {
  const labels = ["Name", "Path", "Details"];
  return (
    <>
      {/* The chips are decorative and `hidden` below sm takes them out of the
          a11y tree entirely, so the announcement is its own live line. */}
      <p className="sr-only" role="status">{`Step ${step + 1} of 3: ${labels[step]}`}</p>
      <div className="hidden items-center gap-1.5 sm:flex">
        {labels.map((label, i) => (
          <span key={label} className="cb-chip cb-chip-static !py-0.5 !text-[11.5px]" data-on={i === step} aria-hidden>
            {i + 1}. {label}
          </span>
        ))}
      </div>
    </>
  );
}

function readError(err: unknown): string {
  if (err instanceof MsApiError) {
    if (typeof err.detail === "string") return err.detail;
    if (err.detail) return JSON.stringify(err.detail);
  }
  return (err as Error)?.message ?? "Something went wrong.";
}

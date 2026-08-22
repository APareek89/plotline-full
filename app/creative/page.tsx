"use client";

// Addendum-02 §06: DIY mode — same tools, no agent. Every generation is a
// prompt → asset pair with cost shown BEFORE run. Deliberately raw: no
// confidence card, no CCF, no captions written for you.

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

const KINDS = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "VO / audio" },
] as const;
const IMAGE_TIERS = [
  { id: "draft", label: "NB" },
  { id: "final", label: "NB2" },
  { id: "pro", label: "NB Pro" },
];
const RATIOS = ["9:16", "1:1", "16:9"];
const DURATIONS = [4, 6, 8];

export default function DiyPage() {
  const [kind, setKind] = useState<string>("image");
  const [tier, setTier] = useState("final");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(4);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [mockMode, setMockMode] = useState<boolean | null>(null);

  const load = () =>
    fetch(`${API_URL}/api/diy/assets`).then((r) => r.json()).then(setAssets).catch(() => {});
  useEffect(() => {
    load();
    fetch(`${API_URL}/health`).then((r) => r.json())
      .then((h) => setMockMode(h.media_mock ?? null)).catch(() => {});
  }, []);

  const estimate =
    kind === "image" ? { draft: 0.04, final: 0.08, pro: 0.15 }[tier as "draft"] ?? 0.08
    : kind === "video" ? +(0.1 * duration).toFixed(2)
    : +(0.1 * Math.max(1, prompt.length) / 1000).toFixed(3);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/diy/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt, model_tier: tier, ratio, duration_s: duration }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      await res.json();
      setPrompt("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Creative Studio</p>
        <h1 className="display mt-1 text-2xl font-bold">DIY mode</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Same models, no agent. Agentic production starts from a plan: Plans → Generate next post.
          {mockMode && <span className="chip ml-2 !border-dashed">MOCK_MEDIA — placeholders, $0</span>}
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} className="chip chip-select" data-on={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
          <span className="mx-1 text-line">|</span>
          {kind === "image" &&
            IMAGE_TIERS.map((t) => (
              <button key={t.id} className="chip chip-select" data-on={tier === t.id} onClick={() => setTier(t.id)}>
                {t.label}
              </button>
            ))}
          {kind === "video" && <span className="chip">Veo 3.1 Fast</span>}
          {kind === "audio" &&
            [["draft", "Kokoro"], ["final", "MiniMax HD"]].map(([id, label]) => (
              <button key={id} className="chip chip-select" data-on={tier === id} onClick={() => setTier(id)}>
                {label}
              </button>
            ))}
          <span className="mx-1 text-line">|</span>
          {kind !== "audio" &&
            RATIOS.map((r) => (
              <button key={r} className="chip chip-select" data-on={ratio === r} onClick={() => setRatio(r)}>
                {r}
              </button>
            ))}
          {kind === "video" &&
            DURATIONS.map((d) => (
              <button key={d} className="chip chip-select" data-on={duration === d} onClick={() => setDuration(d)}>
                {d}s
              </button>
            ))}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <textarea
            className="input min-h-[64px] flex-1"
            placeholder={kind === "audio" ? "Text to speak…" : "Describe the frame / clip…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !prompt.trim()} onClick={generate}>
            {busy ? "Generating…" : `Generate · ~$${estimate}`}
          </button>
        </div>
        {error && <p className="mt-2 text-[12.5px] font-semibold text-low">{error}</p>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {assets.map((a) => (
          <div key={a.id} className="card p-2.5">
            {a.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_URL}/api/assets/${a.id}/file`} alt="" className="max-h-56 w-full rounded-[10px] object-cover" />
            )}
            {a.kind === "video" && (
              <video controls muted preload="metadata" src={`${API_URL}/api/assets/${a.id}/file`} className="max-h-56 w-full rounded-[10px] bg-ink" />
            )}
            {a.kind === "audio" && (
              <audio controls preload="none" src={`${API_URL}/api/assets/${a.id}/file`} className="w-full" />
            )}
            <p className="mono mt-1.5 truncate text-[10px] text-muted" title={a.params?.prompt}>
              {a.params?.model} · ${Number(a.cost).toFixed(2)} · {a.params?.prompt}
            </p>
            <a className="btn btn-ghost mt-1 !px-2 !py-0.5 !text-[11px]" href={`${API_URL}/api/assets/${a.id}/file`} download>
              Download
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

// §3.1: guided blocks, one-line inline guidelines, required/optional flags,
// upload tiles ("Teach the engine"), required series/post name.

const CONTENT_AREAS = ["AI tools", "Product ads (UGC)", "Kids' education", "Skincare & beauty", "Fitness", "Personal finance", "Food", "Fashion", "Viral / general"];
const PLATFORMS = [
  { id: "instagram_reels", label: "IG Reels" },
  { id: "youtube_shorts", label: "YT Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram_feed", label: "IG Feed" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
];
const OBJECTIVES = [
  { id: "followers", label: "Followers", hint: "grow the audience" },
  { id: "impressions", label: "Impressions", hint: "maximize reach" },
  { id: "engagement", label: "Engagement", hint: "saves + comments" },
  { id: "conversions", label: "Conversions", hint: "ads / CTR" },
];
const UPLOAD_TILES = [
  { kind: "past_post", label: "Past posts", hint: "2–3 reels or posts that feel like you", required: false },
  { kind: "brief", label: "Docs / brief", hint: "brand brief, product PDF", required: false },
  { kind: "screenshot", label: "Screenshots", hint: "analytics, comments, references", required: false },
  { kind: "brand_asset", label: "Brand assets", hint: "logo, product shots", required: false },
];

export interface FormState {
  name: string;
  mode: "series" | "one_time";
  content_area: string;
  description: string;
  objective: string;
  target_audience: string;
  platforms: string[];
  cadence: { type: string; posts_per_week?: number; weeks?: number; concept_count?: number };
  content_type: string;
  audience_sophistication: string;
  tool_access: string;
  positioning_depth: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  mode: "series",
  content_area: "AI tools",
  description: "",
  objective: "followers",
  target_audience: "",
  platforms: ["instagram_reels"],
  cadence: { type: "series", posts_per_week: 3, weeks: 2 },
  content_type: "text_video",
  audience_sophistication: "",
  tool_access: "",
  positioning_depth: "",
};

export function ContextForm({
  initial,
  onCreated,
}: {
  initial?: Partial<FormState>;
  onCreated: (seriesId: string, context: any, thread?: any) => void;
}) {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, ...initial });
  const [uploads, setUploads] = useState<{ id: string; filename: string; kind: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<string>("other");

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const pickFile = (kind: string) => {
    pendingKind.current = kind;
    fileInput.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await api.uploads.create(file, pendingKind.current);
      setUploads((u) => [...u, up]);
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      e.target.value = "";
    }
  };

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required — it becomes this plan's handle in the Plans tab.");
      return;
    }
    if (!form.audience_sophistication || !form.tool_access.trim() || !form.positioning_depth) {
      setError("Audience sophistication, tool access and positioning depth are required — the format stage and anti-generic checks depend on them.");
      return;
    }
    setSubmitting(true);
    try {
      const cadence =
        form.mode === "series"
          ? { type: "series", posts_per_week: form.cadence.posts_per_week ?? 3, weeks: form.cadence.weeks ?? 2 }
          : { type: "one_time", concept_count: form.cadence.concept_count ?? 6 };
      const res = await api.series.create({ ...form, cadence }, uploads.map((u) => u.id));
      onCreated(res.id, res.context, res.thread);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Block 1 — what this is */}
      <section className="card p-6">
        <h3 className="text-[15px] font-bold">What are we planning?</h3>
        <p className="guideline mt-0.5">A series builds an audience over weeks; a one-time campaign produces ad variants for a brief.</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="field-label">Name <span className="req">*</span></p>
            <p className="guideline mb-1.5">This becomes the plan&apos;s handle in the Plans tab.</p>
            <input
              className="input"
              placeholder='e.g. "AI tools sprint — Sept"'
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <p className="field-label">Mode <span className="req">*</span></p>
            <p className="guideline mb-1.5">Pick how this plan will run.</p>
            <div className="flex gap-2">
              {(["series", "one_time"] as const).map((m) => (
                <button
                  key={m}
                  className="chip chip-select !px-4 !py-1.5 !text-[13px]"
                  data-on={form.mode === m}
                  onClick={() =>
                    set({
                      mode: m,
                      cadence: m === "series" ? { type: "series", posts_per_week: 3, weeks: 2 } : { type: "one_time", concept_count: 6 },
                    })
                  }
                >
                  {m === "series" ? "Series" : "One-time campaign"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="field-label">Content area <span className="req">*</span></p>
            <p className="guideline mb-1.5">The niche the engine retrieves evidence for.</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_AREAS.map((area) => (
                <button key={area} className="chip chip-select" data-on={form.content_area === area} onClick={() => set({ content_area: area })}>
                  {area}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="field-label">What do you want to say? <span className="opt">optional</span></p>
            <p className="guideline mb-1.5">Free text — angle, product, story you want to tell.</p>
            <textarea
              className="input min-h-[72px]"
              placeholder="e.g. help creators cut editing time with AI tools"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* Addendum-01 §7.1 — positioning (all required: R1 + format feasibility depend on them) */}
      <section className="card p-6">
        <h3 className="text-[15px] font-bold">Positioning</h3>
        <p className="guideline mt-0.5">The format stage and anti-generic checks depend on these three.</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="field-label">Audience sophistication <span className="req">*</span></p>
            <p className="guideline mb-1.5">How much does your audience already know?</p>
            <div className="flex gap-1.5">
              {["novice", "practitioner", "expert"].map((lvl) => (
                <button key={lvl} className="chip chip-select" data-on={form.audience_sophistication === lvl} onClick={() => set({ audience_sophistication: lvl })}>
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="field-label">Positioning depth <span className="req">*</span></p>
            <p className="guideline mb-1.5">Beginner-guide or power-user content?</p>
            <div className="flex gap-1.5">
              {[["beginner_guide", "Beginner guide"], ["power_user", "Power user"]].map(([id, label]) => (
                <button key={id} className="chip chip-select" data-on={form.positioning_depth === id} onClick={() => set({ positioning_depth: id })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <p className="field-label">Tool access <span className="req">*</span></p>
            <p className="guideline mb-1.5">What can you actually demo on screen? Receipts beat claims.</p>
            <input
              className="input"
              placeholder="e.g. CapCut + screen recording, product on hand, no on-camera shoots"
              value={form.tool_access}
              onChange={(e) => set({ tool_access: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* Block 2 — purpose */}
      <section className="card p-6">
        <h3 className="text-[15px] font-bold">Purpose</h3>
        <p className="guideline mt-0.5">The planner optimizes ONE primary objective — weights change with it.</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="field-label">Primary objective <span className="req">*</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OBJECTIVES.map((o) => (
                <button key={o.id} className="chip chip-select" data-on={form.objective === o.id} onClick={() => set({ objective: o.id })} title={o.hint}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="field-label">Target audience <span className="opt">recommended</span></p>
            <p className="guideline mb-1.5">Who should stop scrolling? Age band + interest works.</p>
            <input
              className="input"
              placeholder="e.g. aspiring creators, 20–30, India + global"
              value={form.target_audience}
              onChange={(e) => set({ target_audience: e.target.value })}
            />
          </div>
          <div>
            <p className="field-label">Platforms <span className="req">*</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  className="chip chip-select"
                  data-on={form.platforms.includes(p.id)}
                  onClick={() =>
                    set({
                      platforms: form.platforms.includes(p.id)
                        ? form.platforms.filter((x) => x !== p.id)
                        : [...form.platforms, p.id],
                    })
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="field-label">
              {form.mode === "series" ? "Cadence" : "Variants"} <span className="req">*</span>
            </p>
            {form.mode === "series" ? (
              <div className="mt-1.5 flex items-center gap-2 text-[13.5px]">
                <input
                  type="number" min={1} max={7} className="input !w-16"
                  value={form.cadence.posts_per_week ?? 3}
                  onChange={(e) => set({ cadence: { ...form.cadence, type: "series", posts_per_week: +e.target.value } })}
                />
                <span className="text-muted">posts / week ×</span>
                <input
                  type="number" min={1} max={8} className="input !w-16"
                  value={form.cadence.weeks ?? 2}
                  onChange={(e) => set({ cadence: { ...form.cadence, type: "series", weeks: +e.target.value } })}
                />
                <span className="text-muted">weeks</span>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 text-[13.5px]">
                <input
                  type="number" min={1} max={20} className="input !w-16"
                  value={form.cadence.concept_count ?? 6}
                  onChange={(e) => set({ cadence: { type: "one_time", concept_count: +e.target.value } })}
                />
                <span className="text-muted">angle concepts for this brief</span>
              </div>
            )}
          </div>
          <div>
            <p className="field-label">Content type <span className="req">*</span></p>
            <div className="mt-1.5 flex gap-1.5">
              {[
                { id: "text", label: "Text" },
                { id: "text_image", label: "Text + image" },
                { id: "text_video", label: "Text + video" },
              ].map((t) => (
                <button key={t.id} className="chip chip-select" data-on={form.content_type === t.id} onClick={() => set({ content_type: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Block 3 — teach the engine */}
      <section className="card p-6">
        <h3 className="text-[15px] font-bold">Teach the engine</h3>
        <p className="guideline mt-0.5">
          Upload references — the intake agent extracts style, tone and constraints (Claude vision). All optional.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {UPLOAD_TILES.map((tile) => {
            const count = uploads.filter((u) => u.kind === tile.kind).length;
            return (
              <button key={tile.kind} className="upload-tile p-4 text-left" onClick={() => pickFile(tile.kind)}>
                <p className="text-[13px] font-bold">
                  {tile.label} <span className="opt">optional</span>
                </p>
                <p className="guideline mt-1">{tile.hint}</p>
                <p className="mt-2 text-[12px] font-semibold text-accent">
                  {count > 0 ? `${count} uploaded ✓` : "+ add file"}
                </p>
              </button>
            );
          })}
        </div>
        <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
        {uploads.length > 0 && (
          <p className="mono mt-3 text-[11px] text-muted">
            {uploads.map((u) => u.filename).join(" · ")}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-[12px] bg-low-wash px-4 py-3 text-[13px] font-semibold text-low">{error}</div>
      )}

      <div className="flex justify-end">
        <button className="btn btn-primary !px-6 !py-2.5" onClick={submit} disabled={submitting}>
          {submitting ? "Extracting context…" : "Save context → pick inspiration"}
        </button>
      </div>
    </div>
  );
}

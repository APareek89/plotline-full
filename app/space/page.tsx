"use client";

import { useEffect, useState } from "react";
import { Series, api } from "@/lib/api";

// §05 My Space: Profile · Avatars · Assets · Performance. Series/campaigns
// deliberately do NOT live here — they moved to the Plans tab.
type Tab = "profile" | "avatars" | "assets" | "performance";

export default function MySpacePage() {
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <div className="flex gap-8">
      <aside className="w-52 shrink-0">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-accent">My Space</p>
        <h1 className="display mt-1 text-[19px] font-bold">Your memory</h1>
        <nav className="mt-5 space-y-1">
          {(
            [
              ["profile", "Profile", "feeds every agent call"],
              ["avatars", "Avatars", "reusable identity packs"],
              ["assets", "Assets", "uploads & outputs"],
              ["performance", "Performance", "paste post results"],
            ] as [Tab, string, string][]
          ).map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                "block w-full rounded-[12px] px-3 py-2 text-left transition-colors " +
                (tab === id ? "bg-accent-wash text-accent-deep" : "hover:bg-card")
              }
            >
              <span className="text-[13.5px] font-semibold">{label}</span>
              <p className="text-[11px] text-muted">{hint}</p>
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        {tab === "profile" && <ProfileTab />}
        {tab === "avatars" && (
          <div className="card p-10 text-center">
            <h3 className="display text-[16px] font-bold">Avatar Studio — Phase 2</h3>
            <p className="mt-2 text-[13px] text-muted">
              Upload a photo, pick from the template gallery, or prompt-to-avatar. Saved avatars
              become reusable identity packs for character-consistent video.
            </p>
          </div>
        )}
        {tab === "assets" && <AssetsTab />}
        {tab === "performance" && <PerformanceTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  const [profile, setProfile] = useState<any>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.profile.get().then(setProfile);
  }, []);

  const save = async () => {
    await api.profile.put({
      niche: profile.niche ?? null,
      tone_rules: profile.tone_rules ?? [],
      banned_topics: profile.banned_topics ?? [],
      capacity: profile.capacity ?? null,
      style_prefs: profile.style_prefs ?? [],
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const listField = (key: string, label: string, hint: string) => (
    <div>
      <p className="field-label">{label}</p>
      <p className="guideline mb-1.5">{hint}</p>
      <textarea
        className="input min-h-[64px]"
        value={(profile[key] ?? []).join("\n")}
        onChange={(e) =>
          setProfile({ ...profile, [key]: e.target.value.split("\n").filter(Boolean) })
        }
      />
    </div>
  );

  return (
    <div className="card max-w-2xl p-6">
      <h3 className="text-[15px] font-bold">Profile memory</h3>
      <p className="guideline mt-0.5">Editable, durable, and injected into every agent call.</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="field-label">Niche</p>
          <input
            className="input mt-1.5"
            placeholder="e.g. AI tools education"
            value={profile.niche ?? ""}
            onChange={(e) => setProfile({ ...profile, niche: e.target.value })}
          />
        </div>
        {listField("tone_rules", "Tone rules", "One per line — e.g. 'energetic, no corporate speak'")}
        {listField("banned_topics", "Banned topics", "One per line — the planner must avoid these")}
        <div>
          <p className="field-label">Capacity</p>
          <input
            className="input mt-1.5"
            placeholder="e.g. 3 reels/week, no on-camera shoots"
            value={profile.capacity ?? ""}
            onChange={(e) => setProfile({ ...profile, capacity: e.target.value })}
          />
        </div>
        {listField("style_prefs", "Style preferences", "One per line — e.g. 'faceless screen-rec', 'captions always on'")}
        <button className="btn btn-primary" onClick={save}>
          {saved ? "Saved ✓" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function AssetsTab() {
  const [uploads, setUploads] = useState<any[]>([]);
  useEffect(() => {
    api.uploads.list().then(setUploads);
  }, []);
  return (
    <div className="card p-6">
      <h3 className="text-[15px] font-bold">Assets</h3>
      <p className="guideline mt-0.5">
        Everything you&apos;ve uploaded. Generated deliverables land here in Phase 2, linked to
        their source campaign + generation params.
      </p>
      {uploads.length === 0 ? (
        <p className="mt-4 text-[13px] italic text-muted">Nothing yet — upload references in the Content Studio.</p>
      ) : (
        <table className="mt-4 w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 font-semibold">File</th>
              <th className="pb-2 font-semibold">Kind</th>
              <th className="pb-2 font-semibold">Type</th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="py-2">{u.filename}</td>
                <td className="py-2 text-muted">{u.kind}</td>
                <td className="py-2 text-muted">{u.content_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PerformanceTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [form, setForm] = useState<any>({ platform: "instagram_reels" });
  const [saved, setSaved] = useState(false);

  const load = () => api.performance.list().then(setRows);
  useEffect(() => {
    load();
    api.series.list().then(setSeriesList);
  }, []);

  const submit = async () => {
    await api.performance.add({
      series_id: form.series_id || null,
      concept_id: form.concept_id || null,
      platform: form.platform,
      views: form.views ? +form.views : null,
      retention_pct: form.retention_pct ? +form.retention_pct : null,
      saves: form.saves ? +form.saves : null,
      comments: form.comments ? +form.comments : null,
      shares: form.shares ? +form.shares : null,
      ctr_pct: form.ctr_pct ? +form.ctr_pct : null,
      notes: form.notes || null,
    });
    setForm({ platform: form.platform });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h3 className="text-[15px] font-bold">Paste post results</h3>
        <p className="guideline mt-0.5">
          The feedback loop&apos;s front door — pasted results re-weight the next plan
          (performance memory compounds forever).
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="field-label">Series</p>
            <select
              className="input mt-1"
              value={form.series_id ?? ""}
              onChange={(e) => setForm({ ...form, series_id: e.target.value })}
            >
              <option value="">— none —</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="field-label">Platform</p>
            <select
              className="input mt-1"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
            >
              {["instagram_reels", "youtube_shorts", "tiktok", "instagram_feed"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="field-label">Concept id <span className="opt">optional</span></p>
            <input className="input mt-1" placeholder="c01" value={form.concept_id ?? ""} onChange={(e) => setForm({ ...form, concept_id: e.target.value })} />
          </div>
          {[
            ["views", "Views"],
            ["retention_pct", "Retention %"],
            ["saves", "Saves"],
            ["comments", "Comments"],
            ["shares", "Shares"],
            ["ctr_pct", "CTR %"],
          ].map(([key, label]) => (
            <div key={key}>
              <p className="field-label">{label}</p>
              <input
                type="number"
                className="input mt-1"
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="col-span-3">
            <p className="field-label">Notes</p>
            <input className="input mt-1" placeholder="what happened after 72h?" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-4" onClick={submit}>
          {saved ? "Logged ✓" : "Log results"}
        </button>
      </div>

      <div className="card p-6">
        <h3 className="text-[15px] font-bold">Performance log</h3>
        {rows.length === 0 ? (
          <p className="mt-3 text-[13px] italic text-muted">No results pasted yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 font-semibold">When</th>
                <th className="pb-2 font-semibold">Platform</th>
                <th className="pb-2 font-semibold">Concept</th>
                <th className="pb-2 font-semibold">Metrics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 text-muted">{new Date(r.pasted_at * 1000).toLocaleDateString()}</td>
                  <td className="py-2">{r.platform}</td>
                  <td className="py-2 mono">{r.concept_id ?? "—"}</td>
                  <td className="py-2 text-ink-soft">
                    {Object.entries(r.metrics).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

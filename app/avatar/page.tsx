export default function AvatarStudioPage() {
  return (
    <div className="rounded-[20px] bg-dark px-10 py-16 text-white">
      <p className="mono text-[11px] uppercase tracking-[0.2em] text-white/50">Avatar Studio · Phase 2</p>
      <h1 className="display mt-2 max-w-xl text-3xl font-bold leading-tight">
        Your face, or a face you choose — locked across every shot.
      </h1>
      <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-white/70">
        Three entry points: upload your photo (with consent attestation), a curated template
        gallery, or prompt-to-avatar. Saved avatars become reusable identity packs — 3–5 reference
        images with wardrobe and lighting locks repeated verbatim in every keyframe prompt.
      </p>
      <p className="mt-6 inline-block rounded-[12px] border border-white/20 px-4 py-2 text-[13px] text-white/70">
        Ships in Phase 2 alongside the Creative Studio.
      </p>
    </div>
  );
}

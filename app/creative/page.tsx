export default function CreativeStudioPage() {
  return (
    <div className="rounded-[20px] bg-dark px-10 py-16 text-white">
      <p className="mono text-[11px] uppercase tracking-[0.2em] text-white/50">Creative Studio · Phase 2</p>
      <h1 className="display mt-2 max-w-xl text-3xl font-bold leading-tight">
        Confidence first, script second, render last.
      </h1>
      <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-white/70">
        A conversational thread — no step tabs. Your approved concept lands pre-loaded, the agent
        opens with its Confidence Card (beats, scores, route recommendation, credit cost), and
        script → keyframes → shots → stitch all happen in-thread.
      </p>
      <p className="mt-6 inline-block rounded-[12px] border border-white/20 px-4 py-2 text-[13px] text-white/70">
        Ships after the Phase-1 exit gate: ≥55% of test users approve a plan in ≤2 regenerations.
      </p>
    </div>
  );
}

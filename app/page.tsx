import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-[20px] bg-dark px-10 py-16 text-white">
        <p className="mono mb-4 text-[11px] uppercase tracking-[0.2em] text-white/50">
          AI co-pilot for creators · v1
        </p>
        <h1 className="display max-w-2xl text-4xl font-bold leading-tight">
          An engine that plans content that works — <span className="text-[#8fa0ff]">then makes it.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
          Evidence-backed content plans: every concept carries references to real
          high-performing content, computed benchmarks, and a red-team pass — not adjectives.
          Creative production follows in Phase&nbsp;2.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/studio" className="btn btn-primary !px-6 !py-2.5">
            Start a plan
          </Link>
          <Link
            href="/plans"
            className="btn !border-white/25 !text-white/85 border bg-transparent hover:!border-white"
          >
            Open my plans
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        {[
          {
            title: "Plan that clicks",
            body: "10 concepts per series, each scored on the Concept Confidence Framework with linked evidence: inspiration references, benchmarks with n and as-of dates, trend velocity.",
            tag: "REF · STAT · TREND",
          },
          {
            title: "Red-team before you see it",
            body: "A feedback agent — the final rating authority — judges every element through audience, saturation, claims-safety and feasibility lenses. Downgrades stay visible on the card.",
            tag: "CCS > 70 unlocks options",
          },
          {
            title: "Three ways to make it",
            body: "Every qualified concept ships as 3 distinct creative angles — never a single take. Approve, reorder, regenerate with feedback; the plan learns from pasted results.",
            tag: "A · B · C",
          },
        ].map((f) => (
          <div key={f.title} className="card p-6">
            <p className="mono text-[10px] uppercase tracking-widest text-accent">{f.tag}</p>
            <h3 className="mt-2 text-[16px] font-bold">{f.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

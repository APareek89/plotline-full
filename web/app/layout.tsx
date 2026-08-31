import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plotline Marketing Studio — brief once, ship the campaign",
  description:
    "Name a campaign, brief it once, and get evidence-backed options, scripts, creative and ad cards in one thread.",
};

// Addendum-03 §01: exactly three global tabs — Campaign Studio · My Campaigns ·
// My Brand — and nothing else at global level. It is listed now because
// app/brand/page.tsx exists: the rule was never "don't add it", it was "a nav
// entry that 404s is worse than a missing one", so the entry and the page land
// in the same change.
// "+ New campaign" belongs to the studio sub-bar, never to this nav.
const NAV = [
  { href: "/studio/campaign", label: "Campaign Studio" },
  { href: "/campaigns", label: "My Campaigns" },
  { href: "/brand", label: "My Brand" },
];

// TEMPORARY developer surface, deliberately OUTSIDE the product nav above:
// it is not a fourth tab of the app, it is a debug view that happens to live in
// the same shell. Next inlines NODE_ENV at build time, so this whole entry is
// dropped from a production bundle. Delete it and app/observability/ to remove.
const DEBUG_NAV = process.env.NODE_ENV !== "production";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The header carries no theme logic. globals.css switches the whole
          document to the --ms-* palette via `html:has(.ms-dark)` the moment a
          Marketing Studio screen mounts its `.ms-dark` wrapper, so this stays
          a server component — no pathname prop, no client boundary, no flash
          (the wrapper ships in the SSR HTML). */}
      <body className="min-h-screen bg-paper text-ink">
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex h-14 w-full items-center gap-6 px-4">
            <Link
              href="/studio/campaign"
              className="flex items-baseline gap-2 whitespace-nowrap"
            >
              <span className="display text-[17px] font-bold tracking-tight">
                PLOTLINE<span className="text-accent">.</span>
              </span>
              <span className="mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
                Marketing Studio
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-[13.5px]">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[12px] px-3 py-1.5 text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent-deep"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {DEBUG_NAV && (
              <Link
                href="/observability"
                className="mono rounded-[10px] border border-dashed border-[#2A3140] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-accent-deep"
                title="Debug — agent node inputs and outputs. Not part of the product."
              >
                Observability
              </Link>
            )}

          </div>
        </header>
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}

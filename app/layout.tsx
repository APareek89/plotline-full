import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plotline Marketing Studio — brief once, ship the campaign",
  description:
    "Name a campaign, brief it once, and get evidence-backed options, scripts, creative and ad cards in one thread.",
};

// v2 §APP STRUCTURE: the primary nav for this mode is exactly two entries.
const NAV = [
  { href: "/studio/campaign", label: "Campaign Studio" },
  { href: "/campaigns", label: "My Campaigns" },
];

// The Phase-1 screens are still built, still routed, still working — they are
// just no longer the product. They live one click away instead of in the top
// row. Every href below is a real page in this app; nothing here is aspirational.
const LEGACY = [
  { href: "/", label: "Home" },
  { href: "/studio", label: "Content Studio" },
  { href: "/creative", label: "Creative Studio" },
  { href: "/plans", label: "Plans" },
  { href: "/space", label: "My Space" },
  { href: "/avatar", label: "Avatar Studio", phase2: true },
];

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

            {/* Zero-JS disclosure so the root layout stays a server component. */}
            <details className="group relative ml-auto text-[13.5px]">
              <summary className="cursor-pointer list-none rounded-[12px] px-3 py-1.5 text-muted transition-colors hover:bg-principle-wash [&::-webkit-details-marker]:hidden">
                Legacy
                <span className="ml-1.5 text-[10px] group-open:hidden">▾</span>
                <span className="ml-1.5 hidden text-[10px] group-open:inline">▴</span>
              </summary>
              <div className="card absolute right-0 top-full mt-2 w-56 p-1 shadow-lg">
                {LEGACY.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between rounded-[12px] px-3 py-1.5 text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent-deep"
                  >
                    {item.label}
                    {item.phase2 && (
                      <span className="rounded-[8px] bg-principle-wash px-1.5 py-0.5 text-[10px] font-semibold text-principle">
                        PHASE 2
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </details>
          </div>
        </header>
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}

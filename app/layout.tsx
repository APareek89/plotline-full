import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plotline — plan content that works",
  description:
    "Evidence-backed content plans, then scripts, avatars, voice and video — in one flow.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/studio", label: "Content Studio" },
  { href: "/creative", label: "Creative Studio" },
  { href: "/avatar", label: "Avatar Studio", phase2: true },
  { href: "/plans", label: "Plans" },
  { href: "/space", label: "My Space" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink">
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex h-14 w-full items-center gap-6 px-4">
            <Link href="/" className="display text-[17px] font-bold tracking-tight">
              PLOTLINE<span className="text-accent">.</span>
            </Link>
            <nav className="flex items-center gap-1 text-[13.5px]">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "rounded-[12px] px-3 py-1.5 transition-colors " +
                    (item.phase2
                      ? "text-muted hover:bg-principle-wash"
                      : "text-ink-soft hover:bg-accent-wash hover:text-accent-deep")
                  }
                >
                  {item.label}
                  {item.phase2 && (
                    <span className="ml-1.5 rounded-[8px] bg-principle-wash px-1.5 py-0.5 text-[10px] font-semibold text-principle">
                      PHASE 2
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}

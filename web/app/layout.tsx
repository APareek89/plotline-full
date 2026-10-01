import type { Metadata } from "next";
import AccountShell from "@/components/account-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plotline Marketing Studio",
  description: "Name a campaign, brief it in conversation, and review evidence, scripts and creative in one thread.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="lovable-ui" data-theme="light" suppressHydrationWarning><body><AccountShell>{children}</AccountShell></body></html>;
}

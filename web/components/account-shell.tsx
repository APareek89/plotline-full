"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Clapperboard, LogOut, Moon, Sun } from "lucide-react";
import { Account, accountChangeNotice, clearOwnerDrafts, performAuth, session } from "@/lib/client/session";

const AccountContext = createContext<Account | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Account is unavailable.");
  return value;
}
const NAV = [
  { href: "/studio/campaign", label: "Campaign Studio" },
  { href: "/campaigns", label: "My Campaigns" },
  { href: "/brand", label: "My Brand" },
];
export default function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const pathname = usePathname();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false); const [theme, setTheme] = useState("light");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const authBusy = useRef(false); const lastOwner = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const value = await session.read();
      if (lastOwner.current && lastOwner.current !== value.user?.id) {
        try { clearOwnerDrafts(localStorage, lastOwner.current); } catch { /* storage may be blocked */ }
      }
      lastOwner.current = value.user?.id ?? null;
      setAccount(value); setReady(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      session.accept({ enabled: true, user: null, csrf: null }, true);
      setAccount(null); setPassword(""); setReady(true);
      setError("Account service is unavailable. Retry to reconnect securely.");
    }
  }, []);
  useEffect(() => {
    let saved: string | null = null; try { saved = localStorage.getItem("portfolio-theme"); } catch { /* optional preference */ }
    setTheme(saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light");
    void refresh();
    const expired = () => { setAccount(null); setPassword(""); setError("Your session expired. Sign in again."); void refresh(); };
    const focus = () => { if (!authBusy.current && document.visibilityState === "visible") void refresh(); };
    const storage = (event: StorageEvent) => accountChangeNotice(event, session, () => {
      setAccount(null); setPassword("");
      if (lastOwner.current) { try { clearOwnerDrafts(localStorage, lastOwner.current); } catch {} }
    }, () => { void refresh(); });
    window.addEventListener("plotline-session-expired", expired); window.addEventListener("focus", focus);
    window.addEventListener("storage", storage); document.addEventListener("visibilitychange", focus);
    return () => { window.removeEventListener("plotline-session-expired", expired); window.removeEventListener("focus", focus); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, [theme]);
  const toggle = () => { const next = theme === "light" ? "dark" : "light"; setTheme(next); try { localStorage.setItem("portfolio-theme", next); } catch {} };
  const notify = () => { try { localStorage.setItem("plotline-account-change", String(Date.now())); } catch {} };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); authBusy.current = true; setBusy(true); setError("");
    try {
      if (mode === "signup") {
        if (password.length < 12 || new TextEncoder().encode(password).length > 72) throw new Error("Use at least 12 characters and at most 72 UTF-8 bytes.");
        await session.request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
      }
      await performAuth("callback/credentials", { email, password }, window.location.origin);
      setPassword(""); await refresh(); notify(); router.replace("/studio/campaign");
    } catch (e) { if (e instanceof Error && e.name !== "AbortError") setError(e.message); }
    finally { authBusy.current = false; setBusy(false); }
  }
  async function signout() {
    authBusy.current = true; setBusy(true); setError("");
    if (account?.user) { try { clearOwnerDrafts(localStorage, account.user.id); } catch {} }
    session.accept({ enabled: true, user: null, csrf: null }, true);
    setAccount(null); setPassword(""); router.replace("/studio/campaign");
    try { await performAuth("signout", {}, window.location.origin); await refresh(); notify(); }
    catch { setError("Sign-out could not be confirmed. Retry or refresh before leaving a shared device."); }
    finally { authBusy.current = false; setBusy(false); }
  }
  const signedIn = account?.user || account?.enabled === false;
  return <div className="portfolio-shell">
    <header className="portfolio-header">
      <Link className="portfolio-brand" href="/studio/campaign" aria-label="Plotline home"><Clapperboard aria-hidden="true" /><span>Plotline <small>Marketing Studio</small></span></Link>
      {signedIn && <nav aria-label="Main navigation">{NAV.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav>}
      <div className="portfolio-account">
        <button className="btn icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</button>
        {account?.user && <><span className="account-email" title={account.user.email}>{account.user.email}</span><button className="btn" disabled={busy} onClick={signout}><LogOut aria-hidden="true" /><span>Sign out</span></button></>}
        {account?.enabled === false && <span className="chip">Local fixture</span>}
      </div>
    </header>
    {!ready ? <main className="auth-loading" role="status">Opening your workspace…</main> : signedIn && account ? <AccountContext.Provider value={account}><main key={`${account.user?.id ?? "fixture"}:${session.capture()}:${pathname}`} className="portfolio-content">{children}</main></AccountContext.Provider> : <main className="auth-layout">
      <section className="auth-intro"><span className="eyebrow">One brief. A complete campaign.</span><h1>Turn the conversation into creative.</h1><p>Explore evidence, review a direction, and shape the final image or video in one campaign thread.</p><div className="auth-note"><Clapperboard aria-hidden="true" /><span>Start with a prepared image campaign. Explore its artifacts with zero provider calls.</span></div></section>
      <section className="card auth-card"><h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2><p>Your campaigns and brand library belong to your account.</p>
        <form onSubmit={submit}>
          <label htmlFor="auth-email">Email</label><input className="input" id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          <label htmlFor="auth-password">Password</label><input className="input" id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
          {mode === "signup" && <p className="auth-hint">At least 12 characters. Email password recovery is not configured.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !account} aria-busy={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}<ArrowRight aria-hidden="true" /></button>
        </form>
        <button className="btn auth-google" disabled title="Google sign-in is not configured">Google <span>Not configured</span></button>
        {!account && <button className="btn" onClick={() => void refresh()} disabled={busy}>Retry connection</button>}
        <button className="btn text-button" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setPassword(""); }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      </section>
    </main>}
  </div>;
}

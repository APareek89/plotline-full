"use client";
import { useEffect, useRef, useState } from "react";
import { session } from "@/lib/client/session";

/** Keep account identity stable through body parsing; never download an old account's bytes. */
export default function PrivateDownload({ href, children, className, filename }: { href: string; children: React.ReactNode; className?: string; filename?: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function download(event: React.MouseEvent) {
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    const epoch = session.capture(); controller.current = new AbortController(); setBusy(true); setError("");
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) throw new Error("This download is unavailable through your account.");
      const blob = await session.request<Blob>(url.pathname + url.search, { signal: controller.current.signal }, epoch, "blob");
      session.assert(epoch); if (controller.current.signal.aborted) return;
      const object = URL.createObjectURL(blob); const anchor = document.createElement("a");
      const extension = ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "audio/mpeg": ".mp3", "application/zip": ".zip" } as Record<string, string>)[blob.type] ?? "";
      anchor.href = object; anchor.download = filename ?? (url.pathname.endsWith("/bundle") ? "campaign-bundle.zip" : `plotline-asset${extension}`);
      anchor.click(); setTimeout(() => URL.revokeObjectURL(object), 1000);
    } catch (e) { if (e instanceof Error && e.name !== "AbortError") setError(e.message); }
    finally { setBusy(false); }
  }
  return <><a href={href} className={className} onClick={download} aria-busy={busy} aria-disabled={busy}>{busy ? "Preparing download…" : children}</a>{error && <span className="form-error" role="alert">{error}</span>}</>;
}

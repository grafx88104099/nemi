"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";

/**
 * Зарыг хуваалцах: утсанд системийн хуваалцах цонх (Messenger, Viber…),
 * компьютерт холбоосыг хуулна.
 *
 * url — серверийн каноник URL. Зөвхөн одоогийн хуудастай ижил origin бол
 * ашиглана (localhost, Vercel preview өөрийн origin-оо хуваалцана); үгүй бол
 * origin + pathname (?query, #hash-гүй — utm/шүүлтүүр дамжихгүй).
 */
export function ShareButton({ title, text, url }: { title: string; text?: string; url?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function share() {
    let shareUrl = window.location.origin + window.location.pathname;
    if (url) {
      try {
        if (new URL(url).origin === window.location.origin) shareUrl = url;
      } catch {
        // Буруу url → одоогийн хуудасны цэвэр URL.
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (e) {
        // Хэрэглэгч цуцалсан бол юу ч хийхгүй; бусад алдаанд хуулахыг оролдоно.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Холбоосыг хуулна уу:", shareUrl);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-surface-2"
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Share2 className="size-4" />}
      <span aria-live="polite">{copied ? "Холбоос хуулагдлаа" : "Хуваалцах"}</span>
    </button>
  );
}

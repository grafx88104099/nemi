"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";

/**
 * Зарыг хуваалцах: утсанд системийн хуваалцах цонх (Messenger, Viber…),
 * компьютерт холбоосыг хуулна.
 */
export function ShareButton({ title, text }: { title: string; text?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // Хэрэглэгч цуцалсан бол юу ч хийхгүй; бусад алдаанд хуулахыг оролдоно.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Холбоосыг хуулна уу:", url);
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

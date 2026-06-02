"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.05 1.07-2.7 2.27-5.59 2.27-4.45 0-7.9-3.5-7.9-7.94S8.55 4.69 13 4.69c2.39 0 4.18.93 5.4 2.06l2.34-2.32C19.13 2.97 16.79 2 13 2 6.96 2 2 6.85 2 12.85S6.96 24 13 24c3.27 0 5.7-1.07 7.62-3.05 1.97-1.97 2.58-4.73 2.58-6.97 0-.7-.06-1.34-.16-1.86h-10.6z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.25 0-1.64.77-1.64 1.57V12h2.78l-.44 2.9h-2.34v6.98A10 10 0 0 0 22 12z"
      />
    </svg>
  );
}

export function OAuthButtons({ next = "/" }: { next?: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function signIn(provider: "google" | "facebook") {
    setLoading(provider);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) setLoading(null);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={!!loading}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50"
      >
        <GoogleIcon /> {loading === "google" ? "..." : "Google"}
      </button>
      <button
        type="button"
        onClick={() => signIn("facebook")}
        disabled={!!loading}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50"
      >
        <span className="text-[#1877F2]">
          <FacebookIcon />
        </span>{" "}
        {loading === "facebook" ? "..." : "Facebook"}
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Shield } from "lucide-react";

import { setVerified } from "@/lib/actions/offices";
import { cn } from "@/lib/utils";

export function VerifyToggle({
  kind,
  id,
  initial,
}: {
  kind: "agent" | "listing";
  id: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = !on;
      const res = await setVerified(kind === "agent" ? "agents" : "listings", id, next);
      if (res.ok) setOn(next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition disabled:opacity-50",
        on ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-surface text-muted hover:bg-surface-2"
      )}
    >
      {on ? <ShieldCheck className="size-3" /> : <Shield className="size-3" />}
      {on ? "Баталгаатай" : "Батлах"}
    </button>
  );
}

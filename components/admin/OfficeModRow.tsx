"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";

import { setVerified } from "@/lib/actions/offices";

export function OfficeVerifyButton({ id, verified }: { id: string; verified: boolean }) {
  const [ver, setVer] = useState(verified);
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => { const r = await setVerified("offices", id, !ver); if (!("error" in r)) setVer(!ver); })}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${ver ? "bg-emerald-50 text-emerald-700" : "bg-surface-2 text-muted"}`}
    >
      <ShieldCheck className="size-3.5" /> {ver ? "Баталгаатай" : "Баталгаажуулах"}
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Check, X } from "lucide-react";

import { setVerified, setAgentStatus } from "@/lib/actions/offices";

export function AgentModRow({
  id, name, office, status, verified,
}: {
  id: string; name: string; office: string; status: string; verified: boolean;
}) {
  const [st, setSt] = useState(status);
  const [ver, setVer] = useState(verified);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approve(s: "active" | "rejected") {
    startTransition(async () => { await setAgentStatus(id, s); setSt(s); router.refresh(); });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-3">
        <Link href={`/agents/${id}`} className="font-medium text-ink hover:underline">{name}</Link>
      </td>
      <td className="p-3 text-muted">{office}</td>
      <td className="p-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st === "active" ? "bg-emerald-50 text-emerald-700" : st === "pending" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
          {st}
        </span>
      </td>
      <td className="p-3">
        <button
          onClick={() => startTransition(async () => { const r = await setVerified("agents", id, !ver); if (!("error" in r)) setVer(!ver); })}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${ver ? "bg-emerald-50 text-emerald-700" : "bg-surface-2 text-muted"}`}
        >
          <ShieldCheck className="size-3.5" /> {ver ? "Баталгаатай" : "Баталгаажуулах"}
        </button>
      </td>
      <td className="p-3 text-right">
        {st === "pending" && (
          <div className="inline-flex gap-1.5">
            <button onClick={() => approve("active")} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"><Check className="size-3.5" /> Батлах</button>
            <button onClick={() => approve("rejected")} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-semibold"><X className="size-3.5" /> Татгалзах</button>
          </div>
        )}
      </td>
    </tr>
  );
}

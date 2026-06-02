"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, ShieldCheck } from "lucide-react";

import { setListingStatus, deleteListingAdmin } from "@/lib/actions/admin";
import { setVerified } from "@/lib/actions/offices";
import { shortMNT } from "@/lib/format";

const STATUSES = ["active", "draft", "review", "sold"];

export function ListingModRow({
  id, title, price, district, status, verified, agent,
}: {
  id: string; title: string; price: number; district: string | null;
  status: string; verified: boolean; agent: string;
}) {
  const [st, setSt] = useState(status);
  const [ver, setVer] = useState(verified);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-3">
        <Link href={`/listings/${id}`} className="font-medium text-ink hover:underline">{title}</Link>
        <div className="text-xs text-muted">{district} · {agent}</div>
      </td>
      <td className="p-3 text-ink">{shortMNT(price)}</td>
      <td className="p-3">
        <select
          value={st}
          disabled={pending}
          onChange={(e) => { const v = e.target.value as "active"|"draft"|"review"|"sold"; setSt(v); startTransition(async () => { await setListingStatus(id, v); }); }}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs focus:outline-none"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="p-3">
        <button
          onClick={() => startTransition(async () => { const r = await setVerified("listings", id, !ver); if (!("error" in r)) setVer(!ver); })}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${ver ? "bg-emerald-50 text-emerald-700" : "bg-surface-2 text-muted"}`}
        >
          <ShieldCheck className="size-3.5" /> {ver ? "Баталгаатай" : "Баталгаажуулах"}
        </button>
      </td>
      <td className="p-3 text-right">
        <button
          onClick={() => { if (confirm("Энэ зарыг устгах уу?")) startTransition(async () => { await deleteListingAdmin(id); router.refresh(); }); }}
          disabled={pending}
          className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

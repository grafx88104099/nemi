"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ShieldCheck, Trash2, Undo2 } from "lucide-react";

import { setListingStatus, deleteListingAdmin } from "@/lib/actions/admin";
import { setVerified } from "@/lib/actions/offices";
import { fmtMNT } from "@/lib/format";
import { listingStatusMeta } from "@/lib/constants";

const STATUSES = ["active", "draft", "review", "sold"] as const;
type St = (typeof STATUSES)[number];

export function ListingModRow({
  id, title, price, district, status, verified, agent, isOwner = false, reviewNote = null,
}: {
  id: string; title: string; price: number; district: string | null;
  status: string; verified: boolean; agent: string;
  /** Эзэн өөрөө нийтэлсэн зар — «Батлах / Буцаах» товч харагдана. */
  isOwner?: boolean;
  reviewNote?: string | null;
}) {
  const [st, setSt] = useState(status);
  const [ver, setVer] = useState(verified);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const change = (v: St, note?: string | null) => {
    setSt(v);
    startTransition(async () => {
      await setListingStatus(id, v, note);
      router.refresh();
    });
  };

  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-3">
        <Link href={`/listings/${id}`} className="font-medium text-ink hover:underline">{title}</Link>
        <div className="text-xs text-muted">{district} · {agent}</div>
        {reviewNote ? <div className="mt-0.5 text-xs text-amber-800">Тэмдэглэл: {reviewNote}</div> : null}
      </td>
      <td className="p-3 text-ink">{fmtMNT(price)}</td>
      <td className="p-3">
        {isOwner && st === "review" ? (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => change("active", null)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Check className="size-3.5" aria-hidden /> Нийтлэх
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const note = prompt("Буцаах шалтгаан (эзэнд очно):", "");
                if (note === null) return;
                change("draft", note);
              }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink hover:bg-surface-2"
            >
              <Undo2 className="size-3.5" aria-hidden /> Буцаах
            </button>
          </div>
        ) : (
          <select
            value={st}
            disabled={pending}
            aria-label="Төлөв"
            onChange={(e) => change(e.target.value as St)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs focus:outline-none"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{listingStatusMeta(s).label}</option>)}
            {!STATUSES.includes(st as St) ? <option value={st}>{listingStatusMeta(st).label}</option> : null}
          </select>
        )}
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
          aria-label={`${title} устгах`}
          className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

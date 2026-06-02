"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Bell, BellOff, Search } from "lucide-react";

import { deleteSavedSearch, toggleSearchAlert } from "@/lib/actions/saved-searches";

export function SavedSearchRow({
  id,
  name,
  filters,
  alertEnabled,
}: {
  id: string;
  name: string;
  filters: Record<string, string>;
  alertEnabled: boolean;
}) {
  const [alert, setAlert] = useState(alertEnabled);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const qs = new URLSearchParams(filters).toString();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <Search className="size-4 text-muted" />
      <Link href={`/listings?${qs}`} className="flex-1 truncate text-sm font-medium text-ink hover:underline">
        {name}
      </Link>
      <button
        onClick={() => startTransition(async () => { const r = await toggleSearchAlert(id, !alert); if (r.ok) setAlert(!alert); })}
        className={`rounded-lg p-2 ${alert ? "text-brand-600" : "text-muted hover:text-ink"}`}
        title="Сэрэмжлүүлэг"
      >
        {alert ? <Bell className="size-4" /> : <BellOff className="size-4" />}
      </button>
      <button
        onClick={() => startTransition(async () => { await deleteSavedSearch(id); router.refresh(); })}
        className="rounded-lg p-2 text-muted hover:bg-rose-50 hover:text-rose-600"
        title="Устгах"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

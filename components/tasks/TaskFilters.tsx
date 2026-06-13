"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List, Columns3, CalendarDays, Search } from "lucide-react";

import {
  TASK_STATUSES, TASK_STATUS_LABEL,
  TASK_ROLE_FILTERS, TASK_ROLE_FILTER_LABEL,
} from "@/lib/constants";

const VIEWS = [
  ["list", "Жагсаалт", List],
  ["kanban", "Самбар", Columns3],
  ["calendar", "Календарь", CalendarDays],
] as const;

/**
 * Bitrix маягийн toolbar — харагдац таб, «миний үүрэг» шүүлт, төлөвийн chips,
 * хайлт. Бүх төлөв URL-д (?view=&role=&status=&q=) хадгалагдана.
 */
export function TaskFilters({ overdueCount }: { overdueCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const view = sp.get("view") ?? "list";
  const role = sp.get("role") ?? "all";
  const status = sp.get("status") ?? "";
  const [q, setQ] = useState(sp.get("q") ?? "");

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  // Хайлтыг debounce-оор URL-д тусгана.
  useEffect(() => {
    const current = sp.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${
      active ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Харагдац таб */}
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {VIEWS.map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setParam({ view: v === "list" ? null : v })}
              aria-pressed={view === v}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Миний үүрэг */}
          <select
            aria-label="Миний үүрэг"
            value={role}
            onChange={(e) => setParam({ role: e.target.value === "all" ? null : e.target.value })}
            className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm focus:border-brand-500 focus:outline-none"
          >
            {TASK_ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>{TASK_ROLE_FILTER_LABEL[r]}</option>
            ))}
          </select>

          {/* Хайлт */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Хайх…"
              className="h-9 w-44 rounded-xl border border-line bg-surface pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Төлөвийн chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setParam({ status: null, overdue: null })} className={chip(!status && !sp.get("overdue"))}>
          Бүгд
        </button>
        {TASK_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setParam({ status: s, overdue: null })} className={chip(status === s)}>
            {TASK_STATUS_LABEL[s].label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setParam({ overdue: "1", status: null })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            sp.get("overdue") ? "bg-rose-600 text-white" : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
        >
          Хоцорсон {overdueCount > 0 ? overdueCount : ""}
        </button>
      </div>
    </div>
  );
}

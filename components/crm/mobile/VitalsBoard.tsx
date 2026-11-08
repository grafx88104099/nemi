"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import {
  vitalsTone,
  worklistLabel,
  WORKLIST_CODES,
  type VitalsRow,
  type WorklistCode,
  type WorklistEntry,
  type WorklistSettings,
} from "@/lib/crm/worklists";
import { cn } from "@/lib/utils";

/**
 * Ажлын эрүүл мэндийн самбар (R20): эзэмшигч × жагсаалт. Нүдэн дээр
 * дарахад тухайн бүртгэлүүдийн нэрс гарч, карт руу шууд очно. Босго
 * тохиргооноос ('worklists' vitals_warn / vitals_alert).
 */
export function VitalsBoard({
  rows,
  lists,
  settings,
  teams,
  branches,
}: {
  rows: VitalsRow[];
  lists: Record<WorklistCode, WorklistEntry[]>;
  settings: WorklistSettings;
  teams: { id: string; name: string; branch_id: string | null }[];
  branches: { id: string; name: string }[];
}) {
  const [team, setTeam] = useState("");
  const [branch, setBranch] = useState("");
  const [open, setOpen] = useState<{ owner: string; code: WorklistCode } | null>(null);
  const codes = WORKLIST_CODES.filter((c) => !settings.disabled.includes(c));

  const filtered = useMemo(
    () => rows.filter((r) => (!team || r.teamId === team) && (!branch || r.branchId === branch)),
    [rows, team, branch]
  );
  const totals = useMemo(() => {
    const t = Object.fromEntries(codes.map((c) => [c, 0])) as Record<WorklistCode, number>;
    for (const r of filtered) for (const c of codes) t[c] += r.counts[c];
    return t;
  }, [filtered, codes]);

  const openList = open ? lists[open.code].filter((e) => (e.ownerId ?? "") === open.owner) : [];

  if (!rows.length) {
    return <EmptyState title="Харах агент алга" description="Таны хүрээнд идэвхтэй агент бүртгэгдээгүй байна." />;
  }

  const toneCls = (n: number) => {
    const t = vitalsTone(n, settings);
    return t === "rose" ? "bg-rose-50 text-rose-700" : t === "amber" ? "bg-amber-50 text-amber-800" : "text-ink";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
          <option value="">Бүх салбар</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
          <option value="">Бүх баг</option>
          {teams.filter((t) => !branch || t.branch_id === branch).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="self-center text-xs text-muted">
          Шар ≥ {settings.vitalsWarn}, улаан ≥ {settings.vitalsAlert}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Агент</th>
              {codes.map((c) => (
                <th key={c} className="px-2 py-2 text-center font-medium">
                  {worklistLabel(c, settings).label}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium">Нийт</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr className="bg-surface-2/50 font-semibold">
              <td className="px-3 py-2 text-ink">Хүрээний нийт</td>
              {codes.map((c) => (
                <td key={c} className="px-2 py-2 text-center tabular-nums">
                  {totals[c]}
                </td>
              ))}
              <td className="px-2 py-2 text-center tabular-nums">{codes.reduce((s, c) => s + totals[c], 0)}</td>
            </tr>
            {filtered.map((r) => (
              <tr key={r.ownerId || "none"}>
                <td className="px-3 py-2 text-ink">{r.ownerName}</td>
                {codes.map((c) => (
                  <td key={c} className="px-1 py-1 text-center">
                    <button
                      type="button"
                      disabled={!r.counts[c]}
                      onClick={() => setOpen(open && open.owner === r.ownerId && open.code === c ? null : { owner: r.ownerId, code: c })}
                      className={cn(
                        "min-w-10 rounded-lg px-2 py-1.5 tabular-nums",
                        r.counts[c] ? toneCls(r.counts[c]) : "text-subtle",
                        open?.owner === r.ownerId && open.code === c && "ring-2 ring-brand-300"
                      )}
                    >
                      {r.counts[c]}
                    </button>
                  </td>
                ))}
                <td className="px-2 py-2 text-center tabular-nums text-ink">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-sm font-semibold text-ink">
            {rows.find((r) => r.ownerId === open.owner)?.ownerName} — {worklistLabel(open.code, settings).label}
          </p>
          <ul className="divide-y divide-line">
            {openList.map((e) => (
              <li key={e.key} className="py-1.5">
                <Link href={e.href} className="flex items-center gap-2 text-sm hover:text-brand-700">
                  <span className="truncate font-medium text-ink">{e.name}</span>
                  <span className="truncate text-muted">{e.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

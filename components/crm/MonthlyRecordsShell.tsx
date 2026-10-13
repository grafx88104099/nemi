"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { MonthlyRecordForm } from "@/components/crm/MonthlyRecordForm";
import type { MonthlyRecordRow } from "@/lib/queries-crm-rentals";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * R-07: сарын менежментийн бүртгэлүүд (?month=) — бөглөлтийн %, hold төлөв
 * (F-555–559). Бүртгэл сар эхлэхэд cron-оор автомат үүснэ (Д-14).
 */
export function MonthlyRecordsShell({
  records,
  month,
  roles,
}: {
  records: MonthlyRecordRow[];
  month: string;
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const canEdit = roles.includes("property_manager");
  const open = records.find((r) => r.id === openId) ?? null;

  const complete = records.filter((r) => Number(r.completeness_pct) >= 100).length;
  const compliancePct = records.length ? Math.round((complete / records.length) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Сарын менежментийн бүртгэл</h1>
          <p className="text-sm text-muted">
            Журмын 9.2 маягт — «Сарын хяналтын гүйцэтгэл 100%» KPI бөглөлтөөс автомат (F-558).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {compliancePct != null && (
            <Badge tone={compliancePct >= 100 ? "green" : "amber"}>Бөглөлт: {compliancePct}%</Badge>
          )}
          <Input
            type="month"
            className="w-44"
            value={month.slice(0, 7)}
            onChange={(e) => router.push(`/office/crm/rentals/monthly?month=${e.target.value}`)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Объект</th>
              <th className="px-4 py-3 font-medium">Гэрээ</th>
              <th className="px-4 py-3 font-medium">Бөглөлт</th>
              <th className="px-4 py-3 font-medium">Цэвэр орлого</th>
              <th className="px-4 py-3 font-medium">Урамшууллын hold (F-559)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records.map((r) => {
              const pct = Number(r.completeness_pct);
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {r.property_number} · {r.property_name}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.agreement_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={"h-full rounded-full " + (pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500")}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted">{Math.round(pct)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {r.net_income != null ? `${Number(r.net_income).toLocaleString()}₮` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.commission_hold ? (
                      <span className="flex items-center gap-1 text-amber-600">
                        <CircleAlert className="size-4" /> Hold
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CircleCheck className="size-4" /> Чөлөөтэй
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  Энэ сард бүртгэл алга — сар эхлэхэд идэвхтэй менежментийн гэрээ бүрд автомат үүснэ (Д-14).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={open != null}
        onClose={() => setOpenId(null)}
        title={open ? `${open.property_number} — ${month.slice(0, 7)} сарын бүртгэл` : ""}
        widthClassName="max-w-2xl"
      >
        {open && <MonthlyRecordForm record={open} canEdit={canEdit} onSaved={() => setOpenId(null)} />}
      </Drawer>
    </div>
  );
}

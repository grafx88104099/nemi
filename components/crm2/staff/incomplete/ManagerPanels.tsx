import { BarChart3, Users } from "lucide-react";

import { PROPERTY_SOURCE_LABEL, type Crm2PropertySourceKey } from "@/lib/crm2/labels";
import type { TeamFillStat } from "@/lib/crm2/queries/incomplete";
import type { Crm2StaffMetrics } from "@/lib/crm2/queries/metrics";
import { cn } from "@/lib/utils";

import { PERCENT_TONE_CLASS, clampPercent, formatDuration, percentTone } from "./incomplete-model";

/** Багийн гүйцэтгэл: агент бүрийн дутуу хөрөнгийн тоо, дундаж хувь (бага нь эхэнд). */
export function TeamFillPanel({ stats, average }: { stats: TeamFillStat[]; average: number | null }) {
  if (!stats.length) return null;
  return (
    <section aria-label="Багийн гүйцэтгэл" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Users className="size-4 text-brand-600" aria-hidden />
        Багийн гүйцэтгэл{average != null ? <span className="font-normal text-muted"> · дундаж {average}%</span> : null}
      </h2>
      <ul className="mt-3 space-y-2">
        {stats.map((s) => {
          const pct = clampPercent(s.avgPercent);
          const tone = PERCENT_TONE_CLASS[percentTone(pct)];
          return (
            <li key={s.agentId} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate text-ink">{s.name ?? "Агент"}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className={cn("h-full", tone.bar)} style={{ width: `${pct}%` }} />
              </div>
              <span className={cn("w-12 text-right text-xs font-semibold tabular-nums", tone.text)}>{pct}%</span>
              <span className="w-20 text-right text-xs tabular-nums text-muted">{s.count} хөрөнгө</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Шуурхай бүртгэлийн туршилтын хэмжүүр (P2) — менежерт. Зөвхөн тоо, хугацаа.
 * pilot өгвөл туршилтын агентууд ба нийт оффисыг зэрэгцүүлнэ.
 */
export function MetricsPanel({ all, pilot }: { all: Crm2StaffMetrics; pilot: Crm2StaffMetrics | null }) {
  const sources = Object.entries(all.savesBySource).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-label="Бүртгэлийн хэмжүүр" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <BarChart3 className="size-4 text-brand-600" aria-hidden />
        Бүртгэлийн хэмжүүр <span className="font-normal text-muted">· сүүлийн {all.days} хоног</span>
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Үзүүлэлт</th>
              <th scope="col" className="py-1 pr-3 font-medium">Оффис</th>
              {pilot ? <th scope="col" className="py-1 font-medium">Туршилтын агентууд</th> : null}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <MetricRow label="Шуурхай хадгалалт" a={String(all.quick.saves)} b={pilot ? String(pilot.quick.saves) : null} />
            <MetricRow
              label="Шуурхай: нээснээс хадгалах (медиан)"
              a={formatDuration(all.quick.medianOpenToSaveMs)}
              b={pilot ? formatDuration(pilot.quick.medianOpenToSaveMs) : null}
            />
            <MetricRow
              label="Шуурхай: эхний оролтоос хадгалах"
              a={formatDuration(all.quick.medianFirstInputToSaveMs)}
              b={pilot ? formatDuration(pilot.quick.medianFirstInputToSaveMs) : null}
            />
            <MetricRow label="Бүрэн форм хадгалалт" a={String(all.full.saves)} b={pilot ? String(pilot.full.saves) : null} />
            <MetricRow
              label="Бүрэн форм: нээснээс хадгалах"
              a={formatDuration(all.full.medianOpenToSaveMs)}
              b={pilot ? formatDuration(pilot.full.medianOpenToSaveMs) : null}
            />
            <MetricRow
              label="Ноорог сэргээх санал / ашигласан / автомат"
              a={`${all.restore.offers} / ${all.restore.used} / ${all.restore.auto}`}
              b={pilot ? `${pilot.restore.offers} / ${pilot.restore.used} / ${pilot.restore.auto}` : null}
            />
            <MetricRow
              label="Сүлжээгүй хадгалсан / ард илгээсэн"
              a={`${all.background.queued} / ${all.background.sent}`}
              b={pilot ? `${pilot.background.queued} / ${pilot.background.sent}` : null}
            />
            <MetricRow
              label="Эзэн шийдвэрлэгдээгүй үлдсэн"
              a={`${all.ownerPending.count}${all.ownerPending.rate != null ? ` (${Math.round(all.ownerPending.rate * 100)}%)` : ""}`}
              b={
                pilot
                  ? `${pilot.ownerPending.count}${pilot.ownerPending.rate != null ? ` (${Math.round(pilot.ownerPending.rate * 100)}%)` : ""}`
                  : null
              }
            />
          </tbody>
        </table>
      </div>
      {sources.length ? (
        <p className="mt-3 text-xs text-muted">
          Шинэ хөрөнгө эх сурвалжаар:{" "}
          {sources.map(([k, n]) => `${PROPERTY_SOURCE_LABEL[k as Crm2PropertySourceKey] ?? k} ${n}`).join(" · ")}
        </p>
      ) : null}
      {all.truncated ? <p className="mt-1 text-xs text-amber-800">Мөрийн хязгаарт хүрсэн — тоо дутуу байж болно.</p> : null}
    </section>
  );
}

function MetricRow({ label, a, b }: { label: string; a: string; b: string | null }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
        {label}
      </th>
      <td className="py-1.5 pr-3 text-ink">{a}</td>
      {b !== null ? <td className="py-1.5 text-ink">{b}</td> : null}
    </tr>
  );
}

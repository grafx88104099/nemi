import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  Flame,
  Handshake,
  Smile,
} from "lucide-react";

import { KpiTile } from "@/components/crm/CrmDashboard/KpiTile";
import { FunnelChart } from "@/components/crm/CrmDashboard/FunnelChart";
import { ForecastCard } from "@/components/crm/CrmDashboard/ForecastCard";
import { GoldenRuleViolations } from "@/components/crm/CrmDashboard/GoldenRuleViolations";
import { ArrearsAging } from "@/components/crm/CrmDashboard/ArrearsAging";
import { OccupancyCard } from "@/components/crm/CrmDashboard/OccupancyCard";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shortMNT, fmtDate } from "@/lib/format";
import {
  getExecDashboard,
  getMondayBoard,
  getFridayBoard,
  type MondayBoard,
  type FridayBoard,
} from "@/lib/queries-crm-reports";

export const metadata = { title: "CRM самбар — Оффис" };

/**
 * R-06 Удирдлагын нэгдсэн самбар (U9 — DESIGN §8.2) + Даваа/Баасны
 * хурлын горим (?view=monday|friday — R-02/R-03/R-04). Бүх тоо ЗӨВХӨН
 * 000900-ийн view-үүдээс (зарчим 9 — гар оруулсан дүн харагдахгүй).
 */
export default async function CrmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const mode = view === "monday" || view === "friday" ? view : "exec";

  const tabs = [
    { key: "exec", label: "Нэгдсэн самбар", href: "/office/crm" },
    { key: "monday", label: "Даваагийн хурал", href: "/office/crm?view=monday" },
    { key: "friday", label: "Баасны шүүлт", href: "/office/crm?view=friday" },
  ] as const;

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">CRM самбар</h1>
          <p className="text-sm text-muted">
            {mode === "monday"
              ? "R-02/R-03 — агент бүрийн долоо хоногийн амлалт, урсгалын төлөв"
              : mode === "friday"
                ? "R-04 — долоо хоногийн гүйцэтгэл, хаалт, зөрчил"
                : "R-06 — удирдлагын нэгдсэн KPI, юүлүүр, төсөөлөл"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                mode === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {mode === "exec" ? (
        <ExecView />
      ) : mode === "monday" ? (
        <MondayView />
      ) : (
        <FridayView />
      )}
    </div>
  );
}

// ── R-06 Нэгдсэн самбар ─────────────────────────────────────

async function ExecView() {
  const d = await getExecDashboard();
  const kpi = d.kpi;
  const slaPct =
    kpi && kpi.sla_total > 0 ? `${Math.round((100 * kpi.sla_met) / kpi.sla_total)}%` : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Энэ сарын хаалт"
          value={String(kpi?.closed_txn_count ?? 0)}
          sub={`${shortMNT(Number(kpi?.closed_amount_mnt ?? 0))} · давтан ${kpi?.repeat_txn_count ?? 0}`}
          icon={Handshake}
          tone="brand"
        />
        <KpiTile
          label="Баталгаажсан орлого"
          value={shortMNT(Number(kpi?.verified_income_mnt ?? 0))}
          sub={`Тогтмол орлого ${shortMNT(Number(kpi?.recurring_revenue ?? 0))}`}
          icon={Banknote}
          tone="green"
        />
        <KpiTile
          label="Шинэ сэжим"
          value={String(kpi?.new_leads ?? 0)}
          sub={`Эхний холболтын SLA ${slaPct}`}
          icon={Flame}
        />
        <KpiTile
          label="NPS"
          value={kpi?.nps_score != null ? String(kpi.nps_score) : "—"}
          sub={`${kpi?.nps_count ?? 0} хариулт · ${kpi?.referral_count ?? 0} реферал`}
          icon={Smile}
          tone={kpi?.nps_score != null && kpi.nps_score >= 50 ? "green" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelChart rows={d.funnel} />
        <ForecastCard totals={d.forecast} />
        <GoldenRuleViolations rows={d.violations} />
        <div className="space-y-4">
          <ArrearsAging rows={d.arrears} limit={4} />
          <OccupancyCard rows={d.occupancy} />
        </div>
      </div>

      <p className="text-xs text-subtle">
        Бүх тоо CRM бүртгэлээс автомат — гараар оруулсан дүн самбарт харагдахгүй (зарчим 9).
        Дэлгэрэнгүй тайлан:{" "}
        <Link href="/office/crm/reports" className="font-medium text-brand-700 hover:underline">
          Тайлан хуудас →
        </Link>
      </p>
    </div>
  );
}

// ── R-02/R-03 Даваагийн хурлын горим ────────────────────────

async function MondayView() {
  const b: MondayBoard = await getMondayBoard();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Долоо хоног: {fmtDate(b.weekStart)}-ээс — агент бүрийн нээлттэй урсгал, амлалтын суурь.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold text-ink">Агент бүрийн жинлэсэн урсгал</h2>
            {b.forecastByOwner.length === 0 ? (
              <p className="text-sm text-muted">Нээлттэй боломж алга.</p>
            ) : (
              <div className="space-y-2">
                {b.forecastByOwner.map((r) => (
                  <div key={r.owner_id} className="flex items-center gap-2 text-sm">
                    <span className="truncate font-medium text-ink">{r.full_name ?? "?"}</span>
                    <Badge tone="neutral">{r.open_count} боломж</Badge>
                    <span className="ml-auto shrink-0 tabular-nums text-ink">
                      {shortMNT(r.weighted_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <WeeklyActivityCard
          activity={b.activity}
          moves={b.moves}
          title="Энэ 7 хоногийн бүртгэл (эхлэл)"
        />
      </div>
    </div>
  );
}

// ── R-04 Баасны шүүлтийн горим ──────────────────────────────

async function FridayView() {
  const b: FridayBoard = await getFridayBoard();
  const totWon = b.moves.reduce((s, m) => s + m.won, 0);
  const totLost = b.moves.reduce((s, m) => s + m.lost, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Амжилттай хаалт" value={String(totWon)} icon={Handshake} tone="green" />
        <KpiTile label="Алдсан" value={String(totLost)} icon={CalendarDays} tone={totLost ? "rose" : "neutral"} />
        <KpiTile
          label="Материаллаг бүртгэл"
          value={String(b.activity.reduce((s, a) => s + a.material, 0))}
          sub="Долоо хоногт"
        />
        <KpiTile
          label="Алтан дүрмийн зөрчил"
          value={String(b.violations.length)}
          tone={b.violations.length ? "rose" : "green"}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyActivityCard activity={b.activity} moves={b.moves} title="Агент бүрийн гүйцэтгэл" />
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-ink">Алдсан шалтгааны бүтэц (90 хоног)</h2>
              {b.lostReasons.length === 0 ? (
                <p className="text-sm text-muted">Алдсан боломж алга.</p>
              ) : (
                <div className="space-y-1.5">
                  {b.lostReasons.map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-sm">
                      <span className="truncate text-ink">{r.label}</span>
                      <span className="ml-auto shrink-0 tabular-nums font-semibold text-ink">{r.cnt}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
          <GoldenRuleViolations rows={b.violations} />
        </div>
      </div>
    </div>
  );
}

// ── Долоо хоногийн бүртгэлийн хүснэгт (R-02/R-04 дундын) ────

function WeeklyActivityCard({
  activity,
  moves,
  title,
}: {
  activity: MondayBoard["activity"];
  moves: MondayBoard["moves"];
  title: string;
}) {
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted">Энэ 7 хоногт бүртгэл алга.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-2 font-medium">Агент</th>
                  <th className="px-2 py-1.5 text-right font-medium">Залгалт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Уулзалт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Үзлэг</th>
                  <th className="px-2 py-1.5 text-right font-medium">Ахисан</th>
                  <th className="px-2 py-1.5 text-right font-medium">Хаалт</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => {
                  const m = moves.find((x) => x.owner_id === a.owner_id);
                  return (
                    <tr key={a.owner_id} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-ink">{a.full_name ?? "?"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.calls}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.meetings}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.showings}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m?.advanced ?? 0}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m?.won ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

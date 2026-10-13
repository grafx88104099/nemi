import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shortMNT, fmtDate } from "@/lib/format";
import { COMMISSION_STATUS_LABEL, type CommissionStatus } from "@/lib/constants-crm";
import {
  getKpiMonthly,
  getAgentScores,
  getSourceAttribution,
  getBranchKpi,
  getCommissionSummaryView,
  getOwnerStatementReport,
  getMonthlyCompliance,
  getComplaints,
  getComplaintContactOptions,
  sumCommissionSummary,
  weekStartIso,
} from "@/lib/queries-crm-reports";
import { ComplaintShell } from "@/components/crm/ComplaintShell";

export const metadata = { title: "Тайлан — CRM" };

const REPORTS = [
  { key: "kpi", label: "R-14 · Сарын KPI" },
  { key: "agents", label: "R-05 · Агентын үнэлгээ" },
  { key: "sources", label: "R-11 · Эх сурвалж" },
  { key: "branches", label: "R-12 · Салбарууд" },
  { key: "payouts", label: "R-10 · Тайлагнал ба олголт" },
  { key: "complaints", label: "Гомдол (P-09)" },
] as const;
type ReportKey = (typeof REPORTS)[number]["key"];

/**
 * R-05/R-10/R-11/R-12/R-14 тайлангийн цуглуулга (?r= сонголт — DESIGN §8.2).
 * Бүх тоо ЗӨВХӨН 000900-ийн view-үүд + RLS-тэй хүснэгтүүдээс (зарчим 9);
 * агент нээвэл RLS өөрийн хүрээнд л нэгтгэнэ (R-19).
 */
export default async function CrmReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; week?: string }>;
}) {
  const { r, week } = await searchParams;
  const active: ReportKey = (REPORTS.find((x) => x.key === r)?.key ?? "kpi") as ReportKey;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Тайлан</h1>
      <p className="text-sm text-muted">
        KPI автомат тооцоологдоно — эх нь CRM бүртгэл, гар оруулсан дүн харагдахгүй (зарчим 9).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl bg-surface-2 p-1">
        {REPORTS.map((t) => (
          <Link
            key={t.key}
            href={`/office/crm/reports?r=${t.key}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              active === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {active === "kpi" ? (
          <KpiReport />
        ) : active === "agents" ? (
          <AgentScoreReport week={week} />
        ) : active === "sources" ? (
          <SourceReport />
        ) : active === "branches" ? (
          <BranchReport />
        ) : active === "complaints" ? (
          <ComplaintsReport />
        ) : (
          <PayoutReport />
        )}
      </div>
    </div>
  );
}

// ── R-14: сарын KPI нэгтгэл ────────────────────────────────

async function KpiReport() {
  const rows = await getKpiMonthly(12);
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">Сарын KPI нэгтгэл (R-14)</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Тайлант үеийн мэдээлэл алга.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-2 font-medium">Сар</th>
                  <th className="px-2 py-1.5 text-right font-medium">Хаалт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Хаалтын дүн</th>
                  <th className="px-2 py-1.5 text-right font-medium">Баталгаажсан орлого</th>
                  <th className="px-2 py-1.5 text-right font-medium">Шинэ сэжим</th>
                  <th className="px-2 py-1.5 text-right font-medium">SLA %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Бүртгэл</th>
                  <th className="px-2 py-1.5 text-right font-medium">Үзлэг/санал</th>
                  <th className="px-2 py-1.5 text-right font-medium">NPS</th>
                  <th className="px-2 py-1.5 text-right font-medium">Реферал</th>
                  <th className="px-2 py-1.5 text-right font-medium">Давтан</th>
                  <th className="px-2 py-1.5 text-right font-medium">Алдсан (шалтгаантай)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.month} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2 font-medium text-ink">{k.month.slice(0, 7)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.closed_txn_count}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{shortMNT(Number(k.closed_amount_mnt))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{shortMNT(Number(k.verified_income_mnt))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.new_leads}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {k.sla_total > 0 ? `${Math.round((100 * k.sla_met) / k.sla_total)}%` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.material_activities}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {k.showings_with_feedback}/{k.showings}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.nps_score ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.referral_count}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.repeat_txn_count}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {k.lost_with_reason}/{k.lost_opps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── R-05: агентын 100 оноот үнэлгээ ────────────────────────

async function AgentScoreReport({ week }: { week?: string }) {
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : weekStartIso();
  const { rows, weights, targets } = await getAgentScores(weekStart);
  const prevWeek = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const nextWeek = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">Агентын 100 оноот үнэлгээ (R-05)</h2>
          <span className="text-xs text-muted">Долоо хоног: {fmtDate(weekStart)}-ээс</span>
          <span className="ml-auto flex gap-2 text-xs">
            <Link href={`/office/crm/reports?r=agents&week=${prevWeek}`} className="font-medium text-brand-700 hover:underline">
              ← Өмнөх
            </Link>
            <Link href={`/office/crm/reports?r=agents&week=${nextWeek}`} className="font-medium text-brand-700 hover:underline">
              Дараах →
            </Link>
          </span>
        </div>
        <p className="mb-3 text-xs text-subtle">
          Жин: идэвх {weights.activity} · урсгал {weights.pipeline} · ахиц {weights.progress} · хаалт{" "}
          {weights.closing} · мөрдөлт {weights.followup} · чанар {weights.quality} (тохиргоо
          «agent_score_weights»); зорилт: бүртгэл {targets.material}, чанаржуулалт {targets.qualified},
          ахиц {targets.progress}, хаалт {targets.closings}.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Энэ 7 хоногт үнэлэх бүртгэл алга.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-2 font-medium">Агент</th>
                  <th className="px-2 py-1.5 text-right font-medium">Идэвх</th>
                  <th className="px-2 py-1.5 text-right font-medium">Урсгал</th>
                  <th className="px-2 py-1.5 text-right font-medium">Ахиц</th>
                  <th className="px-2 py-1.5 text-right font-medium">Хаалт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Мөрдөлт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Чанар</th>
                  <th className="px-2 py-1.5 text-right font-medium">Нийт</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.owner_id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2 font-medium text-ink">{a.full_name ?? "?"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.activity}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.pipeline}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.progress}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.closing}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.followup}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.quality}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Badge tone={a.total >= 80 ? "green" : a.total >= 50 ? "amber" : "rose"}>
                        {a.total}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── R-11: маркетинг — эх сурвалжийн хамаарал ───────────────

async function SourceReport() {
  const rows = await getSourceAttribution();
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">Эх сурвалжийн хамаарал (R-11)</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Сэжимийн бүртгэл алга.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-2 font-medium">Эх сурвалж</th>
                  <th className="px-2 py-1.5 text-right font-medium">Сэжим</th>
                  <th className="px-2 py-1.5 text-right font-medium">Боломж болсон</th>
                  <th className="px-2 py-1.5 text-right font-medium">Амжилттай</th>
                  <th className="px-2 py-1.5 text-right font-medium">Хөрвөлт %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Орлого</th>
                  <th className="px-2 py-1.5 text-right font-medium">SLA %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Нэгж зардал</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.source_code} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2 font-medium text-ink">{s.source_label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.leads}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.qualified}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.won}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {s.leads > 0 ? `${Math.round((100 * s.won) / s.leads)}%` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{shortMNT(s.won_amount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {s.sla_total > 0 ? `${Math.round((100 * s.sla_met) / s.sla_total)}%` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {s.cost_per_lead != null ? shortMNT(s.cost_per_lead) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-subtle">
          Нэгж зардал тохиргооны «marketing_costs» түлхүүрээс (эх сурвалж бүрийн сарын зардал) —
          тохируулаагүй бол хоосон.
        </p>
      </CardBody>
    </Card>
  );
}

// ── R-12: салбар хоорондын KPI ─────────────────────────────

async function BranchReport() {
  const rows = await getBranchKpi();
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">Салбар хоорондын KPI (R-12)</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Салбарын мэдээлэл алга.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-2 font-medium">Салбар</th>
                  <th className="px-2 py-1.5 text-right font-medium">Нээлттэй боломж</th>
                  <th className="px-2 py-1.5 text-right font-medium">Жинлэсэн урсгал</th>
                  <th className="px-2 py-1.5 text-right font-medium">Менежменттэй объект</th>
                  <th className="px-2 py-1.5 text-right font-medium">Дүүргэлт %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.branch_id ?? "none"} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2 font-medium text-ink">{b.branch_name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{b.open_opps}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{shortMNT(b.weighted_amount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{b.managed_count}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {b.occupancy_pct != null ? `${b.occupancy_pct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-subtle">
          Салбар хоорондын хамтын ажиллагааны даалгавар (Д-30):{" "}
          {rows.reduce((s, b) => s + b.cross_branch_tasks, 0)} удаа.
        </p>
      </CardBody>
    </Card>
  );
}

// ── R-10: тайлагнал ба олголт ──────────────────────────────

async function PayoutReport() {
  const [commission, statements, compliance] = await Promise.all([
    getCommissionSummaryView(),
    getOwnerStatementReport(30),
    getMonthlyCompliance(6),
  ]);
  const byStatus = sumCommissionSummary(commission);
  const statuses = Object.entries(byStatus) as [
    CommissionStatus,
    { cnt: number; amount: number; paid: number },
  ][];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink">Шимтгэлийн олголтын хүлээлт (R-10)</h2>
          {statuses.length === 0 ? (
            <p className="text-sm text-muted">Шимтгэлийн тооцоо алга.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {statuses.map(([status, v]) => (
                <div key={status} className="rounded-xl bg-surface-2 p-3">
                  <Badge tone={COMMISSION_STATUS_LABEL[status]?.tone ?? "neutral"}>
                    {COMMISSION_STATUS_LABEL[status]?.label ?? status}
                  </Badge>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-ink">{shortMNT(v.amount)}</p>
                  <p className="text-xs text-muted">
                    {v.cnt} тооцоо · олгосон {shortMNT(v.paid)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink">Сарын бүртгэл ба тайлангийн сахилга (R-07/F-564)</h2>
          {compliance.length === 0 ? (
            <p className="text-sm text-muted">Сарын бүртгэл алга.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">Сар</th>
                    <th className="px-2 py-1.5 text-right font-medium">Бүртгэл (бүрэн/нийт)</th>
                    <th className="px-2 py-1.5 text-right font-medium">Бөглөлт %</th>
                    <th className="px-2 py-1.5 text-right font-medium">Hold</th>
                    <th className="px-2 py-1.5 text-right font-medium">Тайлан (илгээсэн/нийт)</th>
                    <th className="px-2 py-1.5 text-right font-medium">Хугацаандаа %</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.map((m) => (
                    <tr key={m.month} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-ink">{m.month.slice(0, 7)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {m.records_complete}/{m.records_total}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {m.completion_pct != null ? `${m.completion_pct}%` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m.hold_count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {m.statements_sent}/{m.statements_total}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {m.on_time_pct != null ? `${m.on_time_pct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink">Өмчлөгчийн тайлангууд</h2>
          {statements.length === 0 ? (
            <p className="text-sm text-muted">Тайлан үүсээгүй.</p>
          ) : (
            <div className="space-y-1.5">
              {statements.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-ink">{s.agreement_number ?? "—"}</span>
                  <span className="truncate text-muted">{s.owner_name ?? "?"}</span>
                  <span className="text-xs text-muted">
                    {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-ink">{shortMNT(Number(s.net_payout))}</span>
                  <Badge tone={s.acknowledged_at ? "green" : s.sent_at ? "blue" : "amber"}>
                    {s.acknowledged_at ? "Баталгаажсан" : s.sent_at ? "Илгээсэн" : "Ноорог"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Гомдлын самбар (P-09 алхам 4, U8 mount) ───────────────
// Ноцтой шийдэгдээгүй гомдол = шимтгэлийн hold нөхцөл (F-461) тул
// удирдлагын тайлангийн хажууд нэгдсэн хяналтаар харагдана.

async function ComplaintsReport() {
  const [complaints, contactOptions] = await Promise.all([
    getComplaints(),
    getComplaintContactOptions(),
  ]);
  return <ComplaintShell complaints={complaints} contactOptions={contactOptions} />;
}

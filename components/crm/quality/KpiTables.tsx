import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { shortMNT } from "@/lib/format";
import { CONVERSION_LABELS, pct } from "@/lib/crm/quality";
import type {
  AgentFollowup,
  ClosingSoonRow,
  CrossBranchRow,
  FunnelGroup,
  PipelineReport,
  ResponseReport,
  ResponseRow,
} from "@/lib/queries-crm-kpi";
import { cn } from "@/lib/utils";

/**
 * KPI самбарын хүснэгтүүд (§8.4, §8.5, R1). Утсанд хэвтээ гүйлгэнэ; хоосон
 * бол тайлбартай хоосон төлөв.
 */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        <div className="mt-3">{children}</div>
      </CardBody>
    </Card>
  );
}

function Pct({ v, warnBelow, warnAbove }: { v: number | null; warnBelow?: number; warnAbove?: number }) {
  if (v == null) return <span className="text-subtle">—</span>;
  const warn = (warnBelow != null && v < warnBelow) || (warnAbove != null && v >= warnAbove);
  return <span className={cn("tabular-nums", warn ? "font-semibold text-danger" : "text-ink")}>{v}%</span>;
}

const th = "py-1.5 pr-3 text-left text-xs font-medium text-muted";
const td = "py-1.5 pr-3";

// §8.4(1)(3) Агент бүрийн эргэн холбогдолт, хэтрэлт.
export function AgentFollowupTable({ agents }: { agents: AgentFollowup[] }) {
  return (
    <Section title="Агент тус бүрийн эргэн холбогдолт" sub="Дараагийн үйлдэлгүй, хугацаа хэтэрсэн ажлыг эндээс хянана.">
      {agents.length === 0 ? (
        <EmptyState compact title="Агентын өгөгдөл алга" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Агент</th>
                <th className={th}>Огноотой сэжим</th>
                <th className={th}>Хэтэрсэн</th>
                <th className={th}>Үзлэгийн хариу</th>
                <th className={th}>Саналын эргэн холбогдолт</th>
                <th className={th}>Халуун сэжим</th>
                <th className={th}>Тухайн өдөрт бүртгэсэн</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const k = Object.fromEntries(a.kpis.map((x) => [x.code, x]));
                return (
                  <tr key={a.agent_id} className="border-t border-line">
                    <td className={cn(td, "font-medium text-ink")}>{a.agent_name}</td>
                    <td className={td}>
                      <Pct v={k.next_step_coverage.value} warnBelow={k.next_step_coverage.target} />
                    </td>
                    <td className={td}>
                      <Pct v={k.overdue.value} warnAbove={k.overdue.target} />{" "}
                      <span className="text-xs text-subtle">({a.row.steps_overdue})</span>
                    </td>
                    <td className={td}>
                      <Pct v={k.showing_feedback.value} warnBelow={k.showing_feedback.target} />
                    </td>
                    <td className={td}>
                      <Pct v={k.offer_followup.value} warnBelow={k.offer_followup.target} />
                    </td>
                    <td className={td}>
                      <Pct v={k.hot_lead_frequency.value} warnBelow={k.hot_lead_frequency.target} />
                    </td>
                    <td className={td}>
                      <Pct v={k.same_day_logging.value} warnBelow={k.same_day_logging.target} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// §8.4(6) Агент тус бүрийн хөрвөлт, §8.4(8) эх сурвалж.
export function ConversionTable({ title, sub, groups }: { title: string; sub?: string; groups: FunnelGroup[] }) {
  return (
    <Section title={title} sub={sub}>
      {groups.length === 0 ? (
        <EmptyState compact title="Энэ хугацаанд сэжим алга" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className={th}>Нэр</th>
                <th className={th}>Сэжим</th>
                {CONVERSION_LABELS.map((l) => (
                  <th key={l} className={th}>
                    {l}
                  </th>
                ))}
                <th className={th}>Хаалт</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key || "none"} className="border-t border-line">
                  <td className={cn(td, "font-medium text-ink")}>{g.label}</td>
                  <td className={cn(td, "tabular-nums")}>{g.counts[0]}</td>
                  {g.conversions.map((c, i) => (
                    <td key={i} className={td}>
                      <Pct v={c} />
                    </td>
                  ))}
                  <td className={cn(td, "tabular-nums")}>{g.counts[9]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// §8.4(4) Шат, дүнгээр ангилсан урсгал + §8.5(2) жинлэсэн урсгал.
export function PipelineStageTable({ report }: { report: PipelineReport }) {
  return (
    <Section
      title="Шат, дүнгээр ангилсан хэлцлийн урсгал"
      sub="Дүн ₮-өөр (валютыг тохиргооны ханшаар). Жинлэсэн = дүн × шатны магадлал; хөлс = хүлээгдэж буй компанийн цэвэр хөлс."
    >
      {report.stages.length === 0 ? (
        <EmptyState compact title="Нээлттэй боломж алга" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Урсгал · Шат</th>
                  <th className={th}>Магадлал</th>
                  <th className={th}>Тоо</th>
                  <th className={th}>Дүн</th>
                  <th className={th}>Жинлэсэн дүн</th>
                  <th className={th}>Жинлэсэн хөлс</th>
                  <th className={th}>Энэ сард хаагдах</th>
                </tr>
              </thead>
              <tbody>
                {report.stages.map((s) => (
                  <tr key={`${s.pipeline_code}-${s.stage_code}`} className="border-t border-line">
                    <td className={cn(td, "text-ink")}>
                      <span className="text-xs text-subtle">{s.pipeline_name}</span> · {s.stage_name}
                    </td>
                    <td className={cn(td, "tabular-nums")}>{s.probability}%</td>
                    <td className={cn(td, "tabular-nums")}>{s.open_count}</td>
                    <td className={cn(td, "tabular-nums")}>{shortMNT(s.amount_mnt)}</td>
                    <td className={cn(td, "tabular-nums")}>{shortMNT(s.weighted_mnt)}</td>
                    <td className={cn(td, "tabular-nums")}>{shortMNT(s.weighted_fee_mnt)}</td>
                    <td className={cn(td, "tabular-nums")}>
                      {s.close_month_count} · {shortMNT(s.close_month_weighted_fee)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line-strong font-semibold">
                  <td className={td}>Нийт</td>
                  <td className={td} />
                  <td className={cn(td, "tabular-nums")}>{report.totals.open_count}</td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(report.totals.amount_mnt)}</td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(report.totals.weighted_mnt)}</td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(report.totals.weighted_fee_mnt)}</td>
                  <td className={cn(td, "tabular-nums")}>
                    {report.totals.close_month_count} · {shortMNT(report.totals.close_month_weighted_fee)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {report.totals.unconverted_count > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {report.totals.unconverted_count} боломжийн валютын ханш тохируулагдаагүй тул дүнд ороогүй (Санхүү ханш
              нэмнэ).
            </p>
          )}
          {report.agents.length > 0 && (
            <div className="mt-4 overflow-x-auto border-t border-line pt-3">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Агент</th>
                    <th className={th}>Нээлттэй</th>
                    <th className={th}>Жинлэсэн дүн</th>
                    <th className={th}>Жинлэсэн хөлс</th>
                  </tr>
                </thead>
                <tbody>
                  {report.agents.map((a) => (
                    <tr key={a.agent_id} className="border-t border-line">
                      <td className={cn(td, "text-ink")}>{a.agent_name}</td>
                      <td className={cn(td, "tabular-nums")}>{a.open_count}</td>
                      <td className={cn(td, "tabular-nums")}>{shortMNT(a.weighted_mnt)}</td>
                      <td className={cn(td, "tabular-nums")}>{shortMNT(a.weighted_fee_mnt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// §8.4(5) Энэ долоо хоног, сард хаагдахаар хүлээгдэж буй хэлцэл.
export function ClosingSoonList({ rows, today, weekTo }: { rows: ClosingSoonRow[]; today: string; weekTo: string }) {
  return (
    <Section title="Энэ долоо хоног, сард хаагдахаар хүлээгдэж буй" sub="Хүлээгдэж буй хаалтын огноо өнгөрсөн боломжийг улаанаар.">
      {rows.length === 0 ? (
        <EmptyState compact title="Энэ сард хаагдах боломж алга" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const overdue = r.expected_close_on < today;
            const thisWeek = !overdue && r.expected_close_on <= weekTo;
            return (
              <li key={r.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/office/crm/deals/${r.id}`} className="text-sm font-medium text-ink hover:underline">
                    {r.label}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.pipeline_code} · {r.stage_name} · {r.owner_name ?? "Эзэмшигчгүй"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {r.expected_fee_mnt != null && <span className="tabular-nums text-ink">{shortMNT(r.expected_fee_mnt)}</span>}
                  <Badge tone={overdue ? "rose" : thisWeek ? "amber" : "neutral"}>
                    {overdue ? "Хугацаа өнгөрсөн" : thisWeek ? "Энэ долоо хоногт" : "Энэ сард"} ·{" "}
                    {r.expected_close_on.replaceAll("-", ".")}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// §8.4(7) Алдсан шалтгааны чиг хандлага (сараар).
export function LostTrendTable({ months, reasons }: { months: string[]; reasons: { reason: string; byMonth: Record<string, number>; total: number }[] }) {
  return (
    <Section title="Алдсан шалтгааны чиг хандлага" sub="Амжилтгүй хаагдсан огноогоор, сар бүрээр.">
      {reasons.length === 0 ? (
        <EmptyState compact title="Энэ хугацаанд алдсан хэлцэл алга" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr>
                <th className={th}>Шалтгаан</th>
                {months.map((m) => (
                  <th key={m} className={th}>
                    {m.slice(0, 7).replace("-", ".")}
                  </th>
                ))}
                <th className={th}>Нийт</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.reason} className="border-t border-line">
                  <td className={cn(td, "text-ink")}>{r.reason}</td>
                  {months.map((m) => (
                    <td key={m} className={cn(td, "tabular-nums")}>
                      {r.byMonth[m] ?? 0}
                    </td>
                  ))}
                  <td className={cn(td, "font-semibold tabular-nums")}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// §8.4(8)/§8.5(6) Эх сурвалжийн хөрвөлт ба орлого.
export function SourceRevenueTable({ rows }: { rows: { label: string; revenue: number; leads: number; won: number }[] }) {
  return (
    <Section title="Сэжимийн эх сурвалж тус бүрийн хөрвөлт, орлого" sub="Орлого = Санхүү баталгаажуулсан зуучлалын орлого.">
      {rows.length === 0 ? (
        <EmptyState compact title="Өгөгдөл алга" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr>
                <th className={th}>Эх сурвалж</th>
                <th className={th}>Сэжим</th>
                <th className={th}>Хаалт</th>
                <th className={th}>Хөрвөлт</th>
                <th className={th}>Орлого</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className={cn(td, "text-ink")}>{r.label}</td>
                  <td className={cn(td, "tabular-nums")}>{r.leads}</td>
                  <td className={cn(td, "tabular-nums")}>{r.won}</td>
                  <td className={td}>
                    <Pct v={pct(r.won, r.leads)} />
                  </td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// §5 Маркетинг: аяны үр ашиг.
export function CampaignTable({
  rows,
  editHref,
}: {
  rows: { code: string; leads: number; qualified: number; won: number; revenue: number; cost: number | null }[];
  editHref?: string;
}) {
  return (
    <Section title="Аян, сувгийн үр ашиг" sub="Аяны кодоор бүртгэгдсэн сэжим. Зардлыг Маркетинг тохиргоонд оруулна.">
      {rows.length === 0 ? (
        <EmptyState compact title="Аяны кодтой сэжим алга" description="Сэжим бүртгэхдээ аяны кодыг оруулбал энд бүлэглэгдэнэ." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className={th}>Аян</th>
                <th className={th}>Сэжим</th>
                <th className={th}>Шалгуур хангасан</th>
                <th className={th}>Хаалт</th>
                <th className={th}>Орлого</th>
                <th className={th}>Зардал</th>
                <th className={th}>Нэг сэжмийн зардал</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-line">
                  <td className={cn(td, "font-medium text-ink")}>{r.code}</td>
                  <td className={cn(td, "tabular-nums")}>{r.leads}</td>
                  <td className={cn(td, "tabular-nums")}>{r.qualified}</td>
                  <td className={cn(td, "tabular-nums")}>{r.won}</td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(r.revenue)}</td>
                  <td className={cn(td, "tabular-nums")}>{r.cost == null ? "—" : shortMNT(r.cost)}</td>
                  <td className={cn(td, "tabular-nums")}>
                    {r.cost == null || r.leads === 0 ? "—" : shortMNT(Math.round(r.cost / r.leads))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editHref && (
        <Link href={editHref} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
          Аяны зардал оруулах
        </Link>
      )}
    </Section>
  );
}

// §8.4(9) Салбаруудын харьцуулалт.
export function BranchTable({
  rows,
}: {
  rows: { label: string; revenue: number; closed: number; leads: number; conversion: number | null; agents: number }[];
}) {
  return (
    <Section title="Салбаруудын харьцуулалт">
      {rows.length === 0 ? (
        <EmptyState compact title="Өгөгдөл алга" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className={th}>Салбар</th>
                <th className={th}>Орлого</th>
                <th className={th}>Хаасан хэлцэл</th>
                <th className={th}>Сэжим</th>
                <th className={th}>Хөрвөлт</th>
                <th className={th}>Агент</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className={cn(td, "font-medium text-ink")}>{r.label}</td>
                  <td className={cn(td, "tabular-nums")}>{shortMNT(r.revenue)}</td>
                  <td className={cn(td, "tabular-nums")}>{r.closed}</td>
                  <td className={cn(td, "tabular-nums")}>{r.leads}</td>
                  <td className={td}>
                    <Pct v={r.conversion} />
                  </td>
                  <td className={cn(td, "tabular-nums")}>{r.agents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const TXN_STATUS: Record<string, string> = {
  draft: "Ноорог",
  contract: "Гэрээ",
  payment: "Төлбөр",
  closed: "Хаагдсан",
};

// §8.4(10) Салбар хоорондын хэлцэл.
export function CrossBranchTable({ rows }: { rows: CrossBranchRow[] }) {
  return (
    <Section title="Салбар хоорондын хэлцэл" sub="Боломж, үл хөдлөх, урамшууллын үүрэгт оролцогчдын салбар зөрүүтэй хэлцэл; нээлттэй маргааныг тэмдэглэнэ.">
      {rows.length === 0 ? (
        <EmptyState compact title="Салбар хоорондын хэлцэл алга" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.transaction_id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/office/crm/transactions/${r.transaction_id}`} className="text-sm font-medium text-ink hover:underline">
                  {r.number}
                </Link>
                <p className="text-xs text-muted">
                  {r.branches.join(" · ")} · {r.agent_count} агент · {r.owner_name ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {r.amount_mnt != null && <span className="tabular-nums">{shortMNT(r.amount_mnt)}</span>}
                <Badge tone="neutral">{TXN_STATUS[r.status] ?? "Хэлцэл"}</Badge>
                {r.open_disputes > 0 && <Badge tone="rose">Нээлттэй маргаан {r.open_disputes}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function minutesLabel(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${Math.round(m)} мин`;
  if (m < 60 * 24) return `${Math.round((m / 60) * 10) / 10} цаг`;
  return `${Math.round((m / 1440) * 10) / 10} хоног`;
}

function ResponseRows({ rows }: { rows: ResponseRow[] }) {
  return (
    <table className="w-full min-w-[420px] text-sm">
      <thead>
        <tr>
          <th className={th}>Нэр</th>
          <th className={th}>Холбогдсон</th>
          <th className={th}>Дундаж хугацаа</th>
          <th className={th}>Хугацаандаа</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key || "none"} className="border-t border-line">
            <td className={cn(td, "text-ink")}>{r.label}</td>
            <td className={cn(td, "tabular-nums")}>{r.contacted}</td>
            <td className={cn(td, "tabular-nums")}>{minutesLabel(r.avg_min)}</td>
            <td className={td}>
              <Pct v={r.sla_pct} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// R1: Эхний холболтын хурд минутаар.
export function ResponseTimeSection({ report }: { report: ResponseReport }) {
  return (
    <Section
      title="Эхний холболтын хурд"
      sub="Сэжим ирснээс утга бүхий эхний холболт хүртэлх хугацаа. Хугацаандаа = эхний холболтын хугацааны дотор."
    >
      {report.total.contacted === 0 && report.total.sla_total === 0 ? (
        <EmptyState compact title="Энэ хугацаанд сэжим алга" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-ink">{minutesLabel(report.total.avg_min)}</p>
              <p className="text-xs text-muted">Дундаж хугацаа</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-ink">
                {report.total.sla_pct == null ? "—" : `${report.total.sla_pct}%`}
              </p>
              <p className="text-xs text-muted">Хугацаандаа холбогдсон</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-semibold text-muted">Агентаар</p>
              <ResponseRows rows={report.byAgent} />
            </div>
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-semibold text-muted">Эх сурвалжаар</p>
              <ResponseRows rows={report.bySource} />
            </div>
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-semibold text-muted">Долоо хоногоор (Даваа)</p>
              <ResponseRows rows={report.byWeek.map((w) => ({ ...w, label: w.label.replaceAll("-", ".") }))} />
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

import { fmtDateTime } from "@/lib/format";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QUALITY_CRITERIA, QUALITY_CRITERION_LABEL, QUALITY_ENTITY_LABEL, qualityEntityHref } from "@/lib/crm/quality";
import type { AgentQualityRow, CriterionSummary, ExportLogRow, QualityCheckRow } from "@/lib/queries-crm-kpi";
import { cn } from "@/lib/utils";

function PctBar({ value, threshold }: { value: number | null; threshold?: number }) {
  if (value == null) return <span className="text-xs text-subtle">—</span>;
  const ok = threshold == null || value >= threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", ok ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      <span className={cn("w-12 text-right text-xs font-semibold tabular-nums", ok ? "text-ink" : "text-danger")}>{value}%</span>
    </div>
  );
}

const ENTITY_LABEL: Record<string, string> = { crm_contacts: "Бүртгэл", ...QUALITY_ENTITY_LABEL };

const EXPORT_ENTITY_LABEL: Record<string, string> = {
  crm_contacts: "Харилцагч",
  crm_transactions: "Хэлцэл",
  crm_leads: "Сэжим",
};

/**
 * Өгөгдлийн чанар (§6.29 автомат хэсэг, §6.25.6, §8.5(8)): шалгуур бүрийн
 * тэнцсэн хувь, агент бүрийн чанарын хувь, засах шаардлагатай бүртгэлүүд,
 * экспортын бүртгэл (§6.29.12).
 */
export function DataQualityPanel({
  summary,
  agents,
  failures,
  exportLog,
  minPct,
  activeCriterion,
}: {
  summary: { rows: CriterionSummary[]; pct: number | null; total: number; passed: number };
  agents: AgentQualityRow[];
  failures: QualityCheckRow[];
  exportLog: ExportLogRow[];
  minPct: number;
  activeCriterion?: string;
}) {
  if (summary.total === 0) {
    return (
      <div className="mt-5">
        <EmptyState
          icon={ShieldCheck}
          title="Шалгах бүртгэл алга"
          description="Сэжим, харилцагч, боломж бүртгэгдмэгц 12 шалгуурын автомат шалгалт энд харагдана."
        />
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">CRM-ийн нийцэл</h2>
              <span className="text-2xl font-extrabold tabular-nums text-ink">{summary.pct ?? "—"}%</span>
            </div>
            <p className="mb-3 text-xs text-muted">
              {summary.total} шалгалтаас {summary.passed} тэнцсэн. Мөр дээр дарж дутуу бүртгэлүүдийг харна.
            </p>
            <ul className="space-y-1.5">
              {summary.rows.map((r) => (
                <li key={r.criterion}>
                  <Link
                    href={`/office/crm/quality?tab=data&criterion=${r.criterion}`}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm hover:bg-surface-2",
                      activeCriterion === r.criterion && "bg-brand-50"
                    )}
                  >
                    <span className="truncate text-ink">{QUALITY_CRITERION_LABEL[r.criterion].label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-subtle tabular-nums">
                        {r.passed}/{r.total}
                      </span>
                      <PctBar value={r.pct} threshold={minPct} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-1 text-sm font-semibold text-ink">Агент бүрийн бүртгэлийн чанар</h2>
            <p className="mb-3 text-xs text-muted">
              Урамшууллын хяналтын босго: {minPct}%. Босгоос доогуур агентын шинэ урамшуулал хяналтад орно.
            </p>
            {agents.length === 0 ? (
              <EmptyState compact title="Агентын бүртгэл алга" />
            ) : (
              <ul className="space-y-1.5">
                {agents.map((a) => (
                  <li key={a.agent_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{a.agent_name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-subtle tabular-nums">
                        {a.passed}/{a.checked}
                      </span>
                      <PctBar value={a.quality_pct} threshold={minPct} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              Засах шаардлагатай бүртгэл
              {activeCriterion && QUALITY_CRITERIA.includes(activeCriterion as never)
                ? ` — ${QUALITY_CRITERION_LABEL[activeCriterion as keyof typeof QUALITY_CRITERION_LABEL].label}`
                : ""}
            </h2>
            {activeCriterion && (
              <Link href="/office/crm/quality?tab=data" className="text-xs font-semibold text-brand-700 hover:underline">
                Бүх шалгуур
              </Link>
            )}
          </div>
          {failures.length === 0 ? (
            <EmptyState compact title="Дутуу бүртгэл алга" description="Энэ шалгуурын бүх бүртгэл тэнцсэн байна." />
          ) : (
            <ul className="divide-y divide-line">
              {failures.map((f) => {
                const href = qualityEntityHref(f.entity, f.entity_id, "/office/crm");
                return (
                  <li key={`${f.criterion}-${f.entity_id}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        <span className="mr-2 text-xs text-subtle">{ENTITY_LABEL[f.entity] ?? "Бүртгэл"}</span>
                        {href ? (
                          <Link href={href} className="font-medium hover:underline">
                            {f.label ?? "—"}
                          </Link>
                        ) : (
                          <span className="font-medium">{f.label ?? "—"}</span>
                        )}
                      </p>
                      <p className="text-xs text-danger">{f.reason ?? QUALITY_CRITERION_LABEL[f.criterion].label}</p>
                    </div>
                    <span className="text-xs text-muted">{f.agent_name ?? "Эзэмшигчгүй"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-1 text-sm font-semibold text-ink">Мэдээллийн экспорт (сүүлийн 30 хоног)</h2>
          <p className="mb-3 text-xs text-muted">Харилцагчийн мэдээллийн ашиглалтыг хянахад: хэн, юуг, хэдэн мөрөөр татсан.</p>
          {exportLog.length === 0 ? (
            <EmptyState compact title="Экспорт хийгдээгүй" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {exportLog.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-ink">
                    {EXPORT_ENTITY_LABEL[e.entity] ?? "Бүртгэл"}
                    {e.rows != null ? ` · ${e.rows} мөр` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {e.actor_name ?? "—"} · {fmtDateTime(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

import Link from "next/link";
import {
  AlarmClock,
  CalendarCheck,
  Eye,
  Flame,
  KanbanSquare,
  ListTodo,
  Percent,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/crm/CrmDashboard/KpiTile";
import { fmtMNT, shortMNT, fmtDate, fmtDateTime } from "@/lib/format";
import {
  LEAD_GRADE_LABEL,
  COMMISSION_STATUS_LABEL,
  type LeadGrade,
  type CommissionStatus,
} from "@/lib/constants-crm";
import type { AgentDayboard as AgentDayboardData } from "@/lib/queries-crm-pipeline";
import type { AgentTodayRow, ForecastTotals } from "@/lib/queries-crm-reports";

/**
 * R-01 Агентын өдрийн самбар (U9 — DESIGN §8.2): өнөөдрийн даалгавар,
 * хоцорсон эргэн холбогдолт, халуун харилцагч, үзлэгийн 24ц санал,
 * өөрийн урсгал/төсөөлөл, өөрийн шимтгэлийн товчоо (F-471).
 * Өдрийн сахилгын ажлын дараалал эндээс эхэлнэ (ToR 6.1).
 */
export function AgentDayboard({
  board,
  today,
  forecast,
  commission,
  basePath = "/agent/crm",
}: {
  board: AgentDayboardData;
  today: AgentTodayRow | null;
  forecast: ForecastTotals;
  commission: Partial<Record<CommissionStatus, { cnt: number; amount: number; paid: number }>>;
  basePath?: string;
}) {
  const commissionRows = (Object.entries(commission) as [CommissionStatus, { cnt: number; amount: number; paid: number }][])
    .filter(([, v]) => v.cnt > 0)
    .sort((a, b) => b[1].amount - a[1].amount);

  return (
    <div className="space-y-4">
      {/* Толгойн тоолуур (crm_v_agent_today) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Өнөөдрийн даалгавар, алхам"
          value={String((today?.tasks_today ?? board.tasksToday.length) + (today?.steps_today ?? 0))}
          sub={`${today?.tasks_overdue ?? board.tasksOverdue.length} хэтэрсэн даалгавар`}
          icon={ListTodo}
          tone={(today?.tasks_overdue ?? board.tasksOverdue.length) > 0 ? "amber" : "neutral"}
        />
        <KpiTile
          label="Хоцорсон эргэн холбогдолт"
          value={String(today?.steps_overdue ?? board.overdueSteps.length)}
          sub="Идэвхтэй сэжим, хамгийн удаанаас"
          icon={CalendarCheck}
          tone={(today?.steps_overdue ?? board.overdueSteps.length) > 0 ? "rose" : "green"}
        />
        <KpiTile
          label="Халуун харилцагч (A)"
          value={String(today?.hot_leads ?? 0)}
          sub={`${today?.active_leads ?? 0} идэвхтэй сэжим`}
          icon={Flame}
          tone="brand"
        />
        <KpiTile
          label="Жинлэсэн урсгал"
          value={shortMNT(forecast.weighted_amount)}
          sub={`${forecast.open_count} нээлттэй боломж · 30 хоногт ${shortMNT(forecast.weighted_30)}`}
          icon={KanbanSquare}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Даалгавар */}
        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <ListTodo className="size-4 text-brand-600" /> Даалгавар
              <Badge tone={board.tasksOverdue.length ? "rose" : "green"}>{board.tasksOverdue.length} хэтэрсэн</Badge>
              <Badge tone="neutral">{board.tasksToday.length} өнөөдөр</Badge>
            </h2>
            <div className="space-y-2">
              {[...board.tasksOverdue, ...board.tasksToday].slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <AlarmClock
                    className={
                      board.tasksOverdue.includes(t)
                        ? "size-4 shrink-0 text-rose-600"
                        : "size-4 shrink-0 text-subtle"
                    }
                  />
                  <span className="truncate text-ink">{t.title}</span>
                  {t.deadline ? (
                    <span className="ml-auto shrink-0 text-xs text-muted">{fmtDateTime(t.deadline)}</span>
                  ) : null}
                </div>
              ))}
              {board.tasksOverdue.length + board.tasksToday.length === 0 ? (
                <p className="text-sm text-muted">Өнөөдөрт даалгавар алга.</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* Хоцорсон эргэн холбогдолт (F-308) */}
        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarCheck className="size-4 text-brand-600" /> Хоцорсон эргэн холбогдолт
              <Badge tone={board.overdueSteps.length ? "rose" : "green"}>{board.overdueSteps.length}</Badge>
            </h2>
            <div className="space-y-2">
              {board.overdueSteps.slice(0, 10).map((l) => (
                <Link
                  key={l.id}
                  href={`${basePath}/leads/${l.id}`}
                  className="flex items-center gap-2 text-sm hover:text-brand-700"
                >
                  <span className="truncate font-medium text-ink">{l.contact_name}</span>
                  <span className="truncate text-muted">{l.next_step ?? "—"}</span>
                  <span className="ml-auto shrink-0 text-xs text-rose-600">
                    {l.next_step_date ? fmtDate(l.next_step_date) : "—"}
                  </span>
                </Link>
              ))}
              {board.overdueSteps.length === 0 ? (
                <p className="text-sm text-muted">Хоцорсон алхам алга — алтан дүрэм сахигдаж байна.</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* Шинэ оноогдсон сэжим */}
        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Flame className="size-4 text-brand-600" /> Шинэ сэжим
              <Badge tone={board.newLeads.length ? "amber" : "neutral"}>{board.newLeads.length}</Badge>
            </h2>
            <div className="space-y-2">
              {board.newLeads.slice(0, 10).map((l) => (
                <Link
                  key={l.id}
                  href={`${basePath}/leads/${l.id}`}
                  className="flex items-center gap-2 text-sm hover:text-brand-700"
                >
                  <span className="truncate font-medium text-ink">{l.contact_name}</span>
                  {l.grade ? (
                    <Badge tone={LEAD_GRADE_LABEL[l.grade as LeadGrade]?.tone ?? "neutral"}>
                      {l.grade.toUpperCase()}
                    </Badge>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-muted">Эхний холболт хийх</span>
                </Link>
              ))}
              {board.newLeads.length === 0 ? <p className="text-sm text-muted">Шинэ сэжим алга.</p> : null}
            </div>
          </CardBody>
        </Card>

        {/* Үзлэгийн 24ц санал (Д-05) */}
        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Eye className="size-4 text-brand-600" /> Санал хүлээж буй үзлэг
              <Badge tone={board.pendingFeedback.length ? "amber" : "green"}>{board.pendingFeedback.length}</Badge>
            </h2>
            <div className="space-y-2">
              {board.pendingFeedback.map((s) => (
                <Link
                  key={s.id}
                  href={s.opportunity_id ? `${basePath}/pipeline/${s.opportunity_id}` : `${basePath}/pipeline`}
                  className="flex items-center gap-2 text-sm hover:text-brand-700"
                >
                  <span className="truncate font-medium text-ink">{s.contact_name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{fmtDateTime(s.occurred_at)}</span>
                </Link>
              ))}
              {board.pendingFeedback.length === 0 ? (
                <p className="text-sm text-muted">Хүлээгдэж буй санал алга.</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* Миний урсгал (F-353) */}
        <Card>
          <CardBody>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <KanbanSquare className="size-4 text-brand-600" /> Миний урсгал
            </h2>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{forecast.open_count}</p>
                <p className="text-xs text-muted">Нээлттэй боломж</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{fmtMNT(forecast.weighted_amount)}</p>
                <p className="text-xs text-muted">Жинлэсэн төсөөлөл (F-353)</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{today?.offer_opps ?? 0}</p>
                <p className="text-xs text-muted">Хүлээгдэж буй үнийн санал</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{today?.closing_opps ?? 0}</p>
                <p className="text-xs text-muted">Хаах шатны хэлцэл</p>
              </div>
              <Link href={`${basePath}/pipeline`} className="ml-auto text-sm font-medium text-brand-700 hover:underline">
                Канбан руу очих →
              </Link>
            </div>
          </CardBody>
        </Card>

        {/* Миний шимтгэл (F-471 — зөвхөн өөрийн тооцоо) */}
        <Card>
          <CardBody>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Percent className="size-4 text-brand-600" /> Миний шимтгэл
            </h2>
            {commissionRows.length === 0 ? (
              <p className="text-sm text-muted">Шимтгэлийн тооцоо алга.</p>
            ) : (
              <div className="space-y-1.5">
                {commissionRows.map(([status, v]) => (
                  <div key={status} className="flex items-center gap-2 text-sm">
                    <Badge tone={COMMISSION_STATUS_LABEL[status]?.tone ?? "neutral"}>
                      {COMMISSION_STATUS_LABEL[status]?.label ?? status}
                    </Badge>
                    <span className="text-muted">{v.cnt} тооцоо</span>
                    <span className="ml-auto shrink-0 tabular-nums text-ink">{fmtMNT(v.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link
              href={`${basePath}/commissions`}
              className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
            >
              Дэлгэрэнгүй →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

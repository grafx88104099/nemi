import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  CheckCircle2,
  CircleDashed,
  Compass,
  Flame,
  Gauge,
  KanbanSquare,
  Link2,
  ListChecks,
  Percent,
  QrCode,
  Repeat,
  Sunset,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WeekStrip } from "@/components/crm/weekly/WeekStrip";
import { TodayQueue } from "@/components/crm/mobile/TodayQueue";
import { PushToggle } from "@/components/crm/mobile/PushToggle";
import { InstallPrompt } from "@/components/crm/mobile/InstallPrompt";
import { fmtMNT, shortMNT } from "@/lib/format";
import { COMMISSION_STATUS_LABEL, LEAD_GRADE_LABEL, type CommissionStatus, type LeadGrade } from "@/lib/constants-crm";
import { CONVERSION_LABELS } from "@/lib/crm/quality";
import { PIPELINE_BUCKETS, PIPELINE_BUCKET_LABEL, WEEKDAY_LONG } from "@/lib/crm/today";
import { worklistLabel, WORKLIST_CODES, type WorklistCode, type WorklistSettings } from "@/lib/crm/worklists";
import type { TodayData } from "@/lib/queries-crm-today";
import { VITALS_ROLES } from "@/lib/crm/worklists";
import type { WeeklyMetricCode } from "@/lib/constants-crm-weekly";
import { cn } from "@/lib/utils";

/**
 * Агентын хяналтын самбар (§8.3): Өнөөдөр, Сэжимийн шатлал, Хэлцлийн
 * урсгал, Үйл ажиллагаа, Хөрвөлт, Орлого, Чанар. Дээр нь өдрийн жишиг
 * хэмнэл (§6.22), өдрийн 4 блок ба өдрийн хаалт (§6.23), ажлын
 * жагсаалтын тоолуур (R15, UX-15). Мөр, тоо бүр зорьсон дэлгэц рүү (UX-18).
 */

const ACTIVITY_CODES: WeeklyMetricCode[] = [
  "outbound_contacts",
  "meaningful_conversations",
  "owner_meetings",
  "buyer_meetings",
  "showings",
];

function pctText(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

function Section({
  icon: Icon,
  title,
  href,
  hrefLabel = "Дэлгэрэнгүй",
  children,
  className,
}: {
  icon: typeof Flame;
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardBody>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon className="size-4 text-brand-600" /> {title}
          {href ? (
            <Link href={href} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
              {hrefLabel} →
            </Link>
          ) : null}
        </h2>
        {children}
      </CardBody>
    </Card>
  );
}

function Stat({ value, label, href, tone }: { value: string; label: string; href?: string; tone?: "rose" | "amber" | "green" }) {
  const body = (
    <>
      <span
        className={cn(
          "block text-xl font-bold tabular-nums",
          tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-emerald-700" : "text-ink"
        )}
      >
        {value}
      </span>
      <span className="block text-xs text-muted">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border border-line px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-line px-3 py-2">{body}</div>
  );
}

export function AgentDayboard({
  data,
  worklists,
  basePath = "/agent/crm",
}: {
  data: TodayData;
  worklists: { counts: Record<WorklistCode, number>; settings: WorklistSettings } | null;
  basePath?: string;
}) {
  const commissionRows = (Object.entries(data.commission) as [CommissionStatus, { cnt: number; amount: number; paid: number }][])
    .filter(([, v]) => v.cnt > 0)
    .sort((a, b) => b[1].amount - a[1].amount);
  const overdueCount = data.items.filter((i) => i.overdue && (i.kind === "lead_step" || i.kind === "opp_step")).length;
  const slaCount = data.items.filter((i) => i.kind === "sla").length;

  return (
    <div className="space-y-4">
      {/* §6.22 Өнөөдрийн чиглэл */}
      <div className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Compass className="size-4 text-brand-600" />
          <span className="text-sm font-semibold text-ink">{WEEKDAY_LONG[data.weekday]} — өнөөдрийн чиглэл</span>
        </div>
        {data.rhythm.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.rhythm.map((r) => (
              <span key={r} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                {r}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">Энэ гаригийн чиглэл тохиргоонд бүртгэгдээгүй.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InstallPrompt />
        <PushToggle compact />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* §8.3 Өнөөдөр (R16) */}
        <Section
          icon={CalendarCheck}
          title="Өнөөдөр"
          className="lg:col-span-2"
          href={`${basePath}/worklists`}
          hrefLabel="Ажлын жагсаалт"
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {slaCount ? <Badge tone="rose">{slaCount} эхний холболт</Badge> : null}
            {overdueCount ? <Badge tone="amber">{overdueCount} хэтэрсэн алхам</Badge> : null}
            {data.quality.fixTasks ? <Badge tone="blue">{data.quality.fixTasks} чанарын засвар</Badge> : null}
          </div>
          <TodayQueue
            items={data.items}
            nowIso={data.nowIso}
            todayIso={data.todayIso}
            slaWarnMin={data.settings.slaWarnMin}
            snoozeHours={data.settings.snoozeHours}
            snoozedCount={data.snoozedCount}
            retryHours={data.retryHours}
            recontactRanges={data.recontactRanges}
            basePath={basePath}
          />
        </Section>

        <div className="space-y-4">
          {/* R15 / UX-15 Ажлын жагсаалтын тоолуур */}
          {worklists ? (
            <Section icon={ListChecks} title="Ажлын жагсаалт" href={`${basePath}/worklists`}>
              <div className="flex flex-wrap gap-1.5">
                {WORKLIST_CODES.filter((c) => !worklists.settings.disabled.includes(c)).map((c) => (
                  <Link
                    key={c}
                    href={`${basePath}/worklists/${c}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      worklists.counts[c] ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line text-muted"
                    )}
                  >
                    {worklistLabel(c, worklists.settings).label}
                    <span className="tabular-nums">{worklists.counts[c]}</span>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {/* §6.23 Өдрийн 4 блок */}
          <Section icon={Activity} title="Өдрийн блок, норм">
            <div className="space-y-2">
              {data.blocks.map((b) => (
                <div key={b.code}>
                  <p className="text-xs font-semibold text-ink">{b.label}</p>
                  {b.metrics.map((m) => (
                    <div key={m.label} className="flex items-center gap-2 text-sm">
                      {m.met ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleDashed className="size-4 text-subtle" />}
                      <span className="text-muted">{m.label}</span>
                      <span className="ml-auto tabular-nums text-ink">
                        {m.value}
                        {m.norm > 0 ? <span className="text-subtle"> / {m.norm}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          {/* §6.23 Өдөр дуусахад */}
          <Section icon={Sunset} title="Өдрийн хаалт" className={data.dayCloseDue ? "ring-2 ring-amber-200" : undefined}>
            <ul className="space-y-1.5">
              {data.dayClose.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                  <span className="min-w-0">
                    <span className="block text-ink">{c.label}</span>
                    <span className="block text-xs text-muted">{c.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* §8.3 Сэжимийн шатлал */}
        <Section icon={Flame} title="Сэжимийн шатлал" href={`${basePath}/leads`}>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(data.funnel.newLeads)} label="Шинэ" href={`${basePath}/leads?status=new`} tone={data.funnel.newLeads ? "amber" : undefined} />
            <Stat value={String(data.funnel.contacted)} label="Холбогдсон" href={`${basePath}/leads?status=active`} />
            <Stat value={String(data.funnel.qualified)} label="Шалгуур хангасан" href={`${basePath}/pipeline`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["a", "b", "c", "d"] as LeadGrade[]).map((g) => (
              <Link
                key={g}
                href={`${basePath}/leads?grade=${g}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs hover:bg-surface-2"
              >
                <Badge tone={LEAD_GRADE_LABEL[g].tone}>{LEAD_GRADE_LABEL[g].label}</Badge>
                <span className="tabular-nums font-medium text-ink">{data.funnel.grades[g]}</span>
              </Link>
            ))}
          </div>
        </Section>

        {/* §8.3 Хэлцлийн урсгал */}
        <Section icon={KanbanSquare} title="Хэлцлийн урсгал" href={`${basePath}/pipeline`} hrefLabel="Канбан">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PIPELINE_BUCKETS.map((b) => (
              <Link
                key={b}
                href={`${basePath}/pipeline`}
                className="rounded-xl border border-line px-2 py-2 text-center hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="block text-lg font-bold tabular-nums text-ink">{data.pipeline[b]}</span>
                <span className="block text-[11px] leading-tight text-muted">{PIPELINE_BUCKET_LABEL[b]}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{data.openOpps} нээлттэй боломж</p>
        </Section>

        {/* §8.3 Үйл ажиллагаа (U7 WeekStrip) */}
        {data.week ? (
          <WeekStrip
            actuals={data.week.actuals}
            targets={data.week.targets}
            planStatus={data.week.planStatus}
            href={`${basePath}/week`}
            codes={ACTIVITY_CODES}
          />
        ) : (
          <Section icon={TrendingUp} title="Үйл ажиллагаа" href={`${basePath}/week`}>
            <p className="text-sm text-muted">Долоо хоногийн мөчлөг идэвхжээгүй байна — зорилттой харьцуулсан тоо удахгүй гарна.</p>
          </Section>
        )}

        {/* §8.3 Хөрвөлт */}
        <Section icon={TrendingUp} title={`Хөрвөлт (сүүлийн ${data.settings.conversionDays} хоног)`}>
          {data.conversionsUnavailable ? (
            <p className="text-sm text-muted">Хөрвөлтийн тооцоо идэвхжээгүй байна.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {CONVERSION_LABELS.map((label, i) => (
                <Stat key={label} value={pctText(data.conversions[i] ?? null)} label={label} />
              ))}
            </div>
          )}
        </Section>

        {/* §8.3 Орлого */}
        <Section icon={Wallet} title="Орлого" href={`${basePath}/pipeline`}>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={shortMNT(data.revenue.closed)} label="Хаагдсан (энэ сар)" tone="green" />
            <Stat value={shortMNT(data.revenue.pending)} label="Хүлээгдэж буй хөлс" />
            <Stat value={shortMNT(data.revenue.weighted)} label="Магадлалаар жинлэсэн" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Хэлцлийн дүнгээр жинлэсэн урсгал: {fmtMNT(data.revenue.dealWeighted)}
            {data.revenue.missingFee ? ` · ${data.revenue.missingFee} боломжид хүлээгдэж буй хөлс бөглөгдөөгүй` : ""}
          </p>
        </Section>

        {/* §8.3 Чанар */}
        <Section icon={Gauge} title="Чанар">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              value={pctText(data.quality.pct)}
              label="CRM-ийн бүрэн байдал"
              tone={data.quality.pct == null ? undefined : data.quality.pct >= 90 ? "green" : "amber"}
            />
            <Stat
              value={pctText(data.quality.overduePct)}
              label="Хугацаа хэтэрсэн хувь"
              href={`${basePath}/worklists/overdue_steps`}
              tone={data.quality.overduePct ? "rose" : "green"}
            />
          </div>
          {data.quality.failing.length ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-ink">Засах шаардлагатай</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {data.quality.failing.map((f) => (
                  <li key={f.label} className="flex justify-between gap-2 text-muted">
                    <span>{f.label}</span>
                    <span className="tabular-nums text-ink">{f.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-2">
            <p className="text-xs font-semibold text-ink">Алдсан шалтгаан</p>
            {data.quality.lostReasons.length ? (
              <ul className="mt-1 space-y-0.5 text-sm">
                {data.quality.lostReasons.map((r) => (
                  <li key={r.label} className="flex justify-between gap-2 text-muted">
                    <span>{r.label}</span>
                    <span className="tabular-nums text-ink">{r.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Энэ хугацаанд алдсан хэлцэл алга.</p>
            )}
          </div>
        </Section>

        {/* Өөрийн шимтгэл (F-471 — зөвхөн өөрийн тооцоо) */}
        <Section icon={Percent} title="Миний шимтгэл" href={`${basePath}/commissions`}>
          {commissionRows.length === 0 ? (
            <p className="text-sm text-muted">Шимтгэлийн тооцоо алга.</p>
          ) : (
            <div className="space-y-1.5">
              {commissionRows.map(([status, v]) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <Badge tone={COMMISSION_STATUS_LABEL[status]?.tone ?? "neutral"}>{COMMISSION_STATUS_LABEL[status]?.label ?? "—"}</Badge>
                  <span className="text-muted">{v.cnt} тооцоо</span>
                  <span className="ml-auto shrink-0 tabular-nums text-ink">{fmtMNT(v.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Trophy} title="Хэрэгсэл">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { href: `${basePath}/worklists/leaderboard`, label: "Тэргүүлэгчид", icon: Trophy },
              { href: `${basePath}/worklists/tracks`, label: "Ажлын цуваа", icon: Repeat },
              { href: `${basePath}/links`, label: "Сонголтын жагсаалт, тайлан", icon: Link2 },
              { href: `${basePath}/links?tab=qr`, label: "Нээлттэй үзлэгийн QR", icon: QrCode },
              ...(data.ctx.roles.some((r) => VITALS_ROLES.includes(r))
                ? [{ href: `${basePath}/worklists/vitals`, label: "Ажлын эрүүл мэнд", icon: Activity }]
                : []),
            ].map((t) => (
              <Link key={t.href} href={t.href} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-ink hover:bg-surface-2">
                <t.icon className="size-4 shrink-0 text-brand-600" /> <span className="min-w-0 truncate">{t.label}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2 hidden text-xs text-subtle md:block">Түргэн хайлт: Ctrl + K</p>
        </Section>
      </div>
    </div>
  );
}

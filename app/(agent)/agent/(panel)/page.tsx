import Link from "next/link";
import { Building2, Users, CalendarDays, Star, Clock, Plus, UserCircle, ArrowRight, AlertCircle } from "lucide-react";

import { getMyAgent, getAgentOverview } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PremierUpgrade } from "@/components/dashboard/PremierUpgrade";
import { LEAD_PIPELINE, LEAD_STAGE_LABEL } from "@/lib/constants";

const STAGE_COLOR: Record<string, string> = {
  new: "bg-sky-500",
  contacted: "bg-indigo-500",
  viewing: "bg-amber-500",
  offer: "bg-orange-500",
  closed: "bg-emerald-500",
};

export default async function AgentOverview() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-ink">Та агент биш байна</h1>
        <p className="mt-2 text-muted">Агентаар ажиллахын тулд оффистойгоо холбогдоно уу.</p>
        <ButtonLink href="/office-signup" className="mt-5">Оффис нээх</ButtonLink>
      </div>
    );
  }

  const isActive = agent.status === "active";
  const { today, stats, byStage, recentLeads, upcoming } = await getAgentOverview(agent.id as string);

  const pipeline = LEAD_PIPELINE.map((key) => ({
    key,
    label: LEAD_STAGE_LABEL[key],
    color: STAGE_COLOR[key],
    count: byStage[key] ?? 0,
  }));
  const pipelineTotal = pipeline.reduce((a, b) => a + b.count, 0) || 1;

  // Профайл гүйцэд байдал
  const checks = [
    !!agent.avatar_url, !!agent.bio, !!agent.specialty,
    (agent.areas as string[] | null)?.length ? true : false,
    !!agent.phone,
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const kpis = [
    { icon: Building2, label: "Идэвхтэй зар", value: stats.active, tone: "text-brand-600" },
    { icon: Users, label: "Шинэ лид", value: stats.newLeads, tone: "text-sky-600", hint: `нийт ${stats.leads}` },
    { icon: CalendarDays, label: "Өнөөдрийн үзлэг", value: stats.todayViewings, tone: "text-amber-600" },
    { icon: Star, label: "Үнэлгээ", value: agent.rating ?? "—", tone: "text-emerald-600", hint: `${agent.reviews_count ?? 0} сэтгэгдэл` },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Толгой + хурдан үйлдэл */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Сайн байна уу, {agent.display_name as string}</h1>
          <p className="text-sm text-muted">
            {(agent.office?.name as string) ?? "Бие даасан агент"} ·{" "}
            {new Date().toLocaleDateString("mn-MN", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            (agent.verified as boolean) ? <Badge tone="green">Баталгаажсан</Badge> : <Badge tone="neutral">Идэвхтэй</Badge>
          ) : <Badge tone="amber">Хүлээгдэж буй</Badge>}
          {isActive && (
            <>
              <ButtonLink href="/agent/listings/new" size="sm"><Plus className="size-4" /> Шинэ зар</ButtonLink>
              <ButtonLink href="/agent/leads" size="sm" variant="outline"><Users className="size-4" /> Лид</ButtonLink>
            </>
          )}
        </div>
      </div>

      {agent.status === "pending" && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Clock className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Таны бүртгэл «{(agent.office?.name as string) ?? "оффис"}»-ийн баталгаажуулалтыг хүлээж байна.</p>
            <p className="mt-0.5 text-amber-700">Батлагдсаны дараа зар оруулах, нийтэд харагдах болно. Профайлаа бэлдэж болно.</p>
          </div>
        </div>
      )}

      <div className="mt-5"><DashboardNav /></div>

      {/* KPI */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((c) => (
          <Card key={c.label}>
            <CardBody className="space-y-1">
              <c.icon className={`size-5 ${c.tone}`} />
              <div className="text-2xl font-extrabold text-ink">{String(c.value)}</div>
              <div className="text-sm text-muted">{c.label}</div>
              {c.hint && <div className="text-xs text-subtle">{c.hint}</div>}
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Профайл гүйцэд байдлын сэрэмж */}
      {isActive && completion < 100 && (
        <Link href="/agent/profile" className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm hover:bg-brand-100">
          <UserCircle className="size-5 shrink-0 text-brand-600" />
          <div className="flex-1">
            <p className="font-semibold text-brand-700">Профайл {completion}% гүйцэд</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-200">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <span className="inline-flex items-center gap-1 font-semibold text-brand-600">Гүйцээх <ArrowRight className="size-4" /></span>
        </Link>
      )}

      {/* Лидийн юүлүүр (pipeline) */}
      <Card className="mt-6">
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ink">Лидийн юүлүүр</h2>
            <Link href="/agent/leads" className="text-sm text-brand-600 hover:underline">CRM →</Link>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {pipeline.map((s) => (
              <div key={s.key} className={s.color} style={{ width: `${(s.count / pipelineTotal) * 100}%` }} title={`${s.label}: ${s.count}`} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {pipeline.map((s) => (
              <div key={s.key}>
                <div className="text-lg font-extrabold text-ink">{s.count}</div>
                <div className="flex items-center justify-center gap-1 text-xs text-muted">
                  <span className={`size-2 rounded-full ${s.color}`} /> {s.label}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {!(agent.premier as boolean) && <div className="mt-6"><PremierUpgrade /></div>}

      {/* Сүүлийн лид + Удахгүй үзлэг */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-ink">Анхаарал шаардсан лид</h2>
              <Link href="/agent/leads" className="text-sm text-brand-600 hover:underline">Бүгд →</Link>
            </div>
            <div className="space-y-2">
              {recentLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{l.name}</div>
                    <div className="truncate text-xs text-muted">{l.listing?.title ?? "—"} · {l.last_touch ?? ""}</div>
                  </div>
                  <Badge tone={l.stage === "new" ? "blue" : l.stage === "offer" ? "amber" : "neutral"}>
                    {LEAD_STAGE_LABEL[l.stage as keyof typeof LEAD_STAGE_LABEL] ?? l.stage}
                  </Badge>
                </div>
              ))}
              {recentLeads.length === 0 && <p className="text-sm text-muted">Лид алга.</p>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 font-bold text-ink">
              <CalendarDays className="size-4" /> Удахгүй болох үзлэг
            </h2>
            <div className="space-y-2">
              {upcoming.map((v) => {
                const isToday = v.scheduled_at?.slice(0, 10) === today;
                return (
                  <div key={v.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      {isToday && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">ӨНӨӨДӨР</span>}
                      <span className="truncate text-sm font-medium text-ink">{v.listing?.title ?? "—"}</span>
                    </div>
                    <div className="shrink-0 text-xs text-muted">
                      {v.scheduled_at ? new Date(v.scheduled_at).toLocaleString("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                  </div>
                );
              })}
              {upcoming.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-muted"><AlertCircle className="size-4" /> Товлосон үзлэг алга.</p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

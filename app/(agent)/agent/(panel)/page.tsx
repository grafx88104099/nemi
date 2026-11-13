import Link from "next/link";
import { Building2, Users, CalendarDays, Star, Clock, Plus, UserCircle, ArrowRight, AlertCircle, Eye } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMyAgent, getAgentOverview } from "@/lib/queries-agent";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { fmtDayWithWeekday, fmtShortDateTime } from "@/lib/format";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PremierUpgrade } from "@/components/dashboard/PremierUpgrade";

const STAFF_HREF = "/agent/crm/staff";
const SHOWINGS_DAYS = 7;
const SHOWINGS_LIMIT = 5;

type UpcomingShowing = {
  id: string;
  deal_id: string;
  property_id: string;
  scheduled_at: string;
  property: { code: string; location_text: string | null } | null;
};

type Crm2Summary = {
  /** null = уншиж чадсангүй. */
  openDeals: number | null;
  showingsCount: number | null;
  showings: UpcomingShowing[];
  openTasks: number | null;
};

/** Агентын Staff ажлын товч (хэрэглэгчийн өөрийн эрхээр, RLS). */
async function getMyCrm2Summary(profileId: string, now: Date): Promise<Crm2Summary> {
  const supabase = await createClient();
  const until = new Date(now.getTime() + SHOWINGS_DAYS * 86_400_000).toISOString();
  const [deals, showings, tasks] = await Promise.all([
    supabase
      .from("crm2_deals")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", profileId)
      .eq("is_open", true),
    supabase
      .from("crm2_activities")
      .select(
        "id, deal_id, property_id, scheduled_at, property:crm2_properties!crm2_activities_property_id_office_id_fkey(code, location_text)",
        { count: "exact" }
      )
      .eq("agent_id", profileId)
      .eq("kind", "showing")
      .eq("showing_status", "scheduled")
      .is("voided_at", null)
      .gte("scheduled_at", now.toISOString())
      .lt("scheduled_at", until)
      .order("scheduled_at")
      .limit(SHOWINGS_LIMIT),
    supabase
      .from("crm2_tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", profileId)
      .eq("status", "open"),
  ]);
  if (deals.error) console.error("getMyCrm2Summary deals:", deals.error.message);
  if (showings.error) console.error("getMyCrm2Summary showings:", showings.error.message);
  if (tasks.error) console.error("getMyCrm2Summary tasks:", tasks.error.message);
  return {
    openDeals: deals.error ? null : (deals.count ?? 0),
    showingsCount: showings.error ? null : (showings.count ?? 0),
    showings: showings.error ? [] : ((showings.data ?? []) as unknown as UpcomingShowing[]),
    openTasks: tasks.error ? null : (tasks.count ?? 0),
  };
}

const countText = (n: number | null | undefined) => (n == null ? "—" : String(n));

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
  const [{ today, stats, upcoming }, crmCtx] = await Promise.all([
    getAgentOverview(agent.id as string),
    getCrmStaffContext(),
  ]);
  // Агентын албан бүртгэл = CRM-ийн Staff (хөрөнгө × харилцагчийн хэлцэл, дуудлага, үзүүлэлт).
  const crm = crmCtx ? await getMyCrm2Summary(crmCtx.profileId, new Date()) : null;

  // Профайл гүйцэд байдал
  const checks = [
    !!agent.avatar_url, !!agent.bio, !!agent.specialty,
    (agent.areas as string[] | null)?.length ? true : false,
    !!agent.phone,
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const kpis = [
    { icon: Building2, label: "Идэвхтэй зар", value: stats.active, tone: "text-brand-600" },
    {
      icon: Users,
      label: "Нээлттэй хэлцэл",
      value: crm ? countText(crm.openDeals) : "—",
      tone: "text-sky-600",
      hint: crm ? "Staff" : "CRM-д бүртгэгдээгүй",
    },
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
            {fmtDayWithWeekday(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            (agent.verified as boolean) ? <Badge tone="green">Баталгаажсан</Badge> : <Badge tone="neutral">Идэвхтэй</Badge>
          ) : <Badge tone="amber">Хүлээгдэж буй</Badge>}
          {isActive && (
            <>
              <ButtonLink href="/agent/listings/new" size="sm"><Plus className="size-4" /> Шинэ зар</ButtonLink>
              <ButtonLink href={STAFF_HREF} size="sm" variant="outline"><Users className="size-4" /> CRM</ButtonLink>
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

      {/* CRM — миний Staff ажил */}
      <Card className="mt-6">
        <CardBody>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold text-ink">CRM — миний Staff ажил</h2>
            <Link href={STAFF_HREF} className="shrink-0 text-sm text-brand-600 hover:underline">Staff →</Link>
          </div>
          {crm ? (
            <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
              {[
                { label: "Нээлттэй хэлцэл", value: crm.openDeals, href: STAFF_HREF },
                { label: `Ойрын ${SHOWINGS_DAYS} хоногийн үзүүлэлт`, value: crm.showingsCount, href: "/agent/crm/calendar" },
                { label: "Нээлттэй ажил", value: crm.openTasks, href: "/agent/crm/my-work" },
              ].map((k) => (
                <Link key={k.label} href={k.href} className="rounded-xl bg-surface-2 px-3 py-3 hover:bg-surface">
                  <div className="text-lg font-extrabold text-ink">{countText(k.value)}</div>
                  <div className="text-xs text-muted">{k.label}</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Та CRM-д бүртгэгдээгүй байна — оффисын админ таныг CRM-ийн ажилтнаар нэмсний дараа Staff-ийн ажил энд харагдана.
            </p>
          )}
        </CardBody>
      </Card>

      {!(agent.premier as boolean) && <div className="mt-6"><PremierUpgrade /></div>}

      {/* Staff-ийн ойрын үзүүлэлт + сайтын үзлэг */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-ink">
                <Eye className="size-4" /> Ойрын Staff үзүүлэлт
              </h2>
              <Link href="/agent/crm/calendar" className="shrink-0 text-sm text-brand-600 hover:underline">Календарь →</Link>
            </div>
            <div className="space-y-2">
              {(crm?.showings ?? []).map((s) => (
                <Link
                  key={s.id}
                  href={`${STAFF_HREF}/${s.property_id}/deals/${s.deal_id}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{s.property?.code ?? "Staff хөрөнгө"}</div>
                    {s.property?.location_text ? (
                      <div className="truncate text-xs text-muted">{s.property.location_text}</div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-muted">{fmtShortDateTime(s.scheduled_at)}</div>
                </Link>
              ))}
              {(crm?.showings ?? []).length === 0 && (
                <p className="text-sm text-muted">
                  {crm ? `Ойрын ${SHOWINGS_DAYS} хоногт товлосон үзүүлэлт алга.` : "CRM-д бүртгэгдсэний дараа харагдана."}
                </p>
              )}
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
                      {v.scheduled_at ? fmtShortDateTime(v.scheduled_at) : "—"}
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

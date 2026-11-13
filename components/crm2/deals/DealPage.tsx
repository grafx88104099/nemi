import { redirect } from "next/navigation";
import {
  Building2,
  CircleSlash,
  Eye,
  History,
  Link2,
  ListTodo,
  MapPin,
  Phone,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AgentChip } from "@/components/crm2/ui/agent-chip";
import { CategoryBadge, DealStageBadge, PropertyStatusBadge, ShowingStatusBadge } from "@/components/crm2/ui/badges";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { Crm2Empty, LoadErrorState, NotFoundState } from "@/components/crm2/ui/empty";
import { HistoryList } from "@/components/crm2/ui/history-list";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { Money } from "@/components/crm2/ui/money";
import { PendingRequests } from "@/components/crm2/staff/card/PendingRequests";
import { buildHistoryLookup, requirementSummary } from "@/components/crm2/staff/card/logic";
import { Breadcrumb, Note, PageContainer, Section } from "@/components/crm2/staff/card/parts";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { DEAL_STAGE_LABEL, isDealOpen } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone, telHref } from "@/lib/crm2/phone";
import { getContactRequirementOptions, getDealPageExtras } from "@/lib/crm2/queries/deal-page";
import { getDeal, type DealActivity, type DealDetail } from "@/lib/crm2/queries/deals";
import { getStaffDirectory, getStaffNameMap } from "@/lib/crm2/queries/lookups";
import { cancelReasonLabel, type Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2DealStage } from "@/lib/crm2/types";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ActivityActions } from "./ActivityActions";
import { DealTasks, type DealTaskView } from "./DealTasks";
import { DealToolbar } from "./DealToolbar";
import { callAgentOptions, dealUiSettings, workStaffOptions, type DealUiSettings, type StaffOption } from "./types";

type ActivitySchedule = { agentOptions: StaffOption[] | null; me: string | null; meName: string | null };

function requestNow(): number {
  return Date.now();
}

/** Хэлцлийн явц (1-р шатанд «Баримт бүрдүүлэх»-ээс хойш идэвхгүй). */
const STEPPER: Crm2DealStage[] = [
  "interested",
  "contacted",
  "showing_scheduled",
  "shown",
  "negotiating",
  "confirmed",
  "documents",
  "awaiting_payment",
  "closed",
];
const STEP_INDEX: Partial<Record<Crm2DealStage, number>> = { reshow: STEPPER.indexOf("shown") };

/**
 * Хэлцлийн хуудас (хөрөнгө × харилцагч): код, шат, хариуцагч, хөрөнгө ба
 * харилцагчийн товч, дуудлага/үзүүлэлтийн он цагийн дараалал, ажил, шат өөрчлөх,
 * цуцлах (дараа нь өөр Staff санал болгох), шилжүүлэх, түүх.
 */
export async function DealPage({ panel, propertyId, dealId }: { panel: Crm2Panel; propertyId: string; dealId: string }) {
  const paths = crm2Paths(panel);
  const [detail, ctx, settings, directory, names] = await Promise.all([
    getDeal(dealId),
    getCrm2Context(),
    getCrm2Settings(),
    getStaffDirectory(),
    getStaffNameMap(),
  ]);

  if (!detail) {
    return (
      <PageContainer>
        <Breadcrumb items={[{ label: "Staff", href: paths.staff() }, { label: "Хэлцэл олдсонгүй" }]} />
        <NotFoundState
          title="Хэлцэл олдсонгүй"
          description="Хэлцэл байхгүй эсвэл харах эрхгүй байна."
          backHref={paths.property(propertyId, "deals")}
          backLabel="Хөрөнгийн хэлцлүүд рүү"
        />
      </PageContainer>
    );
  }
  if (detail.deal.property_id !== propertyId) redirect(paths.deal(detail.deal.property_id, dealId));

  const { deal, property, contact } = detail;
  const [extras, reqOptions] = await Promise.all([
    getDealPageExtras(detail),
    contact && detail.can.edit && isDealOpen(deal.stage) ? getContactRequirementOptions(contact.id) : Promise.resolve([]),
  ]);
  const me = ctx?.profileId ?? null;
  const canWork = !!ctx?.isMember && !!ctx.canWork;
  const staff = workStaffOptions(directory, settings["roles.work"]);
  const agentOptions = callAgentOptions(staff, ctx);
  const meName = me ? (directory.find((s) => s.profile_id === me)?.name ?? null) : null;
  // Шинэ ажил хэлцлийн хариуцагч дээр; өөр хүнд оноох эрхгүй бол өөр дээрээ (RLS-ийн дүрэмтэй ижил).
  const taskAssignee =
    !me || deal.agent_id === me || agentOptions?.some((s) => s.id === deal.agent_id) ? deal.agent_id : me;
  const ui = dealUiSettings(settings);
  const now = requestNow();
  const open = isDealOpen(deal.stage);
  const offerHref = contact ? paths.staff({ offer_for: contact.id, origin: deal.id }) : null;
  const propertyCode = property?.code ?? "Хөрөнгө";
  const hasScheduled = detail.showings.some((s) => s.showing_status === "scheduled" && !s.voided_at);
  const hasShown = detail.showings.some((s) => s.showing_status === "shown" && !s.voided_at);

  const transfer = detail.pendingTransfer;
  const transferPayload =
    transfer && typeof transfer.payload === "object" && transfer.payload && !Array.isArray(transfer.payload)
      ? (transfer.payload as Record<string, unknown>)
      : {};
  const transferFrom = typeof transferPayload.from_agent === "string" ? transferPayload.from_agent : undefined;
  const transferCalls = Array.isArray(transferPayload.calls) ? transferPayload.calls.length : 0;

  const tasks: DealTaskView[] = detail.tasks.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    due_at: t.due_at,
    note: t.note,
    assignee_id: t.assignee_id,
    assigneeName: t.assignee?.full_name ?? names[t.assignee_id] ?? null,
    done_at: t.done_at,
  }));

  const refs: Record<string, string> = {};
  if (detail.requirement) refs[detail.requirement.id] = requirementSummary(detail.requirement, settings["property.category_labels"]);
  if (extras.origin) refs[extras.origin.id] = extras.origin.code;
  const lookup = buildHistoryLookup(settings, names, refs);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Staff", href: paths.staff() },
          { label: propertyCode, href: paths.property(propertyId) },
          { label: detail.contactName || deal.code },
        ]}
      />
      <div className="space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CodeChip code={deal.code} className="px-2 py-1 text-sm" />
            <DealStageBadge stage={deal.stage} />
            {deal.confirmed_at ? <Badge tone="green">Баталгаажсан {fmtDate(deal.confirmed_at)}</Badge> : null}
          </div>
          <h1 className="break-words text-xl font-extrabold text-ink sm:text-2xl">
            <MaskedName name={detail.contactName} visible={detail.contactVisible} className="font-extrabold" />
            <span className="text-muted"> · {propertyCode}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <AgentChip role="Хариуцсан агент" name={detail.agent?.full_name ?? names[deal.agent_id]} avatarUrl={detail.agent?.avatar_url} />
            <span>Нээсэн: {fmtDate(deal.created_at)}</span>
            {deal.last_activity_at ? <span>Сүүлийн үйлдэл: {fmtDateTime(deal.last_activity_at)}</span> : null}
          </div>
        </header>

        {transfer ? (
          <PendingRequests
            me={me}
            requests={[
              {
                id: transfer.id,
                kind: transfer.kind,
                from: null,
                to: null,
                reason: transfer.reason,
                requestedAt: transfer.requested_at,
                requestedBy: transfer.requested_by,
                requestedByName: transfer.requestedByName,
                canDecide: extras.canDecideTransfer,
                summary: `${(transferFrom && names[transferFrom]) || "Одоогийн хариуцагч"} → ${transfer.toAgentName ?? "шинэ хариуцагч"}`,
                calls: transferCalls,
                approvalsHref: paths.approvals(),
              },
            ]}
          />
        ) : null}

        <DealToolbar
          panel={panel}
          propertyId={propertyId}
          propertyCode={propertyCode}
          propertyStatus={property?.status ?? "active"}
          deal={{ id: deal.id, code: deal.code, stage: deal.stage, agent_id: deal.agent_id, isOpen: open }}
          contact={
            contact
              ? {
                  id: contact.id,
                  code: contact.code,
                  full_name: contact.full_name,
                  phones: contact.phones.map((p) => ({ phone: p.phone, is_primary: p.is_primary })),
                }
              : null
          }
          canEdit={detail.can.edit}
          canWork={canWork}
          hasPendingTransfer={!!transfer}
          me={me}
          staff={staff}
          agentOptions={agentOptions}
          settings={ui}
          hasScheduledShowing={hasScheduled}
          hasShownShowing={hasShown}
          offerHref={offerHref}
          requirements={reqOptions.map((r) => ({ value: r.id, label: requirementSummary(r, settings["property.category_labels"]) }))}
          currentRequirementId={deal.requirement_id}
        />

        <StageStepper stage={deal.stage} />

        {deal.stage === "cancelled" ? (
          <CancelledHint detail={detail} settings={settings} names={names} offerHref={offerHref} extras={extras} panel={panel} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <Section
              title={`Дуудлага ба үзүүлэлт (${detail.calls.filter((c) => !c.voided_at).length} · ${detail.showings.filter((s) => !s.voided_at).length})`}
              icon={History}
            >
              <Timeline
                detail={detail}
                me={me}
                canWork={canWork}
                open={open}
                ui={ui}
                offerHref={offerHref}
                schedule={canWork ? { agentOptions, me, meName } : undefined}
              />
            </Section>
          </div>

          <div className="min-w-0 space-y-4">
            <Section title="Хөрөнгө" icon={Building2}>
              {property ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CodeChip code={property.code} href={paths.property(property.id)} />
                    <PropertyStatusBadge status={property.status} />
                    <CategoryBadge category={property.category} labels={settings["property.category_labels"]} />
                  </div>
                  {property.district || property.location_text ? (
                    <p className="flex items-start gap-1 text-muted">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {[property.district, property.location_text].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <p>
                    <Money amount={property.price} currency={property.currency} period={property.price_period} basis={property.price_basis} />
                  </p>
                  <p className="text-xs text-muted">
                    {[property.rooms != null ? `${property.rooms} өрөө` : null, property.area_m2 != null ? `${property.area_m2} м²` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-xs text-muted">Хөрөнгийн төлөв хэлцлийн шатаас тусдаа.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">Хөрөнгийн мэдээлэл харагдахгүй байна.</p>
              )}
            </Section>

            <Section title="Харилцагч" icon={UserRound}>
              {contact ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MaskedName name={contact.full_name} visible href={paths.contact(contact.id)} />
                    <CodeChip code={contact.code} href={paths.contact(contact.id)} />
                  </div>
                  {contact.phones.length ? (
                    <ul className="space-y-1">
                      {contact.phones.map((ph) => {
                        const href = telHref(ph.phone);
                        return (
                          <li key={ph.id} className="flex items-center gap-1.5">
                            <Phone className="size-3.5 shrink-0 text-muted" aria-hidden />
                            {href ? (
                              <a href={href} className="font-medium text-brand-700 tabular-nums hover:underline">
                                {formatPhone(ph.phone)}
                              </a>
                            ) : (
                              <span className="tabular-nums">{ph.phone}</span>
                            )}
                            {ph.label ? <span className="text-xs text-muted">{ph.label}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <p className="text-xs text-muted">Харилцагчийн хариуцагч: {names[contact.responsible_agent_id] ?? "Ажилтан"}</p>
                </div>
              ) : (
                <Note>
                  <MaskedName name={detail.contactName} visible={false} /> — энэ харилцагчийн мэдээллийг харах эрхгүй.
                </Note>
              )}
            </Section>

            <Section title="Шаардлага" icon={Target}>
              {detail.requirement ? (
                <div className="space-y-1 text-sm">
                  <p className="text-ink">{requirementSummary(detail.requirement, settings["property.category_labels"])}</p>
                  <p className="text-xs text-muted">
                    Хувилбар {deal.requirement_version ?? detail.requirement.version}
                    {deal.requirement_version && deal.requirement_version !== detail.requirement.version
                      ? ` (одоо ${detail.requirement.version})`
                      : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">Шаардлага холбоогүй. Дуудлага бүртгэхдээ холбож болно.</p>
              )}
            </Section>

            <Section title="Ажил" icon={ListTodo}>
              <DealTasks
                tasks={tasks}
                me={me}
                canEdit={detail.can.edit}
                now={now}
                dealId={deal.id}
                dealOpen={open}
                assigneeId={taskAssignee}
              />
            </Section>

            {extras.previous || extras.origin || extras.followUps.length ? (
              <Section title="Холбоотой хэлцэл" icon={Link2}>
                <ul className="space-y-1.5 text-sm">
                  {extras.previous ? (
                    <li className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted">Өмнөх (энэ хос):</span>
                      <CodeChip code={extras.previous.code} href={paths.deal(extras.previous.property_id, extras.previous.id)} />
                    </li>
                  ) : null}
                  {extras.origin ? (
                    <li className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted">Эх хэлцэл (цуцлагдсаны дараах санал):</span>
                      <CodeChip code={extras.origin.code} href={paths.deal(extras.origin.property_id, extras.origin.id)} />
                    </li>
                  ) : null}
                  {extras.followUps.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted">{f.relation === "origin" ? "Дараагийн санал:" : "Дараагийн хэлцэл:"}</span>
                      <CodeChip code={f.code} href={paths.deal(f.property_id, f.id)} />
                      {f.property_code ? <CodeChip code={f.property_code} href={paths.property(f.property_id)} /> : null}
                      <DealStageBadge stage={f.stage} />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        </div>

        <Section title="Өөрчлөлтийн түүх" icon={History}>
          {detail.historyError ? (
            <LoadErrorState compact title="Түүхийг ачаалж чадсангүй" retryHref={paths.deal(propertyId, dealId)} />
          ) : (
            <HistoryList rows={detail.history} lookup={lookup} showEntity />
          )}
        </Section>
      </div>
    </PageContainer>
  );
}

function StageStepper({ stage }: { stage: Crm2DealStage }) {
  if (stage === "cancelled") return null;
  const current = STEP_INDEX[stage] ?? STEPPER.indexOf(stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Хэлцлийн явц">
      {STEPPER.map((s, i) => {
        const later = s === "documents" || s === "awaiting_payment" || s === "closed";
        const done = i < current;
        const on = i === current;
        return (
          <li key={s} className="flex shrink-0 items-center gap-1">
            {i > 0 ? <span className={cn("h-px w-3", done || on ? "bg-brand-400" : "bg-line")} aria-hidden /> : null}
            <span
              aria-current={on ? "step" : undefined}
              title={later ? "Хэлцлийн гэрээ, төлбөрийн хэсэгт (дараагийн шат)" : undefined}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                on
                  ? "border-brand-500 bg-brand-500 text-white"
                  : done
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : later
                      ? "border-dashed border-line text-subtle"
                      : "border-line text-muted"
              )}
            >
              {on && stage === "reshow" ? DEAL_STAGE_LABEL.reshow : DEAL_STAGE_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CancelledHint({
  detail,
  settings,
  names,
  offerHref,
  extras,
  panel,
}: {
  detail: DealDetail;
  settings: Crm2Settings;
  names: Record<string, string>;
  offerHref: string | null;
  extras: Awaited<ReturnType<typeof getDealPageExtras>>;
  panel: Crm2Panel;
}) {
  const { deal } = detail;
  const paths = crm2Paths(panel);
  const offers = extras.followUps.filter((f) => f.relation === "origin");
  return (
    <Card className="space-y-3 border-rose-200 bg-rose-50/60 p-4">
      <div className="flex items-start gap-2 text-sm text-rose-900">
        <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">
            Хэлцэл цуцлагдсан: {cancelReasonLabel(settings, deal.cancel_reason_code) || "шалтгаангүй"}
            {deal.cancel_reason ? ` — ${deal.cancel_reason}` : ""}
          </p>
          <p className="text-xs">
            {deal.cancelled_at ? fmtDateTime(deal.cancelled_at) : null}
            {deal.cancelled_by ? ` · ${names[deal.cancelled_by] ?? "Ажилтан"}` : ""}. Зөвхөн энэ хэлцэл цуцлагдсан — хөрөнгийн төлөв, бусад
            харилцагчийн хэлцэл хэвээр.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-1.5 text-sm text-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          Харилцагчид өөр Staff хөрөнгө санал болгох уу? Сонгосон хөрөнгө дээр шинэ хэлцэл энэ хэлцэлтэй холбогдож нээгдэнэ.
        </p>
        {offerHref ? (
          <ButtonLink href={offerHref} size="touch" className="shrink-0">
            Өөр Staff санал болгох
          </ButtonLink>
        ) : null}
      </div>
      {detail.contact ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-sm text-ink">
            <Target className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            Харилцагчийн шаардлага (төсөв, байршил, өрөө, хэмжээ) өөрчлөгдсөн бол санал болгохоос өмнө шинэчилнэ үү.
          </p>
          <ButtonLink href={`${paths.contact(detail.contact.id)}#requirements`} size="touch" variant="outline" className="shrink-0">
            Шаардлага шинэчлэх
          </ButtonLink>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Харилцагч энэ хөрөнгийг дахин сонирхвол хөрөнгийн картаас «Дуудлага бүртгэх» — шинэ хэлцэл энэ хэлцэлтэй холбогдож нээгдэнэ.
      </p>
      {offers.length ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Санал болгосон:
          {offers.map((o) => (
            <CodeChip key={o.id} code={o.code} href={paths.deal(o.property_id, o.id)} />
          ))}
        </p>
      ) : null}
    </Card>
  );
}

function Timeline({
  detail,
  me,
  canWork,
  open,
  ui,
  offerHref,
  schedule,
}: {
  detail: DealDetail;
  me: string | null;
  canWork: boolean;
  open: boolean;
  ui: DealUiSettings;
  offerHref: string | null;
  schedule?: ActivitySchedule;
}) {
  const items = detail.activities;
  if (items.length === 0) {
    return (
      <Crm2Empty
        compact
        icon={Phone}
        title="Дуудлага, үзүүлэлт алга"
        description="Нэг хэлцэлд олон дуудлага, олон үзүүлэлт бүртгэгдэнэ."
      />
    );
  }
  // Он цагийн дугаар (хуучнаас): «Дуудлага 1 → Дуудлага 2».
  const order = new Map<string, number>();
  const counters = { call: 0, showing: 0 };
  for (const a of [...items].reverse()) {
    if (a.voided_at) continue;
    counters[a.kind] += 1;
    order.set(a.id, counters[a.kind]);
  }
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {items.map((a) => (
        <TimelineItem
          key={a.id}
          a={a}
          n={order.get(a.id) ?? null}
          editable={!a.voided_at && (detail.can.edit || (canWork && !!me && (a.agent_id === me || a.created_by === me)))}
          canSetStage={detail.can.edit}
          open={open}
          ui={ui}
          dealCode={detail.deal.code}
          contactName={detail.contactName}
          contactPhone={detail.contact?.phones[0]?.phone ?? null}
          dealAgentId={detail.deal.agent_id}
          offerHref={offerHref}
          schedule={schedule}
        />
      ))}
    </ol>
  );
}

function TimelineItem({
  a,
  n,
  editable,
  canSetStage,
  open,
  ui,
  dealCode,
  contactName,
  contactPhone,
  dealAgentId,
  offerHref,
  schedule,
}: {
  a: DealActivity;
  n: number | null;
  editable: boolean;
  canSetStage: boolean;
  open: boolean;
  ui: DealUiSettings;
  dealCode: string;
  contactName: string;
  contactPhone: string | null;
  dealAgentId: string;
  offerHref: string | null;
  schedule?: ActivitySchedule;
}) {
  const isCall = a.kind === "call";
  const Icon = isCall ? Phone : Eye;
  const scheduled = a.showing_status === "scheduled";
  const when = isCall || !scheduled ? (a.occurred_at ?? a.scheduled_at) : a.scheduled_at;
  return (
    <li className={cn("relative space-y-1", a.voided_at && "opacity-60")}>
      <span
        className={cn(
          "absolute -left-[1.4rem] top-0.5 flex size-5 items-center justify-center rounded-full border bg-surface",
          isCall ? "border-sky-200 text-sky-700" : "border-amber-200 text-amber-700"
        )}
        aria-hidden
      >
        <Icon className="size-3" />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-ink">
          {isCall ? "Дуудлага" : "Үзүүлэлт"}
          {n ? ` ${n}` : ""}
        </span>
        <time dateTime={when ?? undefined} className="text-muted tabular-nums">
          {when ? fmtDateTime(when) : "—"}
        </time>
        {!isCall && a.showing_status ? <ShowingStatusBadge status={a.showing_status} /> : null}
        {a.voided_at ? <Badge tone="rose">Хүчингүй</Badge> : null}
      </div>
      <p className="text-xs text-muted">
        Агент: {a.agent?.full_name ?? "—"}
        {!isCall && a.showing_status === "shown" && a.scheduled_at && a.occurred_at && a.scheduled_at !== a.occurred_at
          ? ` · товлосон ${fmtDateTime(a.scheduled_at)}`
          : ""}
      </p>
      {a.feedback ? (
        <p className="whitespace-pre-line break-words text-sm text-ink">
          <span className="text-xs font-semibold text-muted">Санал хүсэлт: </span>
          {a.feedback}
        </p>
      ) : null}
      {a.result ? (
        <p className="break-words text-sm text-ink">
          <span className="text-xs font-semibold text-muted">Үр дүн: </span>
          {a.result}
        </p>
      ) : null}
      {a.note ? <p className="whitespace-pre-line break-words text-sm text-muted">{a.note}</p> : null}
      {a.voided_at && a.void_reason ? <p className="text-xs text-rose-700">Хүчингүй болгосон: {a.void_reason}</p> : null}
      {editable ? (
        <div className="pt-1">
          <ActivityActions
            row={{
              id: a.id,
              kind: a.kind,
              showing_status: a.showing_status,
              scheduled_at: a.scheduled_at,
              deal_id: a.deal_id,
              deal_code: dealCode,
              contact_name: contactName,
              agent_name: a.agent?.full_name ?? null,
              agent_id: a.agent_id,
              occurred_at: a.occurred_at,
              note: a.note,
              result: a.result,
              feedback: a.feedback,
              contactPhone,
              dealAgentId,
            }}
            canSetStage={canSetStage}
            dealOpen={open}
            requireFeedback={ui.requireFeedback}
            cancelReasons={ui.cancelReasons}
            offerHref={offerHref}
            schedule={schedule}
          />
        </div>
      ) : null}
    </li>
  );
}

/** <title>: «D001 — Хэлцэл». Ачаалах алдааг энд залгина (хуудас өөрөө алдааны төлөв харуулна). */
export async function dealTitle(dealId: string): Promise<string> {
  try {
    const detail = await getDeal(dealId);
    return detail ? `${detail.deal.code} — Хэлцэл` : "Хэлцэл — CRM";
  } catch {
    return "Хэлцэл — CRM";
  }
}

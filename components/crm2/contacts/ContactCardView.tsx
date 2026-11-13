import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Clock, Handshake, History, Link2, ListTodo, PhoneCall } from "lucide-react";

import { fmtDateNum, fmtDateTime } from "@/lib/format";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { taskBucket } from "@/lib/crm2/datetime";
import { requirementTitle, toRequirementData } from "@/lib/crm2/contacts-requirements";
import { listContactRequirementVersions } from "@/lib/crm2/contacts-queries";
import { cancelReasonLabel } from "@/lib/crm2/settings";
import { crm2Paths, type Crm2Panel, type Crm2Paths } from "@/lib/crm2/paths";
import { getContact, type ContactDetail } from "@/lib/crm2/queries/contacts";
import { getStaffNameMap, getWorkStaff } from "@/lib/crm2/queries/lookups";
import type { Crm2ContactDealItem, Crm2Context } from "@/lib/crm2/types";
import type { Crm2Settings } from "@/lib/crm2/settings";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  AgentChip,
  CategoryBadge,
  CodeChip,
  Crm2Empty,
  DealStageBadge,
  HistoryList,
  LoadErrorState,
  NoAccessState,
  PropertyStatusBadge,
  RecordStatusBadge,
} from "@/components/crm2/ui";
import { CancelRequestButton } from "@/components/crm2/approvals/ApprovalActions";
import { TaskList, type TaskRowItem } from "@/components/crm2/mywork/TaskList";

import { ContactActions } from "./ContactActions";
import { PhonesPanel } from "./PhonesPanel";
import { RequirementsPanel, type RequirementItem, type RequirementVersion } from "./RequirementsPanel";

/**
 * Харилцагчийн нэгдсэн карт (S08): нэр, код, тэмдэглэл, хариуцагч; дугаарууд;
 * шаардлага (+өмнөх хувилбар); бүх хөрөнгийн хэлцэл (crm2_contact_deals); эзэн болсон
 * хөрөнгө; нээлттэй ажил; түүх. crm2-д олдохгүй (хуучин crm_contacts-ийн id г.м.) бол
 * жагсаалт руу буцаана.
 */

const WRAP = "mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6";

export async function ContactCardView({ panel, id }: { panel: Crm2Panel; id: string }) {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) {
    return (
      <div className={WRAP}>
        <NoAccessState description="CRM-ийн эрхтэй ажилтанд харагдана." />
      </div>
    );
  }
  const paths = crm2Paths(panel);
  const detail = await getContact(id);
  if (!detail) redirect(paths.contacts({ missing: 1 }));

  const settings = await getCrm2Settings();
  const [names, versionsRaw, workStaff] = await Promise.all([
    getStaffNameMap(),
    listContactRequirementVersions(id),
    getWorkStaff(settings["roles.work"]),
  ]);

  const c = detail.contact;
  const openDeals = detail.deals.filter((d) => d.is_open).length;
  const lists = {
    categoryLabels: settings["property.category_labels"],
    types: settings["property.types"],
    districts: settings["property.districts"],
    features: settings["property.features"],
  };

  const requirements: RequirementItem[] = detail.requirements.map((r) => ({
    id: r.id,
    status: r.status,
    version: r.version,
    updated_at: r.updated_at,
    data: toRequirementData(r),
  }));
  const versions: Record<string, RequirementVersion[]> = Object.fromEntries(
    Object.entries(versionsRaw).map(([rid, vs]) => [
      rid,
      vs.map((v) => ({
        id: v.id,
        version: v.version,
        snapshot: v.snapshot,
        replacedAt: v.replaced_at,
        replacedByName: v.replaced_by ? (names[v.replaced_by] ?? null) : null,
      })),
    ])
  );
  const reqTitle = new Map(requirements.map((r) => [r.id, requirementTitle(r.data, lists)]));

  // Шилжүүлэх: засах эрхтэн — ажлын эрхтэн бүгд (одоогийн хариуцагчаас бусад); эс бөгөөс зөвхөн «над руу» хүсэлт.
  const canTransfer = detail.can.edit || (ctx.canWork && c.responsible_agent_id !== ctx.profileId);
  const transferOptions = detail.can.edit
    ? workStaff
        .filter((s) => s.profile_id !== c.responsible_agent_id)
        .map((s) => ({ value: s.profile_id, label: s.profile_id === ctx.profileId ? `${s.name} (би)` : s.name }))
    : c.responsible_agent_id !== ctx.profileId
      ? [{ value: ctx.profileId, label: "Над руу шилжүүлэх (хүсэлт)" }]
      : [];

  const pending = detail.pendingTransfer;
  // Шинэ дуудлага/тэмдэглэл заавал Staff хөрөнгөтэй: хөрөнгө сонгоод картаас нь бүртгэнэ (харилцагч урьдчилан бөглөгдөнө).
  const pickPropertyHref = ctx.canWork && c.status === "active" ? paths.staff({ offer_for: c.id }) : null;

  return (
    <div className={WRAP}>
      <BackLink href={paths.contacts()} label="Харилцагчид" />

      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <CodeChip code={c.code} />
                {c.status !== "active" ? <RecordStatusBadge status={c.status} /> : null}
                {openDeals > 0 ? <Badge tone="brand">{openDeals} нээлттэй хэлцэл</Badge> : null}
              </div>
              <h1 className="break-words text-xl font-extrabold text-ink sm:text-2xl">{c.full_name}</h1>
              <AgentChip name={c.responsible?.full_name} avatarUrl={c.responsible?.avatar_url} role="Хариуцсан агент" />
              {c.note ? <p className="whitespace-pre-line break-words text-sm text-ink">{c.note}</p> : null}
              <p className="text-xs text-subtle">Бүртгэсэн {fmtDateNum(c.created_at)} · Шинэчилсэн {fmtDateTime(c.updated_at)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start lg:justify-end">
              {pickPropertyHref ? (
                <ButtonLink href={pickPropertyHref} size="md" className="shrink-0">
                  <PhoneCall className="size-4" aria-hidden /> Хөрөнгө сонгож дуудлага бүртгэх
                </ButtonLink>
              ) : null}
              <ContactActions
                contactId={c.id}
                fullName={c.full_name}
                note={c.note}
                status={c.status}
                canEdit={detail.can.edit}
                canTransfer={canTransfer && !pending}
                transferOptions={transferOptions}
                openDeals={openDeals}
              />
            </div>
          </div>

          {pending ? (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Clock className="size-4" aria-hidden />
                  Шилжүүлэх хүсэлт хүлээгдэж байна
                </p>
                <p className="mt-0.5">
                  {c.responsible?.full_name ?? "Одоогийн хариуцагч"} → {pending.toAgentName ?? "шинэ хариуцагч"} ·{" "}
                  {pending.requested_by === ctx.profileId ? "таны хүсэлт" : (pending.requestedByName ?? "ажилтан")} ·{" "}
                  {fmtDateTime(pending.requested_at)}
                </p>
                {pending.reason ? <p className="mt-0.5 break-words text-amber-800">Шалтгаан: {pending.reason}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {pending.requested_by === ctx.profileId ? (
                  <CancelRequestButton requestId={pending.id} label={`${c.code} шилжүүлэх`} />
                ) : null}
                {ctx.canApprove ? (
                  <Link
                    href={paths.approvals()}
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 sm:min-h-9"
                  >
                    Батлах хэсэг
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="min-w-0 space-y-4 lg:col-start-3 lg:row-start-1">
          <PhonesPanel
            contactId={c.id}
            phones={c.phones.map((p) => ({ id: p.id, phone: p.phone, label: p.label, is_primary: p.is_primary }))}
            canEdit={detail.can.edit}
            requirePhone={settings["contact.require_phone"]}
          />
          <OwnedProperties items={detail.ownedProperties} paths={paths} settings={settings} />
        </aside>

        <div className="min-w-0 space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <RequirementsPanel
            contactId={c.id}
            items={requirements}
            versions={versions}
            canEdit={detail.can.editRequirements}
            lists={lists}
          />
          <DealsCard deals={detail.deals} paths={paths} settings={settings} reqTitle={reqTitle} pickPropertyHref={pickPropertyHref} />
          <TasksCard detail={detail} ctx={ctx} paths={paths} />
          <Card>
            <CardBody className="p-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <History className="size-4 text-brand-600" aria-hidden />
                Түүх
              </h2>
              {detail.historyError ? (
                <LoadErrorState compact className="mt-2" title="Түүхийг ачаалж чадсангүй" retryHref={paths.contact(detail.contact.id)} />
              ) : (
              <HistoryList
                rows={detail.history}
                showEntity
                lookup={{
                  names,
                  types: settings["property.types"],
                  features: settings["property.features"],
                  cancelReasons: settings["deal.cancel_reasons"],
                  categoryLabels: settings["property.category_labels"],
                  refs: Object.fromEntries(reqTitle),
                }}
                className="mt-2"
              />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DealsCard({
  deals,
  paths,
  settings,
  reqTitle,
  pickPropertyHref,
}: {
  deals: Crm2ContactDealItem[];
  paths: Crm2Paths;
  settings: Crm2Settings;
  reqTitle: Map<string, string>;
  pickPropertyHref: string | null;
}) {
  return (
    <Card>
      <CardBody className="p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Handshake className="size-4 text-brand-600" aria-hidden />
          Хэлцлүүд
          <span className="text-sm font-normal text-muted">({deals.length})</span>
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Нэг хүн олон хөрөнгөтэй хэлцэлтэй байж болно. Шинэ дуудлага, үзүүлэлт заавал Staff хөрөнгөтэй холбогдоно —{" "}
          {pickPropertyHref ? (
            <>
              <Link href={pickPropertyHref} className="font-medium text-brand-700 hover:underline">
                хөрөнгө сонгоод
              </Link>{" "}
              картаас нь бүртгэнэ (энэ харилцагч урьдчилан бөглөгдөнө).
            </>
          ) : (
            <>
              <Link href={paths.staff()} className="font-medium text-brand-700 hover:underline">
                Staff
              </Link>{" "}
              хөрөнгийн картаас бүртгэнэ.
            </>
          )}
        </p>
        {deals.length === 0 ? (
          <Crm2Empty icon={Handshake} title="Хэлцэл алга" compact className="mt-2" />
        ) : (
          <ul className="mt-3 space-y-2">
            {deals.map((d) => {
              const href = paths.deal(d.property_id, d.deal_id);
              return (
                <li key={d.deal_id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CodeChip code={d.code} href={href} />
                        <DealStageBadge stage={d.stage} />
                        <CodeChip code={d.property_code} href={paths.property(d.property_id)} />
                        <CategoryBadge category={d.property_category} labels={settings["property.category_labels"]} />
                        {d.property_status !== "active" ? <PropertyStatusBadge status={d.property_status} /> : null}
                      </div>
                      {d.property_location ? <p className="truncate text-sm text-ink">{d.property_location}</p> : null}
                      <p className="text-sm text-muted">
                        {d.agent_name} · Дуудлага {d.calls} · Үзүүлэлт {d.showings}
                        {d.showings > 0 ? ` (үзүүлсэн ${d.shown})` : ""}
                        {d.last_activity_at ? ` · Сүүлд ${fmtDateNum(d.last_activity_at)}` : ` · Нээсэн ${fmtDateNum(d.created_at)}`}
                      </p>
                      {d.stage === "cancelled" && d.cancel_reason_code ? (
                        <p className="text-sm text-rose-700">Цуцалсан шалтгаан: {cancelReasonLabel(settings, d.cancel_reason_code)}</p>
                      ) : null}
                      {d.requirement_id ? (
                        <p className="text-xs text-muted">
                          Шаардлага: {reqTitle.get(d.requirement_id) ?? "холбогдсон"}
                          {d.requirement_version ? ` (${d.requirement_version}-р хувилбар)` : ""}
                        </p>
                      ) : null}
                      {d.origin_deal_id || d.previous_deal_id ? (
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Link2 className="size-3.5" aria-hidden />
                          {d.origin_deal_id ? "Цуцлагдсан хэлцлийн дараах санал" : "Энэ хөрөнгөөр өмнө хэлцэл байсан"}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      href={href}
                      aria-label={`${d.code} хэлцэл нээх`}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 sm:size-9"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function OwnedProperties({
  items,
  paths,
  settings,
}: {
  items: ContactDetail["ownedProperties"];
  paths: Crm2Paths;
  settings: Crm2Settings;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardBody className="p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Building2 className="size-4 text-brand-600" aria-hidden />
          Эзэмшдэг хөрөнгө
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CodeChip code={p.code} href={paths.property(p.id)} />
                  <CategoryBadge category={p.category} labels={settings["property.category_labels"]} />
                  <PropertyStatusBadge status={p.status} />
                </div>
                {p.district || p.location_text ? (
                  <p className="mt-0.5 truncate text-sm text-muted">{[p.district, p.location_text].filter(Boolean).join(", ")}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function TasksCard({ detail, ctx, paths }: { detail: ContactDetail; ctx: Crm2Context; paths: Crm2Paths }) {
  const dealById = new Map(detail.deals.map((d) => [d.deal_id, d]));
  const rows: TaskRowItem[] = detail.openTasks.map((t) => {
    const deal = t.deal_id ? dealById.get(t.deal_id) : undefined;
    return {
      id: t.id,
      kind: t.kind,
      dueAt: t.due_at,
      note: t.note,
      bucket: taskBucket(t.due_at),
      assigneeName: t.assignee?.full_name ?? null,
      propertyId: t.property_id,
      propertyCode: deal?.property_code ?? null,
      dealId: t.deal_id,
      dealCode: deal?.code ?? null,
      contactId: null,
      canComplete: t.assignee_id === ctx.profileId || ctx.isManager,
    };
  });
  return (
    <Card>
      <CardBody className="p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <ListTodo className="size-4 text-brand-600" aria-hidden />
          Нээлттэй ажил
          <span className="text-sm font-normal text-muted">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Энэ харилцагчтай холбоотой нээлттэй ажил алга.</p>
        ) : (
          <TaskList items={rows} paths={paths} showAssignee className="mt-3" />
        )}
      </CardBody>
    </Card>
  );
}

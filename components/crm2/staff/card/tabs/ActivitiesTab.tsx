import { CalendarClock, Eye, Info, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Crm2Empty, LoadErrorState } from "@/components/crm2/ui/empty";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { ShowingStatusBadge } from "@/components/crm2/ui/badges";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { ActivityActions } from "@/components/crm2/deals/ActivityActions";
import type { DealUiSettings, StaffOption } from "@/components/crm2/deals/types";
import { fmtDateTime } from "@/lib/format";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getCardActivities, getSchedulableDeals } from "@/lib/crm2/queries/card-tabs";
import type { Crm2ActivityKind, Crm2PropertyActivityItem } from "@/lib/crm2/types";
import { cn } from "@/lib/utils";

import { ScheduleShowingButton } from "./ScheduleShowingButton";
import { activityEditable } from "../logic";
import { CursorPager, Note } from "../parts";

/**
 * «Дуудлага» / «Үзүүлэлт» таб (crm2_property_activities): бодит (эсвэл товлосон)
 * цагаар шинэ нь эхэнд, харилцагчийн нэр эрхгүй бол далд. Товлосон үзүүлэлтийг
 * гүйцэтгэгч/хэлцлийн засварлагч «Үр дүн бүртгэх»-ээр л «Үзүүлсэн» болгоно.
 */
export async function ActivitiesTab({
  panel,
  propertyId,
  kind,
  before,
  canWork,
  agentOptions,
  meName,
  settings,
}: {
  panel: Crm2Panel;
  propertyId: string;
  kind: Crm2ActivityKind;
  before: string | null;
  canWork: boolean;
  /** Үзүүлэлтийн гүйцэтгэгч сонгогч (менежер/ахлагч); бусдад null. */
  agentOptions: StaffOption[] | null;
  meName: string | null;
  settings: DealUiSettings;
}) {
  const tab = kind === "call" ? "calls" : "showings";
  const paths = crm2Paths(panel);
  const [page, deals] = await Promise.all([
    getCardActivities(propertyId, kind, before),
    kind === "showing" && canWork ? getSchedulableDeals(propertyId) : Promise.resolve([]),
  ]);
  const { rows, nextBefore, editableDeals, openDeals, me } = page;
  const scheduledCount = rows.filter((r) => r.showing_status === "scheduled" && !r.voided_at).length;
  // «Дахин үзэх»-ийн дараах товлолтод: хэлцэл → харилцагчийн утас, хариуцагч.
  const dealInfo = new Map(deals.map((d) => [d.deal_id, { phone: d.contact_phone, agentId: d.agent_id }]));

  return (
    <div className="space-y-3">
      {kind === "showing" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Note icon={Info} className="sm:max-w-2xl">
            Товлосон үзүүлэлт цаг нь болоход автоматаар «Үзүүлсэн» болохгүй. Бодитоор үзүүлсний дараа «Үр дүн бүртгэх»-ээр бодит
            цаг, харилцагчийн санал хүсэлтийг оруулна.
          </Note>
          {canWork && deals.length ? (
            <div className="shrink-0">
              <ScheduleShowingButton
                deals={deals.map((d) => ({
                  id: d.deal_id,
                  code: d.code,
                  stage: d.stage,
                  contactName: d.contact_name,
                  contactPhone: d.contact_phone,
                  agentName: d.agent_name,
                  agentId: d.agent_id,
                }))}
                agentOptions={agentOptions}
                me={me}
                meName={meName}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <Note icon={Info}>
          Дуудлага бүр хөрөнгө–харилцагчийн хэлцэлд бүртгэгдэнэ; давтан дуудлага шинэ хэлцэл үүсгэхгүй. Дуудлага нь үзүүлсэн гэсэн үг биш.
        </Note>
      )}

      {page.error ? (
        <LoadErrorState retryHref={paths.property(propertyId, tab, before ? { before } : undefined)} />
      ) : rows.length === 0 ? (
        <Crm2Empty
          icon={kind === "call" ? Phone : Eye}
          title={before ? "Цааш бичлэг алга" : kind === "call" ? "Дуудлага бүртгэгдээгүй" : "Үзүүлэлт бүртгэгдээгүй"}
          description={
            before
              ? undefined
              : kind === "call"
                ? "«Дуудлага бүртгэх»-ээр харилцагчийн дугаараар хайж эхлүүлнэ."
                : "Дуудлагын дараа үзүүлэх цагаа товлоно."
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {kind === "showing" && scheduledCount ? (
            <p className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-800">
              <CalendarClock className="size-3.5" aria-hidden /> Энэ хуудсанд товлосон {scheduledCount} үзүүлэлт байна
            </p>
          ) : null}
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <ActivityRow
                key={r.activity_id}
                r={r}
                panel={panel}
                propertyId={propertyId}
                editable={activityEditable(r, me, editableDeals)}
                canSetStage={!!editableDeals[r.deal_id]}
                // crm2_property_deals-д харагдаагүй хэлцлийг нээлттэй гэж үзнэ (DB эцэслэн шалгана).
                dealOpen={openDeals[r.deal_id] ?? true}
                schedule={canWork ? { agentOptions, me, meName } : undefined}
                settings={settings}
                offerHref={r.contact_id ? paths.staff({ offer_for: r.contact_id, origin: r.deal_id }) : null}
                dealInfo={dealInfo.get(r.deal_id) ?? null}
              />
            ))}
          </ul>
        </Card>
      )}

      <CursorPager
        firstHref={before ? paths.property(propertyId, tab) : null}
        nextHref={nextBefore ? paths.property(propertyId, tab, { before: nextBefore }) : null}
      />
    </div>
  );
}

function ActivityRow({
  r,
  panel,
  propertyId,
  editable,
  canSetStage,
  dealOpen,
  schedule,
  settings,
  offerHref,
  dealInfo,
}: {
  r: Crm2PropertyActivityItem;
  panel: Crm2Panel;
  propertyId: string;
  editable: boolean;
  canSetStage: boolean;
  dealOpen: boolean;
  schedule?: { agentOptions: StaffOption[] | null; me: string | null; meName: string | null };
  settings: DealUiSettings;
  offerHref: string | null;
  dealInfo: { phone: string | null; agentId: string | null } | null;
}) {
  const paths = crm2Paths(panel);
  const isCall = r.kind === "call";
  const scheduled = r.showing_status === "scheduled";
  const when = isCall || !scheduled ? (r.occurred_at ?? r.scheduled_at) : r.scheduled_at;
  const Icon = isCall ? Phone : Eye;
  const voided = !!r.voided_at;

  return (
    <li className={cn("space-y-1.5 px-4 py-3", voided && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <time dateTime={when ?? undefined} className="font-medium text-ink tabular-nums">
          {when ? fmtDateTime(when) : "—"}
        </time>
        {!isCall && r.showing_status ? <ShowingStatusBadge status={r.showing_status} /> : null}
        {voided ? <Badge tone="rose">Хүчингүй</Badge> : null}
        <MaskedName
          name={r.contact_name}
          visible={r.contact_visible}
          href={r.contact_visible && r.contact_id ? paths.contact(r.contact_id) : null}
        />
        <CodeChip code={r.deal_code} href={paths.deal(propertyId, r.deal_id)} />
      </div>
      <p className="text-xs text-muted">
        Агент: {r.agent_name || "—"}
        {!isCall && r.showing_status === "shown" && r.scheduled_at && r.occurred_at && r.scheduled_at !== r.occurred_at
          ? ` · товлосон ${fmtDateTime(r.scheduled_at)}`
          : ""}
      </p>
      {r.feedback ? (
        <p className="whitespace-pre-line break-words text-sm text-ink">
          <span className="text-xs font-semibold text-muted">Санал хүсэлт: </span>
          {r.feedback}
        </p>
      ) : null}
      {r.result ? (
        <p className="break-words text-sm text-ink">
          <span className="text-xs font-semibold text-muted">Үр дүн: </span>
          {r.result}
        </p>
      ) : null}
      {r.note ? <p className="whitespace-pre-line break-words text-sm text-muted">{r.note}</p> : null}
      {editable ? (
        <ActivityActions
          row={{
            id: r.activity_id,
            kind: r.kind,
            showing_status: r.showing_status,
            scheduled_at: r.scheduled_at,
            deal_id: r.deal_id,
            deal_code: r.deal_code,
            contact_name: r.contact_name,
            agent_name: r.agent_name,
            agent_id: r.agent_id,
            occurred_at: r.occurred_at,
            note: r.note,
            result: r.result,
            feedback: r.feedback,
            contactPhone: dealInfo?.phone ?? null,
            dealAgentId: dealInfo?.agentId ?? null,
          }}
          canSetStage={canSetStage}
          dealOpen={dealOpen}
          schedule={schedule}
          requireFeedback={settings.requireFeedback}
          cancelReasons={settings.cancelReasons}
          offerHref={offerHref}
        />
      ) : null}
    </li>
  );
}

import { NotFoundState } from "@/components/crm2/ui/empty";
import { brokerageResponsibleOptions, callAgentOptions, dealUiSettings, workStaffOptions } from "@/components/crm2/deals/types";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { PROPERTY_TAB_LABEL, crm2Paths, isPropertyTab, type Crm2Panel, type PropertyTab } from "@/lib/crm2/paths";
import { getOfferContext } from "@/lib/crm2/queries/card-tabs";
import { buildCardChecklist } from "@/lib/crm2/queries/checklist";
import { getStaffDirectory, getStaffNameMap } from "@/lib/crm2/queries/lookups";
import { getProperty } from "@/lib/crm2/queries/properties";
import { fileLimits } from "@/lib/crm2/settings";

import { CardHeader, CardTabsNav } from "./CardHeader";
import { CardToolbar } from "./CardToolbar";
import { PendingRequests, type PendingRequestView } from "./PendingRequests";
import { CardSheetHost } from "./sheets/CardSheetHost";
import { OwnerPendingBanner } from "./sheets/OwnerPendingBanner";
import { firstParam, parseOfferParams } from "./logic";
import { Breadcrumb, PageContainer } from "./parts";
import { ActivitiesTab } from "./tabs/ActivitiesTab";
import { AgreementTab } from "./tabs/AgreementTab";
import { DealsTab } from "./tabs/DealsTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { InfoTab } from "./tabs/InfoTab";
import { PublishTab } from "./tabs/PublishTab";

type SearchParams = Record<string, string | string[] | undefined>;

/** Серверийн одоогийн цаг (хоног тооцоонд; render-ээс тусад нь). */
function requestNow(): number {
  return Date.now();
}

/**
 * S03 — Staff хөрөнгийн карт (агент, оффис панелд ижил). Табууд ?tab=-аар:
 * Үндсэн мэдээлэл ¦ Зуучлалын гэрээ ¦ Зар ¦ Дуудлага ¦ Үзүүлэлт ¦ Хэлцлүүд ¦ Өөрчлөлтийн түүх.
 * Гарчгийн доор «Дараагийн алхам»; засварын доод цонхнууд ?sheet=next|checklist|contract|owner|<цонх>
 * (&field=) — CardSheetHost. Хүлээгдэж буй эзэн (owner_pending) хамгийн дээр.
 * Бүх үйлдэл хөрөнгийн id-тай; эрхийг DB (RLS, RPC) эцэслэн шалгана.
 */
export async function PropertyCardPage({
  panel,
  propertyId,
  searchParams,
}: {
  panel: Crm2Panel;
  propertyId: string;
  searchParams: SearchParams;
}) {
  const paths = crm2Paths(panel);
  const tabParam = firstParam(searchParams.tab);
  const tab: PropertyTab = isPropertyTab(tabParam) ? tabParam : "info";
  const before = firstParam(searchParams.before);

  const [detail, ctx, settings, directory, names] = await Promise.all([
    getProperty(propertyId),
    getCrm2Context(),
    getCrm2Settings(),
    getStaffDirectory(),
    getStaffNameMap(),
  ]);

  if (!detail) {
    return (
      <PageContainer>
        <Breadcrumb items={[{ label: "Staff", href: paths.staff() }, { label: "Олдсонгүй" }]} />
        <NotFoundState
          title="Хөрөнгө олдсонгүй"
          description="Устгагдсан, ноорог (харах эрхгүй) эсвэл буруу холбоос байна."
          backHref={paths.staff()}
          backLabel="Staff руу буцах"
        />
      </PageContainer>
    );
  }

  const p = detail.property;
  const offerParams = parseOfferParams(searchParams);
  const offer = offerParams.contactId ? await getOfferContext(p.id, offerParams.contactId, offerParams.originDealId) : null;
  const staff = workStaffOptions(directory, settings["roles.work"]);
  const ui = dealUiSettings(settings);
  const me = ctx?.profileId ?? null;
  const meName = me ? (directory.find((s) => s.profile_id === me)?.name ?? null) : null;
  const agentOptions = callAgentOptions(staff, ctx);
  // Гэрээний хариуцагч: менежер — бүгд, ахлагч — баг, бусад — өөрөө; + хөрөнгийн 3 үүргийн агент.
  const brokerageStaff = brokerageResponsibleOptions(staff, ctx, [p.listing_agent_id, p.contract_agent_id, p.photo_agent_id]);
  const canWork = !!ctx?.isMember && !!ctx.canWork;
  const now = requestNow();
  const { checklist, next } = buildCardChecklist(detail, settings);
  // Үүргийн агентыг AgentPicker-ээр зөвхөн ажлын эрхтэй (roles.work) ажилтнаас сонгоно.
  const workRoles = new Set(settings["roles.work"]);
  const pickerStaff = directory.filter((s) => (s.roles ?? []).some((r) => workRoles.has(r)));
  const canReassign = !!ctx && (ctx.isManager || ctx.isTeamLead);
  const ownerPending = detail.can.viewPrivate ? (detail.private?.owner_pending ?? null) : null;

  const requests: PendingRequestView[] = detail.pendingRequests.map((r) => {
    const payload = r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {};
    const isTransfer = r.kind === "deal_transfer" || r.kind === "contact_transfer";
    const fromAgent = typeof payload.from_agent === "string" ? payload.from_agent : null;
    const toAgent = typeof payload.to_agent === "string" ? payload.to_agent : null;
    const fromTo = `${(fromAgent && names[fromAgent]) || "Одоогийн хариуцагч"} → ${(toAgent && names[toAgent]) || "шинэ хариуцагч"}`;
    return {
      id: r.id,
      kind: r.kind,
      from: typeof payload.from === "string" ? payload.from : null,
      to: typeof payload.to === "string" ? payload.to : null,
      reason: r.reason,
      requestedAt: r.requested_at,
      requestedBy: r.requested_by,
      requestedByName: r.requestedByName,
      canDecide: r.canDecide,
      ...(isTransfer
        ? {
            summary: r.dealCode ? `${r.dealCode} · ${fromTo}` : fromTo,
            calls: Array.isArray(payload.calls) ? payload.calls.length : 0,
            approvalsHref: paths.approvals(),
          }
        : {}),
    };
  });

  const crumbs = [
    // Санал болгох горимд жагсаалт руу буцахад горим хадгалагдана.
    { label: "Staff", href: paths.staff(offer ? { offer_for: offer.contact.id, origin: offerParams.originDealId } : undefined) },
    { label: p.code, href: tab === "info" ? undefined : paths.property(p.id) },
    ...(tab === "info" ? [] : [{ label: PROPERTY_TAB_LABEL[tab] }]),
  ];

  return (
    <PageContainer>
      <Breadcrumb items={crumbs} />
      <div className="space-y-4">
        {ownerPending ? <OwnerPendingBanner pending={ownerPending} canResolve={detail.can.edit} /> : null}
        <CardHeader detail={detail} settings={settings} next={next} percent={checklist.percent} />
        <CardToolbar
          panel={panel}
          propertyId={p.id}
          propertyCode={p.code}
          status={p.status}
          canEdit={detail.can.edit}
          canApproveStatus={detail.can.approveStatus}
          canWork={canWork}
          me={me}
          staff={staff}
          agentOptions={agentOptions}
          settings={ui}
          offer={offer ? { contact: offer.contact, origin: offer.origin ? { id: offer.origin.id, code: offer.origin.code } : null } : null}
          autoCall={!offer && firstParam(searchParams.call) === "1"}
        />
        <PendingRequests requests={requests} me={me} />
        <CardTabsNav panel={panel} propertyId={p.id} active={tab} />
        <div className="min-w-0">
          {tab === "info" ? <InfoTab detail={detail} settings={settings} panel={panel} now={now} checklist={checklist} next={next} /> : null}
          {tab === "agreement" ? (
            <AgreementTab detail={detail} settings={settings} panel={panel} staff={brokerageStaff} names={names} now={now} />
          ) : null}
          {tab === "publish" ? <PublishTab panel={panel} propertyId={p.id} /> : null}
          {tab === "calls" || tab === "showings" ? (
            <ActivitiesTab
              panel={panel}
              propertyId={p.id}
              kind={tab === "calls" ? "call" : "showing"}
              before={before}
              canWork={canWork}
              agentOptions={agentOptions}
              meName={meName}
              settings={ui}
            />
          ) : null}
          {tab === "deals" ? <DealsTab panel={panel} propertyId={p.id} settings={settings} /> : null}
          {tab === "history" ? (
            <HistoryTab
              panel={panel}
              detail={detail}
              settings={settings}
              names={names}
              beforeId={before && /^\d+$/.test(before) ? Number(before) : null}
            />
          ) : null}
        </div>
      </div>
      <CardSheetHost
        panel={panel}
        tab={tab}
        property={p}
        priv={detail.private}
        canViewPrivate={detail.can.viewPrivate}
        canEdit={detail.can.edit}
        media={detail.media}
        limits={fileLimits(settings)}
        imagesRequired={settings["property.activation_required"].includes("images")}
        checklist={checklist}
        next={next}
        settings={settings}
        staff={pickerStaff}
        me={me}
        teamIds={ctx?.teamId ? [ctx.teamId] : []}
        canReassign={canReassign}
        contract={
          detail.brokerage.find((c) => c.status === "draft") ??
          detail.brokerage.find((c) => c.status === "pending") ??
          detail.brokerage.find((c) => c.status === "active") ??
          null
        }
      />
    </PageContainer>
  );
}

/** <title>: «P001 — Staff». Ачаалах алдааг энд залгина (хуудас өөрөө алдааны төлөв харуулна). */
export async function propertyCardTitle(propertyId: string): Promise<string> {
  try {
    const detail = await getProperty(propertyId);
    return detail ? `${detail.property.code} — Staff` : "Хөрөнгө — Staff";
  } catch {
    return "Хөрөнгө — Staff";
  }
}

import { settingOptions, type Crm2Settings } from "@/lib/crm2/settings";
import { isoToUbInput } from "@/lib/crm2/datetime";
import type { Crm2Context, Crm2StaffMember } from "@/lib/crm2/types";

/**
 * Хэлцэл, дуудлага, үзүүлэлтийн клиент компонентуудын хуваалцах төрөл ба
 * агент сонгогчийн жагсаалт угсрах цэвэр функц (серверээс prop-оор дамжуулна).
 */

export type StaffOption = { id: string; name: string; teamId: string | null };

/** Ажлын эрхтэй (roles.work) ажилтан — нэрээр. */
export function workStaffOptions(directory: Crm2StaffMember[], workRoles: string[]): StaffOption[] {
  const allowed = new Set(workRoles);
  return directory
    .filter((s) => (s.roles ?? []).some((r) => allowed.has(r)))
    .map((s) => ({ id: s.profile_id, name: s.name, teamId: s.team_id }));
}

/**
 * Дуудлагын «гүйцэтгэсэн агент»: өөр хүнийг сонгох нь менежер (бүгд) эсвэл
 * ахлагч (өөрийн багийн гишүүд). Бусдад сонгогч харуулахгүй (null).
 */
export function callAgentOptions(staff: StaffOption[], ctx: Pick<Crm2Context, "profileId" | "isManager" | "isTeamLead" | "teamId"> | null): StaffOption[] | null {
  if (!ctx) return null;
  if (ctx.isManager) return staff;
  if (ctx.isTeamLead && ctx.teamId) {
    const list = staff.filter((s) => s.teamId === ctx.teamId || s.id === ctx.profileId);
    return list.length > 1 ? list : null;
  }
  return null;
}

/**
 * Хэлцлийн шинэ ажлын хариуцагч: хэлцлийн агент (өөрөө эсвэл сонгогчид байгаа —
 * ахлагч/менежер өөр хүнд оноож болно); эс бөгөөс өөрөө. RLS-ийн дүрэм, crm2_log_call-тай ижил.
 */
export function dealTaskAssignee(
  dealAgentId: string | null | undefined,
  me: string | null,
  agentOptions: Pick<StaffOption, "id">[] | null
): string | null {
  if (!dealAgentId) return me;
  if (!me || dealAgentId === me || agentOptions?.some((s) => s.id === dealAgentId)) return dealAgentId;
  return me;
}

/** Клиентэд дамжуулах тохиргооны хэсэг (бүх тохиргоог биш). */
export type DealUiSettings = {
  foreignDeal: "deny" | "allow";
  requireFeedback: boolean;
  /** Цуцлах шалтгаан (түлхүүр → нэр). */
  cancelReasons: { value: string; label: string }[];
  /** Шинэ хэлцэл нээж болох хөрөнгийн төлөв. */
  openPropertyStatuses: string[];
  categoryLabels: Partial<Record<string, string>>;
  editWindowHours: number;
};

export function dealUiSettings(s: Crm2Settings): DealUiSettings {
  return {
    foreignDeal: s["contact.foreign_deal"],
    requireFeedback: s["showing.require_feedback"],
    cancelReasons: settingOptions(s["deal.cancel_reasons"]),
    openPropertyStatuses: s["deal.open_property_statuses"],
    categoryLabels: s["property.category_labels"],
    editWindowHours: s["activity.edit_window_hours"],
  };
}

// ── Зуучлалын гэрээний хариуцагч сонгогч ───────────────────────────────────

export type BrokerageResponsibleCtx = Pick<Crm2Context, "profileId" | "isManager" | "isTeamLead" | "teamId"> | null;
type CtxLite = BrokerageResponsibleCtx;

/**
 * Гэрээний хариуцагчийг хэн болгож болох (хариуцагч нь хөрөнгийн нууц мэдээлэл, эзний
 * харилцагч, гэрээний файлыг харах эрх авдаг): менежер — хэнийг ч; ахлагч — өөрийн
 * багийн гишүүд; бусад — өөрөө. Бүгдэд хөрөнгийн 3 үүргийн агент нэмэгдэнэ.
 * DB-ийн дүрэм (crm2-needs-sql.md «finish», SEC1) эцэслэн шалгана.
 */
export function brokerageResponsibleAllowed(ctx: CtxLite, propAgents: (string | null | undefined)[]): (s: { id: string; teamId: string | null }) => boolean {
  if (ctx?.isManager) return () => true;
  const fixed = new Set(propAgents.filter((x): x is string => !!x));
  if (ctx?.profileId) fixed.add(ctx.profileId);
  const team = ctx?.isTeamLead && ctx.teamId ? ctx.teamId : null;
  return (s) => fixed.has(s.id) || (!!team && s.teamId === team);
}

export function brokerageResponsibleOptions(staff: StaffOption[], ctx: CtxLite, propAgents: (string | null | undefined)[]): StaffOption[] {
  return staff.filter(brokerageResponsibleAllowed(ctx, propAgents));
}

// ── Дуудлага/үзүүлэлт засах ────────────────────────────────────────────────

export type ActivityEditKind = { kind: "call" | "showing"; showing_status: "scheduled" | "shown" | "cancelled" | "no_show" | null };

/** Засах цонхонд ямар талбар харагдах (цагийг товлосон үзүүлэлтэд «Цаг өөрчлөх»-өөр). */
export function activityEditFields(a: ActivityEditKind): { occurredAt: boolean; feedback: boolean; result: boolean; note: boolean } {
  if (a.kind === "call") return { occurredAt: true, feedback: false, result: true, note: true };
  if (a.showing_status === "scheduled") return { occurredAt: false, feedback: false, result: false, note: true };
  if (a.showing_status === "shown") return { occurredAt: true, feedback: true, result: true, note: true };
  return { occurredAt: false, feedback: false, result: true, note: true };
}

export type ActivityEditInitial = {
  occurred_at: string | null;
  note: string | null;
  result: string | null;
  feedback: string | null;
  agent_id: string | null;
};

/** undefined — талбар харагдаагүй (өөрчлөхгүй). occurredAt нь УБ «YYYY-MM-DDTHH:mm». */
export type ActivityEditValues = {
  occurredAt?: string;
  note?: string;
  result?: string;
  feedback?: string;
  agentId?: string;
};

export type ActivityEditPatch = {
  occurred_at?: string;
  note?: string | null;
  result?: string | null;
  feedback?: string | null;
  agent_id?: string;
};

const editText = (v: string | null | undefined) => (v ?? "").trim() || null;

/** Зөвхөн өөрчлөгдсөн талбарууд (хоосолсон текст → null). Хоосон объект = өөрчлөлтгүй. */
export function activityEditPatch(initial: ActivityEditInitial, values: ActivityEditValues): ActivityEditPatch {
  const patch: ActivityEditPatch = {};
  for (const k of ["note", "result", "feedback"] as const) {
    const v = values[k];
    if (v !== undefined && editText(v) !== editText(initial[k])) patch[k] = editText(v);
  }
  if (values.occurredAt && values.occurredAt !== isoToUbInput(initial.occurred_at)) patch.occurred_at = values.occurredAt;
  if (values.agentId && values.agentId !== initial.agent_id) patch.agent_id = values.agentId;
  return patch;
}

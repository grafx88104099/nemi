/**
 * Ажлын жагсаалт (R15) ба ажлын эрүүл мэндийн самбар (R20) — цэвэр логик.
 *
 * Оффисын бэлэн жагсаалт: сэжим бүрийн агшин зургаас аль жагсаалтад
 * орохыг тодорхойлно. Ахлагчийн самбар нь ижил өгөгдлийг эзэмшигчээр
 * тоолно (нэг эх — R20). Босго бүр тохиргооноос (crm_settings 'worklists').
 */

import type { CrmRole } from "@/lib/constants-crm";

/** Ажлын эрүүл мэндийн самбар харах дүр (R20). */
export const VITALS_ROLES: CrmRole[] = ["team_lead", "sales_director", "ops_qc", "ceo", "sysadmin"];

export const WORKLIST_CODES = [
  "new_uncontacted",
  "hot_stale",
  "few_attempts",
  "showing_no_feedback",
  "overdue_steps",
  "warm_stale",
] as const;
export type WorklistCode = (typeof WORKLIST_CODES)[number];

export function isWorklistCode(v: unknown): v is WorklistCode {
  return typeof v === "string" && (WORKLIST_CODES as readonly string[]).includes(v);
}

export type WorklistSettings = {
  hotStaleDays: number;
  warmStaleDays: number;
  fewAttemptsMax: number;
  fewAttemptsWindowDays: number;
  showingNoFeedbackHours: number;
  vitalsWarn: number;
  vitalsAlert: number;
  disabled: WorklistCode[];
};

export const DEFAULT_WORKLIST_SETTINGS: WorklistSettings = {
  hotStaleDays: 3,
  warmStaleDays: 7,
  fewAttemptsMax: 3,
  fewAttemptsWindowDays: 14,
  showingNoFeedbackHours: 24,
  vitalsWarn: 3,
  vitalsAlert: 6,
  disabled: [],
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

export function normalizeWorklistSettings(raw: unknown): WorklistSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WORKLIST_SETTINGS;
  const warn = num(r.vitals_warn, d.vitalsWarn, 1, 1000);
  const alert = num(r.vitals_alert, d.vitalsAlert, 1, 1000);
  return {
    hotStaleDays: num(r.hot_stale_days, d.hotStaleDays, 1, 90),
    warmStaleDays: num(r.warm_stale_days, d.warmStaleDays, 1, 180),
    fewAttemptsMax: num(r.few_attempts_max, d.fewAttemptsMax, 1, 20),
    fewAttemptsWindowDays: num(r.few_attempts_window_days, d.fewAttemptsWindowDays, 1, 90),
    showingNoFeedbackHours: num(r.showing_no_feedback_hours, d.showingNoFeedbackHours, 1, 336),
    vitalsWarn: Math.min(warn, alert),
    vitalsAlert: Math.max(warn, alert),
    disabled: Array.isArray(r.disabled) ? r.disabled.filter(isWorklistCode) : [],
  };
}

export function worklistLabel(code: WorklistCode, s: WorklistSettings): { label: string; hint: string } {
  switch (code) {
    case "new_uncontacted":
      return { label: "Шинэ — холбогдоогүй", hint: "Эхний холболт хийгдээгүй шинэ сэжим" };
    case "hot_stale":
      return { label: `Халуун — ${s.hotStaleDays}+ хоног`, hint: `Халуун ангиллын, ${s.hotStaleDays}+ хоног холбогдоогүй` };
    case "few_attempts":
      return {
        label: `${s.fewAttemptsMax}-аас цөөн оролдлого`,
        hint: `Холбогдож амжаагүй, сүүлийн ${s.fewAttemptsWindowDays} хоногт ${s.fewAttemptsMax}-аас цөөн оролдлоготой`,
      };
    case "showing_no_feedback":
      return {
        label: "Үзлэгийн дараа хариугүй",
        hint: `Үзлэг хийгдээд ${s.showingNoFeedbackHours}+ цаг эргэх холбоо бүртгэгдээгүй`,
      };
    case "overdue_steps":
      return { label: "Хугацаа хэтэрсэн алхам", hint: "Дараагийн үйлдлийн огноо өнгөрсөн" };
    case "warm_stale":
      return { label: `Дулаан — ${s.warmStaleDays}+ хоног`, hint: `Дулаан ангиллын, ${s.warmStaleDays}+ хоног холбогдоогүй` };
  }
}

export type WorklistLead = {
  id: string;
  contactId: string;
  contactName: string;
  phone: string | null;
  ownerId: string | null;
  grade: string | null;
  status: string;
  createdAt: string;
  firstContactAt: string | null;
  firstContactDueAt: string | null;
  lastContactAt: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  /** Цонхны хугацаанд бүртгэгдсэн оролдлого (холбогдсон эсэхээс үл хамаарна). */
  attempts: number;
};

export type WorklistShowing = {
  id: string;
  opportunityId: string | null;
  contactId: string;
  contactName: string;
  phone: string | null;
  ownerId: string | null;
  doneAt: string;
};

export type WorklistEntry = {
  key: string;
  code: WorklistCode;
  kind: "lead" | "showing";
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  contactId: string;
  name: string;
  phone: string | null;
  grade: string | null;
  ownerId: string | null;
  reason: string;
  href: string;
  leadIsNew: boolean;
  /** Эрэмбэлэх түлхүүр — бага нь түрүүлнэ (мс). */
  sortKey: number;
};

const DAY = 86_400_000;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY);
}

function lastTouch(l: WorklistLead): string {
  return l.lastContactAt ?? l.firstContactAt ?? l.createdAt;
}

/** Сэжим тухайн жагсаалтад орох эсэх ба шалтгааны текст. */
export function leadReason(
  code: WorklistCode,
  l: WorklistLead,
  s: WorklistSettings,
  now: Date,
  todayIso: string
): string | null {
  const open = l.status === "new" || l.status === "active";
  if (!open) return null;
  switch (code) {
    case "new_uncontacted":
      if (l.status !== "new" || l.firstContactAt) return null;
      return l.firstContactDueAt && Date.parse(l.firstContactDueAt) < now.getTime()
        ? "Эхний холболтын хугацаа хэтэрсэн"
        : "Эхний холболт хийгдээгүй";
    case "few_attempts":
      if (l.firstContactAt || l.attempts >= s.fewAttemptsMax) return null;
      return l.attempts === 0 ? "Оролдлого бүртгэгдээгүй" : `${l.attempts} оролдлого`;
    case "hot_stale": {
      if (l.grade !== "a") return null;
      const d = daysSince(lastTouch(l), now);
      return d != null && d >= s.hotStaleDays ? `${d} хоног холбогдоогүй` : null;
    }
    case "warm_stale": {
      if (l.grade !== "b") return null;
      const d = daysSince(lastTouch(l), now);
      return d != null && d >= s.warmStaleDays ? `${d} хоног холбогдоогүй` : null;
    }
    case "overdue_steps":
      if (!l.nextStepDate || l.nextStepDate >= todayIso) return null;
      return `${l.nextStep ?? "Дараагийн үйлдэл"} — ${l.nextStepDate}`;
    case "showing_no_feedback":
      return null;
  }
}

function leadSortKey(code: WorklistCode, l: WorklistLead): number {
  switch (code) {
    case "new_uncontacted":
      return Date.parse(l.firstContactDueAt ?? l.createdAt);
    case "overdue_steps":
      return Date.parse(`${l.nextStepDate ?? "9999-12-31"}T00:00:00Z`);
    default:
      return Date.parse(lastTouch(l));
  }
}

/**
 * Бүх жагсаалтыг нэг дор бүтээнэ. Идэвхгүй болгосон жагсаалт хоосон.
 * basePath: '/agent/crm' эсвэл '/office/crm' — мөр бүр зорьсон карт руу (UX-18).
 */
export function buildWorklists(
  leads: WorklistLead[],
  showings: WorklistShowing[],
  s: WorklistSettings,
  now: Date,
  todayIso: string,
  basePath = "/agent/crm"
): Record<WorklistCode, WorklistEntry[]> {
  const oppPath = basePath.startsWith("/office") ? "deals" : "pipeline";
  const out = Object.fromEntries(WORKLIST_CODES.map((c) => [c, [] as WorklistEntry[]])) as Record<
    WorklistCode,
    WorklistEntry[]
  >;
  for (const code of WORKLIST_CODES) {
    if (s.disabled.includes(code)) continue;
    if (code === "showing_no_feedback") {
      const limit = now.getTime() - s.showingNoFeedbackHours * 3600_000;
      for (const sh of showings) {
        if (Date.parse(sh.doneAt) > limit) continue;
        const hours = Math.floor((now.getTime() - Date.parse(sh.doneAt)) / 3600_000);
        out[code].push({
          key: `${code}:${sh.id}`,
          code,
          kind: "showing",
          id: sh.id,
          leadId: null,
          opportunityId: sh.opportunityId,
          contactId: sh.contactId,
          name: sh.contactName,
          phone: sh.phone,
          grade: null,
          ownerId: sh.ownerId,
          reason: `Үзлэгээс хойш ${hours} цаг`,
          href: sh.opportunityId ? `${basePath}/${oppPath}/${sh.opportunityId}` : `${basePath}/contacts/${sh.contactId}`,
          leadIsNew: false,
          sortKey: Date.parse(sh.doneAt),
        });
      }
    } else {
      for (const l of leads) {
        const reason = leadReason(code, l, s, now, todayIso);
        if (!reason) continue;
        out[code].push({
          key: `${code}:${l.id}`,
          code,
          kind: "lead",
          id: l.id,
          leadId: l.id,
          opportunityId: null,
          contactId: l.contactId,
          name: l.contactName,
          phone: l.phone,
          grade: l.grade,
          ownerId: l.ownerId,
          reason,
          href: `${basePath}/leads/${l.id}`,
          leadIsNew: l.status === "new",
          sortKey: leadSortKey(code, l),
        });
      }
    }
    out[code].sort((a, b) => a.sortKey - b.sortKey || a.key.localeCompare(b.key));
  }
  return out;
}

// ── R20 Ажлын эрүүл мэндийн самбар ───────────────────────

export type VitalsTone = "green" | "amber" | "rose";

export function vitalsTone(count: number, s: WorklistSettings): VitalsTone {
  if (count >= s.vitalsAlert) return "rose";
  if (count >= s.vitalsWarn) return "amber";
  return "green";
}

export type VitalsRow = {
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  branchId: string | null;
  counts: Record<WorklistCode, number>;
  total: number;
};

export type OwnerInfo = { id: string; name: string; teamId: string | null; branchId: string | null };

/** Эзэмшигч бүрийн жагсаалтын тоо. Эзэмшигчгүй мөрийг «Эзэмшигчгүй» гэж тусад нь. */
export function vitalsMatrix(lists: Record<WorklistCode, WorklistEntry[]>, owners: OwnerInfo[]): VitalsRow[] {
  const byId = new Map<string, VitalsRow>();
  const blank = () => Object.fromEntries(WORKLIST_CODES.map((c) => [c, 0])) as Record<WorklistCode, number>;
  for (const o of owners) {
    byId.set(o.id, { ownerId: o.id, ownerName: o.name, teamId: o.teamId, branchId: o.branchId, counts: blank(), total: 0 });
  }
  for (const code of WORKLIST_CODES) {
    for (const e of lists[code]) {
      const id = e.ownerId ?? "";
      let row = byId.get(id);
      if (!row) {
        row = { ownerId: id, ownerName: id ? "Бусад" : "Эзэмшигчгүй", teamId: null, branchId: null, counts: blank(), total: 0 };
        byId.set(id, row);
      }
      row.counts[code] += 1;
      row.total += 1;
    }
  }
  return [...byId.values()].sort((a, b) => b.total - a.total || a.ownerName.localeCompare(b.ownerName));
}

/** Багц бүрийн нийт тоо (chip-ийн тоолуур). */
export function worklistCounts(lists: Record<WorklistCode, WorklistEntry[]>): Record<WorklistCode, number> {
  return Object.fromEntries(WORKLIST_CODES.map((c) => [c, lists[c].length])) as Record<WorklistCode, number>;
}

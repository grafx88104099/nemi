/**
 * «Эзэн» талбарын цэвэр загвар (P6): утас эхэлсэн нэг бүрэлдэхүүн — шуурхай бүртгэл, картын
 * эзний доод цонх, гэрээний гарын үсэг зурагч бүгд үүнийг ашиглана.
 *
 * Дүрэм:
 * - Утсаар хэзээ ч автоматаар холбохгүй: харах эрхтэй давхцалд «Тийм» дарж {contact_id} илгээнэ,
 *   «Өөр хүн» бол allow_duplicate. Харах эрхгүй (өөр агентын) харилцагчийн нэрийг сервер нууцалж өгнө.
 * - Шалгаагүй (сүлжээгүй) үед утсаа илгээнэ — сервер needs_choice / foreign буцааж owner_pending-д хадгална.
 * - Энэ модуль хадгалах сантай ажиллахгүй (зөвхөн сүүлд сонгосон эх сурвалжийн КОДЫГ localStorage-оос
 *   унших/бичих туслах функц бий — хувийн өгөгдөл биш; эцэг бүрэлдэхүүн дуудна).
 */

import { formatPhone, isFullPhone, normalizePhone } from "@/lib/crm2/phone";
import { isOwnerFinal } from "@/lib/crm2/types";
import type {
  Crm2ContactDuplicate,
  Crm2OwnerInput,
  Crm2OwnerPending,
  Crm2OwnerResolveResult,
  Crm2OwnerStatus,
  Crm2PhoneMatch,
} from "@/lib/crm2/types";

export const OWNER_PHONE_ERROR = "Дугаар 8 оронтой байх ёстой";
export const OWNER_NOTE_REQUIRED = "«Бусад» эх сурвалжийн тайлбарыг бичнэ үү";
export const OWNER_NOTE_TOO_LONG = "Тайлбар 200 тэмдэгтээс хэтрэхгүй";
export const OWNER_NAME_UNVERIFIED = "Нэр баталгаажаагүй";
export const OWNER_SOURCE_NOTE_MAX = 200;
export const OWNER_NAME_MAX = 160;
/** Утас бүтэн болсны дараах хайлтын саатал. */
export const OWNER_LOOKUP_DEBOUNCE_MS = 400;
/** «Бусад» — тайлбартай эх сурвалж (contact.sources-д заавал байна). */
export const OTHER_SOURCE = "other";

const MN_PREFIX = "976";

// ── Утас ────────────────────────────────────────────────────────────────────

function group4(s: string): string {
  return s.length > 4 ? `${s.slice(0, 4)} ${s.slice(4)}` : s;
}

/**
 * Бичих явцын хэлбэр: «9911 2233», «+976 9911 2233». 8-аас олон цифртэй (+ угтваргүй) бичвэрийг
 * цифрээр нь үлдээнэ (юуг ч нуухгүй, тайрахгүй).
 */
export function formatPhoneTyping(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/[^\d+]/g, "");
  const plus = t.startsWith("+");
  const d = t.replace(/\D/g, "");
  if (plus) {
    if (d.startsWith(MN_PREFIX)) {
      const local = d.slice(MN_PREFIX.length);
      return `+${MN_PREFIX}${local ? ` ${group4(local)}` : ""}`;
    }
    return `+${d}`;
  }
  return d.length <= 8 ? group4(d) : d;
}

function digitCount(s: string): number {
  return s.replace(/\D/g, "").length;
}

/**
 * Удирдлагатай input-ийн засвар: шинэ утгыг хэлбэржүүлж, курсорыг ижил тооны цифрийн дараа байрлуулна.
 * Backspace зөвхөн зай/тэмдэг устгасан бол (цифрийн тоо өөрчлөгдөөгүй) өмнөх цифрийг устгана.
 */
export function applyPhoneEdit(
  prev: string,
  next: string,
  caret: number | null,
  inputType?: string | null
): { value: string; caret: number } {
  let text = next;
  let pos = caret ?? next.length;
  if (inputType === "deleteContentBackward" && next.length < prev.length && digitCount(next) === digitCount(prev)) {
    // Курсорын өмнөх хамгийн ойрын цифрийг устгана.
    let i = pos - 1;
    while (i >= 0 && !/\d/.test(text[i]!)) i -= 1;
    if (i >= 0) {
      text = text.slice(0, i) + text.slice(i + 1);
      pos = i;
    }
  }
  const digitsBefore = text.slice(0, pos).replace(/[^\d+]/g, "").length;
  const value = formatPhoneTyping(text);
  let seen = 0;
  let out = 0;
  if (digitsBefore > 0) {
    for (let i = 0; i < value.length; i += 1) {
      if (/[\d+]/.test(value[i]!)) seen += 1;
      if (seen === digitsBefore) {
        out = i + 1;
        break;
      }
    }
    if (seen < digitsBefore) out = value.length;
  }
  return { value, caret: out };
}

/**
 * Эзний дугаар зөв эсэх (blur): 8 оронтой дотоод дугаар, бүтэн +976 дугаар, эсвэл «+»/«00» угтвартай
 * гадаад дугаар (8–15 цифр). Сервер (isFullPhone, ≥ 8 цифр)-ээс хатуу — 9 цифрийн алдааг ч барина.
 */
export function isOwnerPhoneValid(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  if (!t || !isFullPhone(t)) return false;
  const norm = normalizePhone(t);
  if (norm.length === 11 && norm.startsWith(MN_PREFIX)) return true;
  const international = t.startsWith("+") || t.replace(/[^\d]/g, "").startsWith("00");
  return international && norm.length >= 8 && norm.length <= 15 && !norm.startsWith(MN_PREFIX);
}

/** Хоосон бол null; буруу бол «Дугаар 8 оронтой байх ёстой». */
export function ownerPhoneError(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return isOwnerPhoneValid(t) ? null : OWNER_PHONE_ERROR;
}

/** Харилцагч/санах ойгоос ирсэн (жигдрүүлсэн) дугаарыг талбарын хэлбэрт. */
export function phoneForField(raw: string): string {
  const norm = normalizePhone(raw);
  if (norm.length === 11 && norm.startsWith(MN_PREFIX)) return formatPhone(norm);
  return norm ? `+${norm}` : formatPhoneTyping(raw);
}

// ── Давхцал ────────────────────────────────────────────────────────────────

export type OwnerMatch = {
  contactId: string;
  code: string;
  /** Сервер өгсөн нэр — харах эрхгүй бол аль хэдийн нууцалсан. */
  name: string;
  agentName: string;
  canOpen: boolean;
};

export function matchFromPhoneRow(r: Crm2PhoneMatch): OwnerMatch {
  return {
    contactId: r.contact_id,
    code: r.code,
    name: r.display_name,
    agentName: r.responsible_agent_name ?? "",
    canOpen: r.can_open === true,
  };
}

export function matchFromDuplicate(d: Crm2ContactDuplicate): OwnerMatch {
  return {
    contactId: d.contact_id,
    code: d.code,
    name: d.display_name,
    agentName: d.responsible_agent_name ?? "",
    canOpen: d.can_open === true,
  };
}

export type OwnerMatchState =
  /** Утас хоосон эсвэл бүтэн биш. */
  | { kind: "idle" }
  /** Бүтэн утас — хайлт хүлээгдэж/явж байна. */
  | { kind: "checking"; norm: string }
  /** Оффист энэ дугаар алга — шинэ хүн. */
  | { kind: "none"; norm: string }
  /** Харах эрхтэй давхцал — «Энэ хүн үү?». */
  | { kind: "visible"; norm: string; matches: OwnerMatch[] }
  /** Зөвхөн өөр агентын (харах эрхгүй) харилцагч. */
  | { kind: "foreign"; norm: string; matches: OwnerMatch[] }
  /** Шалгаж чадсангүй (сүлжээгүй/алдаа) — сервер илгээх үед шийднэ. */
  | { kind: "unchecked"; norm: string; reason: "offline" | "error" };

export type OwnerModel = {
  /** Талбарт харагдах (хэлбэржүүлсэн) утас. */
  phone: string;
  matchState: OwnerMatchState;
  /** Харах эрхтэй давхцалаас «Тийм» гэж сонгосон харилцагч — зөвхөн ингэж холбогдоно. */
  chosenContactId: string | null;
  name: string;
  source: string | null;
  /** Сүүлд ашигласан эх сурвалжаар урьдчилан сонгосон (шар «шалгана уу»). */
  sourceGuessed: boolean;
  sourceNote: string;
  /** «Өөр хүн» / «Тусдаа хүн» — давхцлыг алгасаж шинэ харилцагч үүсгэнэ. */
  allowDuplicate: boolean;
  /** Өөр агентын харилцагчийг шилжүүлэх хүсэлт илгээсэн. */
  transferRequested: boolean;
  /** Серверийн сүүлийн хариу (live хадгалалт, шуурхай бүртгэл, owner_pending). */
  serverStatus: Crm2OwnerStatus | null;
};

/** Ноорогт (vault-д битүүмжлэх) хадгалах хэсэг. */
export type OwnerDraft = {
  phone: string;
  name: string;
  source: string | null;
  sourceGuessed: boolean;
  sourceNote: string;
  chosenContactId: string | null;
  allowDuplicate: boolean;
};

function stateFor(phone: string): OwnerMatchState {
  return isFullPhone(phone) ? { kind: "checking", norm: normalizePhone(phone) } : { kind: "idle" };
}

export function emptyOwnerModel(lastSource?: string | null): OwnerModel {
  const src = lastSource && lastSource !== OTHER_SOURCE ? lastSource : null;
  return {
    phone: "",
    matchState: { kind: "idle" },
    chosenContactId: null,
    name: "",
    source: src,
    sourceGuessed: src !== null,
    sourceNote: "",
    allowDuplicate: false,
    transferRequested: false,
    serverStatus: null,
  };
}

/** Ноорог/урьдчилсан утгаас загвар. Сонгосон харилцагч хайлтын дараа дахин шалгагдана. */
export function modelFromDraft(d: Partial<OwnerDraft> | null | undefined, lastSource?: string | null): OwnerModel {
  const base = emptyOwnerModel(lastSource);
  if (!d) return base;
  const phone = formatPhoneTyping(d.phone ?? "");
  const hasSource = d.source !== undefined;
  return {
    ...base,
    phone,
    matchState: stateFor(phone),
    chosenContactId: d.chosenContactId ?? null,
    name: d.name ?? "",
    source: hasSource ? d.source ?? null : base.source,
    sourceGuessed: hasSource ? Boolean(d.sourceGuessed) && d.source != null : base.sourceGuessed,
    sourceNote: d.sourceNote ?? "",
    allowDuplicate: Boolean(d.allowDuplicate),
  };
}

/** Картын owner_pending-ээс «Шийдвэрлэх» — талбарыг урьдчилан бөглөнө. */
export function draftFromPending(p: Crm2OwnerPending): OwnerDraft {
  return {
    phone: p.phone ?? "",
    name: p.name ?? "",
    source: p.source ?? null,
    sourceGuessed: false,
    sourceNote: p.source_note ?? "",
    chosenContactId: null,
    allowDuplicate: false,
  };
}

export function modelFromPending(p: Crm2OwnerPending): OwnerModel {
  return { ...modelFromDraft(draftFromPending(p)), serverStatus: p.status };
}

export function toOwnerDraft(m: OwnerModel): OwnerDraft {
  return {
    phone: m.phone,
    name: m.name,
    source: m.source,
    sourceGuessed: m.sourceGuessed,
    sourceNote: m.sourceNote,
    chosenContactId: m.chosenContactId,
    allowDuplicate: m.allowDuplicate,
  };
}

// ── Reducer ────────────────────────────────────────────────────────────────

export type OwnerAction =
  | { type: "phone"; value: string }
  | { type: "lookup_done"; norm: string; matches: OwnerMatch[] }
  | { type: "lookup_failed"; norm: string; reason: "offline" | "error" }
  | { type: "recheck" }
  /** «Тийм» — харах эрхтэй давхцалыг сонгоно. */
  | { type: "choose"; contactId: string }
  /** «Өөр хүн» (харах эрхтэй давхцал) эсвэл «Тусдаа хүн» (өөр агентын). */
  | { type: "separate" }
  /** Сонголтыг буцаах. */
  | { type: "undo_choice" }
  | { type: "transfer_requested" }
  | { type: "name"; value: string }
  | { type: "source"; code: string | null }
  /** Сүүлд ашигласан эх сурвалж (зөвхөн одоо сонгоогүй үед, шар «шалгана уу»). */
  | { type: "guess_source"; code: string | null }
  | { type: "confirm_source" }
  | { type: "source_note"; value: string }
  /** Серверийн хариу (setPropertyOwner / шуурхай бүртгэл). */
  | { type: "server"; result: Crm2OwnerResolveResult }
  | { type: "reset"; model: OwnerModel };

function currentNorm(m: OwnerModel): string | null {
  return m.matchState.kind === "idle" ? null : m.matchState.norm;
}

export function ownerReducer(m: OwnerModel, a: OwnerAction): OwnerModel {
  switch (a.type) {
    case "phone": {
      const phone = a.value;
      const nextState = stateFor(phone);
      const prevNorm = currentNorm(m);
      const nextNorm = nextState.kind === "idle" ? null : nextState.norm;
      if (prevNorm !== null && prevNorm === nextNorm) return { ...m, phone };
      // Өөр дугаар — өмнөх сонголт, серверийн төлөв хамаарахгүй болно.
      return {
        ...m,
        phone,
        matchState: nextState,
        chosenContactId: null,
        allowDuplicate: false,
        transferRequested: false,
        serverStatus: null,
      };
    }
    case "lookup_done": {
      if (m.matchState.kind !== "checking" || m.matchState.norm !== a.norm) return m;
      const visible = a.matches.filter((x) => x.canOpen);
      const hidden = a.matches.filter((x) => !x.canOpen);
      const chosen = m.chosenContactId && visible.some((x) => x.contactId === m.chosenContactId) ? m.chosenContactId : null;
      if (visible.length) {
        return { ...m, matchState: { kind: "visible", norm: a.norm, matches: visible }, chosenContactId: chosen };
      }
      if (hidden.length) {
        return { ...m, matchState: { kind: "foreign", norm: a.norm, matches: hidden }, chosenContactId: null };
      }
      return { ...m, matchState: { kind: "none", norm: a.norm }, chosenContactId: null, allowDuplicate: false };
    }
    case "lookup_failed": {
      if (m.matchState.kind !== "checking" || m.matchState.norm !== a.norm) return m;
      return { ...m, matchState: { kind: "unchecked", norm: a.norm, reason: a.reason } };
    }
    case "recheck": {
      const norm = currentNorm(m);
      if (norm === null) return m;
      return { ...m, matchState: { kind: "checking", norm } };
    }
    case "choose": {
      if (m.matchState.kind !== "visible") return m;
      if (!m.matchState.matches.some((x) => x.contactId === a.contactId)) return m;
      return { ...m, chosenContactId: a.contactId, allowDuplicate: false };
    }
    case "separate": {
      if (m.matchState.kind !== "visible" && m.matchState.kind !== "foreign") return m;
      return { ...m, chosenContactId: null, allowDuplicate: true };
    }
    case "undo_choice":
      return { ...m, chosenContactId: null, allowDuplicate: false };
    case "transfer_requested":
      return { ...m, transferRequested: true };
    case "name":
      return { ...m, name: a.value };
    case "source": {
      const code = a.code || null;
      return {
        ...m,
        source: code,
        sourceGuessed: false,
        sourceNote: code === OTHER_SOURCE ? m.sourceNote : "",
      };
    }
    case "guess_source": {
      if (m.source !== null || !a.code || a.code === OTHER_SOURCE) return m;
      return { ...m, source: a.code, sourceGuessed: true };
    }
    case "confirm_source":
      return { ...m, sourceGuessed: false };
    case "source_note":
      return { ...m, sourceNote: a.value };
    case "server": {
      const r = a.result;
      const norm = currentNorm(m) ?? (isFullPhone(m.phone) ? normalizePhone(m.phone) : "");
      if (r.status === "needs_choice" && r.match) {
        const match: OwnerMatch = {
          contactId: r.match.contact_id,
          code: r.match.code,
          name: r.match.full_name,
          agentName: "",
          canOpen: true,
        };
        return {
          ...m,
          serverStatus: r.status,
          matchState: { kind: "visible", norm, matches: [match] },
          chosenContactId: null,
          allowDuplicate: false,
        };
      }
      if (r.status === "foreign") {
        const matches = (r.duplicates ?? []).map(matchFromDuplicate).filter((x) => !x.canOpen);
        return {
          ...m,
          serverStatus: r.status,
          matchState: matches.length ? { kind: "foreign", norm, matches } : m.matchState,
          chosenContactId: null,
          allowDuplicate: false,
        };
      }
      return { ...m, serverStatus: r.status };
    }
    case "reset":
      return a.model;
  }
}

// ── Гаралт ─────────────────────────────────────────────────────────────────

/**
 * RPC-ийн p_owner. Хоосон утас → null (эзэнгүй). Буруу дугаар → null (validation.phoneError).
 * Сонгосон харилцагч → {contact_id}; бусад үед утас + нэр + эх сурвалж (+ allow_duplicate).
 */
export function toOwnerInput(m: OwnerModel): Crm2OwnerInput | null {
  if (m.chosenContactId) return { contact_id: m.chosenContactId };
  const phone = m.phone.trim();
  if (!phone || !isOwnerPhoneValid(phone)) return null;
  const name = m.name.trim().slice(0, OWNER_NAME_MAX);
  const note = m.sourceNote.trim();
  return {
    phone,
    full_name: name || null,
    source: m.source,
    source_note: m.source === OTHER_SOURCE && note ? note.slice(0, OWNER_SOURCE_NOTE_MAX) : null,
    ...(m.allowDuplicate ? { allow_duplicate: true } : {}),
  };
}

export type OwnerValidation = {
  /** Эзний утас оруулаагүй. */
  empty: boolean;
  /** «Дугаар 8 оронтой байх ёстой» (blur-д харуулна). */
  phoneError: string | null;
  /** «Бусад»-ын тайлбар дутуу/хэт урт. */
  noteError: string | null;
  /** Харах эрхтэй давхцалд хариулаагүй (илгээвэл сервер needs_choice — owner_pending). */
  needsChoice: boolean;
  /** Өөр агентын харилцагч, «Тусдаа хүн» сонгоогүй (сервер foreign — owner_pending). */
  foreignPending: boolean;
  /** Шинэ хүн нэргүй — «Нэр баталгаажаагүй». */
  nameUnverified: boolean;
  sourceMissing: boolean;
  sourceUnconfirmed: boolean;
  /** toOwnerInput илгээх боломжтой (утас зөв, тайлбарын алдаагүй). */
  sendable: boolean;
  /** Илгээвэл гарах төлөвийн таамаг (null — сервер шийднэ). */
  expectedStatus: Crm2OwnerStatus | null;
};

export function validateOwner(m: OwnerModel): OwnerValidation {
  const phone = m.phone.trim();
  const empty = !phone && !m.chosenContactId;
  const phoneError = m.chosenContactId ? null : ownerPhoneError(phone);
  const linking = Boolean(m.chosenContactId);
  const note = m.sourceNote.trim();
  const noteError =
    linking || m.source !== OTHER_SOURCE
      ? null
      : !note
        ? OWNER_NOTE_REQUIRED
        : note.length > OWNER_SOURCE_NOTE_MAX
          ? OWNER_NOTE_TOO_LONG
          : null;
  const kind = m.matchState.kind;
  const needsChoice = !linking && kind === "visible" && !m.allowDuplicate;
  const foreignPending = !linking && kind === "foreign" && !m.allowDuplicate;
  const creating = !linking && !empty && !phoneError && !needsChoice && !foreignPending;
  const input = toOwnerInput(m);
  let expectedStatus: Crm2OwnerStatus | null;
  if (empty) expectedStatus = "none";
  else if (linking) expectedStatus = "linked";
  else if (phoneError) expectedStatus = "invalid_phone";
  else if (needsChoice) expectedStatus = "needs_choice";
  else if (foreignPending) expectedStatus = "foreign";
  else if (kind === "none" || m.allowDuplicate) expectedStatus = "created";
  else expectedStatus = null;
  return {
    empty,
    phoneError,
    noteError,
    needsChoice,
    foreignPending,
    nameUnverified: creating && !m.name.trim(),
    sourceMissing: creating && !m.source,
    sourceUnconfirmed: creating && m.sourceGuessed && Boolean(m.source),
    sendable: input !== null && noteError === null,
    expectedStatus,
  };
}

/** Эзний асуудал шийдэгдсэн эсэх (owner_pending цэвэрлэгдэж, хувийн ноорог устгаж болно). */
export function isFinal(status: Crm2OwnerStatus | null | undefined): boolean {
  return status != null && isOwnerFinal(status);
}

/** Эцсийн бус төлөвийн богино тайлбар (карт, мөр). */
export const OWNER_STATUS_TEXT: Record<Crm2OwnerStatus, string> = {
  none: "Эзэн бүртгээгүй",
  linked: "Эзэн холбогдсон",
  matched: "Эзэн холбогдсон",
  created: "Шинэ эзэн бүртгэгдсэн",
  needs_choice: "Ижил дугаартай харилцагч байна — сонгоно уу",
  foreign: "Өөр агентын харилцагч",
  no_access: "Сонгосон харилцагчийг харах эрхгүй",
  invalid_phone: OWNER_PHONE_ERROR,
  pending_review: "Эзнийг шалгах шаардлагатай",
};

// ── Эх сурвалж ──────────────────────────────────────────────────────────────

/** Анхдагч ангиллын дараалал (jsonb түлхүүрийн дараалал хадгалагдахгүй). */
const SOURCE_ORDER = [
  "digital",
  "referral",
  "prospecting",
  "walk_in",
  "open_house",
  "listing_inquiry",
  "personal_network",
  "international",
  "pm_cross",
] as const;

/** contact.sources → чипүүдийн дараалал: анхдагч дараалал, бусад нь нэрээр, «Бусад» хамгийн сүүлд. */
export function orderedSources(sources: Record<string, string> | null | undefined): { code: string; label: string }[] {
  const entries = Object.entries(sources ?? {}).filter(([k, v]) => k && typeof v === "string");
  const rank = (code: string) => {
    if (code === OTHER_SOURCE) return 10_000;
    const i = (SOURCE_ORDER as readonly string[]).indexOf(code);
    return i === -1 ? 1_000 : i;
  };
  return entries
    .sort(([a, la], [b, lb]) => rank(a) - rank(b) || la.localeCompare(lb, "mn"))
    .map(([code, label]) => ({ code, label }));
}

export function lastOwnerSourceKey(profileId: string): string {
  return `crm2:owner-source-last:${profileId}`;
}

/** Сүүлд ашигласан эх сурвалж (зөвхөн код; «Бусад»-ыг урьдчилан сонгохгүй). Тохиргоонд байхгүй бол null. */
export function readLastOwnerSource(profileId: string, sources: Record<string, string>): string | null {
  if (typeof window === "undefined" || !profileId) return null;
  try {
    const v = window.localStorage.getItem(lastOwnerSourceKey(profileId));
    return v && v !== OTHER_SOURCE && Object.prototype.hasOwnProperty.call(sources, v) ? v : null;
  } catch {
    return null;
  }
}

/** Илгээсэн оролтын эх сурвалжийг санана (эцэг бүрэлдэхүүн илгээсний дараа дуудна). */
export function rememberOwnerInputSource(profileId: string, input: Crm2OwnerInput | null | undefined): void {
  if (input && "phone" in input && input.source) rememberOwnerSource(profileId, input.source);
}

/** Амжилттай илгээсний дараа эцэг бүрэлдэхүүн дуудна (гарахад logoutCleanup «crm2:» түлхүүрийг устгана). */
export function rememberOwnerSource(profileId: string, code: string | null | undefined): void {
  if (typeof window === "undefined" || !profileId || !code) return;
  try {
    window.localStorage.setItem(lastOwnerSourceKey(profileId), code);
  } catch {
    /* хадгалах боломжгүй — алгасна */
  }
}

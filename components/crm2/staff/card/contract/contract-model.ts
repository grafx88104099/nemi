import { applyCommissionDefault, suspiciousCommission, type CommissionPrefill } from "@/lib/crm2/commission-defaults";
import {
  contractSubmitMissing,
  isUnconfirmableKey,
  type ChecklistContract,
  type ChecklistInput,
  type UnconfirmableKey,
} from "@/lib/crm2/checklist";
import { formatPhone, isFullPhone, normalizePhone } from "@/lib/crm2/phone";

/**
 * Гэрээний доод цонхны (ContractSheet) цэвэр загвар — клиент, сервер, тест.
 *
 * Алхам 1 «Гэрээний ноорог үүсгэх»: дугаар, огноо, шимтгэл, онцгой нөхцөл, гарын үсэг зурагч,
 * гэрээ байгуулсан ба хариуцсан агент. Алхам 2 «Батлуулахаар илгээх»: файл, илгээх.
 * Оффисын анхдагчаар бөглөсөн утга prefilled[]-д байна (шар) — «Зөв» эсвэл засахад хасагдана.
 * Эцсийн шалгалт DB дээр (crm2_brokerage_missing); энд зөвхөн урьдчилан харуулна.
 */

export const CONTRACT_PREFILL_KEYS = ["number", "start_date", "end_date", "commission"] as const;
export type ContractPrefillKey = (typeof CONTRACT_PREFILL_KEYS)[number];

export type ContractCommissionType = "percent" | "fixed";

export type ContractForm = {
  /** Цаасан гэрээний дугаар (autoNumber бол хоосон — DB B### олгоно). */
  number: string;
  /** «Систем дугаар өгөх». */
  autoNumber: boolean;
  start_date: string;
  end_date: string;
  commission_type: ContractCommissionType | "";
  commission_value: string;
  commission_currency: "MNT" | "USD";
  commission_note: string;
  terms: string;
  no_special_terms: boolean;
  signer_differs: boolean;
  /** Гарын үсэг зурагчийн холбоо/эрх (жишээ: итгэмжлэлээр). */
  signer_relation: string;
  responsible_agent_id: string;
  /** crm2_properties.contract_agent_id — хадгалахад баталгаажна. */
  contract_agent_id: string;
  prefilled: ContractPrefillKey[];
};

/** Гарын үсэг зурагчийн утас/нэр (vault-д битүүмжилнэ; signer_note-ийн сүүлийн мөрөнд хадгалагдана). */
export type SignerContact = { name: string; phone: string };

export type ContractRowLike = {
  number: string;
  start_date: string | null;
  end_date: string | null;
  commission_type: ContractCommissionType | null;
  commission_value: number | null;
  commission_currency: string | null;
  commission_note: string | null;
  terms: string | null;
  no_special_terms: boolean | null;
  signer_differs: boolean | null;
  signer_note: string | null;
  responsible_agent_id: string | null;
  prefilled: readonly string[] | null;
};

export type ContractPropertyLike = {
  category: string | null;
  price_total: number | null;
  currency: string | null;
  price_period: string | null;
  price_basis: string | null;
  contract_agent_id: string | null;
  listing_agent_id: string | null;
  unconfirmed: readonly string[] | null;
};

export type ContractSettingsLike = {
  "brokerage.default_term_months": number;
  "brokerage.default_commission"?: Partial<Record<string, string>> | null;
};

// ── Огноо ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD + N сар − 1 хоног (12 сар: 2026-11-13 → 2027-11-12). Сарын сүүлийн өдрийг хавчина. */
export function termEndDate(start: string, months: number): string | null {
  const m = ISO_DATE.exec(start);
  if (!m || !Number.isFinite(months) || months < 1) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const targetMonth = mo + Math.round(months);
  const ty = y + Math.floor(targetMonth / 12);
  const tm = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// ── Гарын үсэг зурагч (signer_note) ───────────────────────────────────────

export const SIGNER_NOTE_MAX = 500;
export const SIGNER_LINE_PREFIX = "Гарын үсэг зурагч: ";

/** Холбоо/эрх + (сонголтоор) зурагчийн нэр, утас → signer_note (≤ 500). */
export function composeSignerNote(relation: string, signer: SignerContact | null): string | null {
  const rel = relation.replace(/\s+$/g, "").trim();
  const parts: string[] = [];
  const name = signer?.name.trim() ?? "";
  const phone = signer && isFullPhone(signer.phone) ? formatPhone(normalizePhone(signer.phone)) : "";
  if (name) parts.push(name);
  if (phone) parts.push(phone);
  const line = parts.length ? `${SIGNER_LINE_PREFIX}${parts.join(" · ")}` : "";
  if (!rel && !line) return null;
  if (!line) return rel.slice(0, SIGNER_NOTE_MAX);
  const room = SIGNER_NOTE_MAX - line.length - 1;
  const relCut = room > 0 ? rel.slice(0, room).trim() : "";
  return (relCut ? `${relCut}\n${line}` : line).slice(0, SIGNER_NOTE_MAX);
}

/** signer_note → холбоо/эрх ба зурагч (composeSignerNote-ийн урвуу). */
export function parseSignerNote(note: string | null | undefined): { relation: string; signer: SignerContact | null } {
  const text = (note ?? "").trim();
  if (!text) return { relation: "", signer: null };
  const lines = text.split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (!last.startsWith(SIGNER_LINE_PREFIX)) return { relation: text, signer: null };
  const rest = last.slice(SIGNER_LINE_PREFIX.length).split(" · ").map((s) => s.trim());
  let name = "";
  let phone = "";
  for (const p of rest) {
    if (!phone && isFullPhone(p) && /^[+\d\s-]+$/.test(p)) phone = p.replace(/\D/g, "");
    else if (!name) name = p;
  }
  return { relation: lines.slice(0, -1).join("\n").trim(), signer: name || phone ? { name, phone } : null };
}

// ── Анхны төлөв ───────────────────────────────────────────────────────────

function prefilledOf(list: readonly string[] | null | undefined): ContractPrefillKey[] {
  const allowed = new Set<string>(CONTRACT_PREFILL_KEYS);
  return CONTRACT_PREFILL_KEYS.filter((k) => (list ?? []).includes(k) && allowed.has(k));
}

function numText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(v);
}

/** Үнийн суурь (applyCommissionDefault-д). */
export function priceBasisOf(p: ContractPropertyLike) {
  return { price_total: p.price_total, currency: p.currency, price_period: p.price_period, price_basis: p.price_basis };
}

/**
 * Шинэ ноорог: эхлэх = өнөөдөр, дуусах = +default_term_months, шимтгэл = оффисын анхдагч (MNT сарын
 * түрээсэд rent_x). Бөглөсөн бүхэн prefilled[]. Байгаа ноорог: мөрийн утга, prefilled хэвээр.
 */
export function initialContractForm(opts: {
  contract: ContractRowLike | null;
  property: ContractPropertyLike;
  settings: ContractSettingsLike;
  today: string;
  meId: string;
}): ContractForm {
  const { contract: c, property: p, settings, today, meId } = opts;
  const contractAgent = p.contract_agent_id ?? meId;
  if (c) {
    const signer = parseSignerNote(c.signer_note);
    return {
      number: c.number ?? "",
      autoNumber: false,
      start_date: c.start_date ?? "",
      end_date: c.end_date ?? "",
      commission_type: c.commission_type ?? "",
      commission_value: numText(c.commission_value),
      commission_currency: c.commission_currency === "USD" ? "USD" : "MNT",
      commission_note: c.commission_note ?? "",
      terms: c.terms ?? "",
      no_special_terms: !!c.no_special_terms,
      signer_differs: !!c.signer_differs,
      signer_relation: signer.relation,
      responsible_agent_id: c.responsible_agent_id ?? contractAgent,
      contract_agent_id: contractAgent,
      prefilled: prefilledOf(c.prefilled),
    };
  }
  const prefilled: ContractPrefillKey[] = ["start_date"];
  const end = termEndDate(today, settings["brokerage.default_term_months"]);
  if (end) prefilled.push("end_date");
  const commission: CommissionPrefill | null = applyCommissionDefault(p.category, priceBasisOf(p), {
    "brokerage.default_commission": settings["brokerage.default_commission"] ?? null,
  });
  if (commission) prefilled.push("commission");
  return {
    number: "",
    autoNumber: false,
    start_date: today,
    end_date: end ?? "",
    commission_type: commission?.commission_type ?? "",
    commission_value: commission ? String(commission.commission_value) : "",
    commission_currency: "MNT",
    commission_note: commission?.commission_note ?? "",
    terms: "",
    no_special_terms: false,
    signer_differs: false,
    signer_relation: "",
    responsible_agent_id: contractAgent,
    contract_agent_id: contractAgent,
    prefilled: CONTRACT_PREFILL_KEYS.filter((k) => prefilled.includes(k)),
  };
}

// ── Засвар ─────────────────────────────────────────────────────────────────

const PREFILL_OF_FIELD: Partial<Record<keyof ContractForm, ContractPrefillKey>> = {
  number: "number",
  autoNumber: "number",
  start_date: "start_date",
  end_date: "end_date",
  commission_type: "commission",
  commission_value: "commission",
  commission_currency: "commission",
  commission_note: "commission",
};

/** Талбар засах — агент өөрөө оруулсан утга тул холбогдох prefilled хасагдана. */
export function editContractField<K extends keyof ContractForm>(form: ContractForm, key: K, value: ContractForm[K]): ContractForm {
  const next = { ...form, [key]: value };
  const pk = PREFILL_OF_FIELD[key];
  if (pk && form[key] !== value) next.prefilled = form.prefilled.filter((k) => k !== pk);
  return next;
}

/** «Зөв» — анхдагч утгыг хэвээр нь баталгаажуулна. */
export function confirmPrefilled(form: ContractForm, key: ContractPrefillKey): ContractForm {
  return { ...form, prefilled: form.prefilled.filter((k) => k !== key) };
}

export function isPrefilled(form: ContractForm, key: ContractPrefillKey): boolean {
  return form.prefilled.includes(key);
}

/** Дугаарыг цаасан/системийн хооронд солих. */
export function setAutoNumber(form: ContractForm, auto: boolean): ContractForm {
  return { ...editContractField(form, "autoNumber", auto), number: auto ? "" : form.number };
}

/** Шимтгэлийг оффисын анхдагчаар дахин бөглөх (prefilled 'commission'). */
export function applyCommission(form: ContractForm, prefill: CommissionPrefill): ContractForm {
  return {
    ...form,
    commission_type: prefill.commission_type,
    commission_value: String(prefill.commission_value),
    commission_currency: "MNT",
    commission_note: prefill.commission_note ?? "",
    prefilled: form.prefilled.includes("commission") ? form.prefilled : [...form.prefilled, "commission"],
  };
}

const RENT_X_NOTE = /^сарын түрээсийн ([\d.]+) дахин$/;

/**
 * Үнэ өөрчлөгдсөн бол «сарын түрээсийн N дахин»-ээр тооцсон шимтгэлийг шинэ үнээр дахин тооцох санал.
 * Тооцоо зөрөхгүй, эсвэл тэр аргаар бөглөөгүй бол null.
 */
export function commissionRecalc(
  form: ContractForm,
  property: ContractPropertyLike,
  settings: ContractSettingsLike
): CommissionPrefill | null {
  if (form.commission_type !== "fixed" || !RENT_X_NOTE.test(form.commission_note.trim())) return null;
  const now = applyCommissionDefault(property.category, priceBasisOf(property), {
    "brokerage.default_commission": settings["brokerage.default_commission"] ?? null,
  });
  if (!now || now.commission_note !== form.commission_note.trim()) return null;
  const current = Number(form.commission_value.replace(/[\s,]/g, ""));
  return Number.isFinite(current) && current === now.commission_value ? null : now;
}

/** Тоон текст → тоо (хоосон/буруу бол null). '2,5' → 2.5, '1 500 000' → 1500000. */
export function parseAmount(text: string): number | null {
  const s = text.trim().replace(/\s+/g, "");
  if (!s) return null;
  const normalized = /^\d+,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ── Шалгалт ────────────────────────────────────────────────────────────────

export type ContractFieldErrors = Partial<Record<"number" | "end_date" | "commission_value" | "signer_note", string>>;

/** Хадгалахаас өмнөх хатуу алдаа (ноорогт ч зөвшөөрөхгүй). */
export function contractFormErrors(form: ContractForm, opts: { isNew: boolean }): ContractFieldErrors {
  const e: ContractFieldErrors = {};
  if (opts.isNew && !form.autoNumber && !form.number.trim()) {
    e.number = "Цаасан гэрээний дугаар оруулах эсвэл «Систем дугаар өгөх»-ийг сонгоно уу";
  }
  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    e.end_date = "Дуусах огноо эхлэх огнооноос өмнө байж болохгүй";
  }
  const v = parseAmount(form.commission_value);
  if (form.commission_value.trim() && v === null) e.commission_value = "Шимтгэлийг тоогоор оруулна уу";
  else if (v !== null && v < 0) e.commission_value = "Шимтгэл сөрөг байж болохгүй";
  else if (v !== null && form.commission_type === "percent" && v > 100) e.commission_value = "Хувь 100-аас ихгүй";
  if (form.signer_differs && !form.signer_relation.trim()) {
    e.signer_note = "Гарын үсэг зурагчийн холбоо, эрхийг бичнэ үү (жишээ: итгэмжлэлээр)";
  }
  return e;
}

/** Сэжигтэй шимтгэлийн сануулга (хадгалахыг хориглохгүй). */
export function commissionWarning(form: ContractForm, category: string | null): string | null {
  return suspiciousCommission(form.commission_type || null, parseAmount(form.commission_value), category);
}

// ── Хадгалах payload ───────────────────────────────────────────────────────

export type ContractDraftFields = {
  number: string;
  owner_contact_id: string | null;
  start_date: string;
  end_date: string;
  terms: string;
  commission_type: ContractCommissionType | "";
  commission_value: number | null;
  commission_currency?: "MNT" | "USD";
  commission_note: string;
  responsible_agent_id: string;
  no_special_terms: boolean;
  signer_differs: boolean;
  signer_note: string | null;
  prefilled: ContractPrefillKey[];
};

/** createBrokerageDraft / updateBrokerageDraft-ийн талбарууд. */
export function contractDraftFields(
  form: ContractForm,
  opts: { ownerContactId: string | null; signer: SignerContact | null }
): ContractDraftFields {
  return {
    number: form.autoNumber ? "" : form.number.trim(),
    owner_contact_id: opts.ownerContactId,
    start_date: form.start_date,
    end_date: form.end_date,
    terms: form.terms,
    commission_type: form.commission_type,
    commission_value: parseAmount(form.commission_value),
    commission_currency: form.commission_type === "fixed" ? form.commission_currency : undefined,
    commission_note: form.commission_note,
    responsible_agent_id: form.responsible_agent_id,
    no_special_terms: form.no_special_terms,
    signer_differs: form.signer_differs,
    signer_note: form.signer_differs ? composeSignerNote(form.signer_relation, opts.signer) : null,
    prefilled: [...form.prefilled],
  };
}

/**
 * Хадгалаагүй өөрчлөлт байгаа эсэх (хадгалах payload-оор харьцуулна — «1 500 000» ба 1500000 ижил).
 * Гэрээ байгуулсан агент баталгаажаагүй бол хадгалах хэрэгтэй гэж үзнэ.
 */
export function contractDirty(
  form: ContractForm,
  baseline: ContractForm,
  signer: SignerContact | null,
  baselineSigner: SignerContact | null,
  agent: { property: Pick<ContractPropertyLike, "contract_agent_id" | "unconfirmed">; canEdit: boolean }
): boolean {
  const a = contractDraftFields(form, { ownerContactId: null, signer });
  const b = contractDraftFields(baseline, { ownerContactId: null, signer: baselineSigner });
  if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  if (form.responsible_agent_id !== baseline.responsible_agent_id) return true;
  return agent.canEdit && contractAgentPatch(form, agent.property) !== null;
}

/** Гэрээ байгуулсан агентыг хөрөнгөд бичих хэрэгтэй эсэх (солигдсон эсвэл баталгаажаагүй). */
export function contractAgentPatch(
  form: ContractForm,
  property: Pick<ContractPropertyLike, "contract_agent_id" | "unconfirmed">
): { contract_agent_id: string; unconfirmed?: UnconfirmableKey[] } | null {
  const id = form.contract_agent_id;
  if (!id) return null;
  const unconfirmed = property.unconfirmed ?? [];
  const pending = unconfirmed.includes("contract_agent_id");
  if (id === property.contract_agent_id && !pending) return null;
  if (!pending) return { contract_agent_id: id };
  return { contract_agent_id: id, unconfirmed: unconfirmed.filter((k): k is UnconfirmableKey => k !== "contract_agent_id" && isUnconfirmableKey(k)) };
}

// ── Дутуу зүйлс ────────────────────────────────────────────────────────────

/** Алхам 1-д (маягт дээр) засах зүйлс. */
export const STEP1_MISSING = new Set([
  "start_date",
  "end_date",
  "end_date_past",
  "commission",
  "owner",
  "owner_name",
  "owner_source",
  "special_terms",
  "signer_authority",
  "defaults_unconfirmed",
  "role_unconfirmed",
]);

/** Алхам 2-т (файл) засах зүйлс. */
export const STEP2_MISSING = new Set(["file", "ownership_doc"]);

export type ContractFileCounts = { contract: number; ownership: number; other: number };

export function fileCounts(files: readonly { kind: string | null }[] | null | undefined): ContractFileCounts {
  const out: ContractFileCounts = { contract: 0, ownership: 0, other: 0 };
  for (const f of files ?? []) {
    const k = f.kind ?? "contract";
    if (k === "contract") out.contract++;
    else if (k === "ownership") out.ownership++;
    else out.other++;
  }
  return out;
}

/**
 * Илгээхэд дутуу (contractSubmitMissing + UI-ийн 'owner_source'). Маягтын хадгалаагүй утгыг тусгана:
 * хадгалахад гэрээ байгуулсан агент баталгаажна. 'file'-ийг «гэрээ оффист үлдсэн» ХЭЗЭЭ Ч хангахгүй.
 */
export function contractMissing(
  input: ChecklistInput,
  form: ContractForm,
  opts: {
    status: ChecklistContract["status"];
    owner: { id: string; nameUnverified: boolean; source: string | null } | null | "hidden";
    files: ContractFileCounts;
    fileAtOffice: boolean;
    signerNote: string | null;
    /** Хадгалахад гэрээ байгуулсан агентыг хөрөнгөд бичих эрхтэй (хөрөнгө засах эрх). */
    confirmsAgent?: boolean;
  }
): string[] {
  const o = opts.owner;
  const owner = o && o !== "hidden" ? o : null;
  const contract: ChecklistContract = {
    status: opts.status,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    commission_type: form.commission_type || null,
    commission_value: parseAmount(form.commission_value),
    owner_contact_id: owner?.id ?? (o === "hidden" ? "hidden" : null),
    ownerNameUnverified: owner?.nameUnverified ?? false,
    ownerSource: owner?.source ?? null,
    terms: form.terms,
    no_special_terms: form.no_special_terms,
    signer_differs: form.signer_differs,
    signer_note: form.signer_differs ? opts.signerNote : null,
    prefilled: form.prefilled,
    fileCount: opts.files.contract,
    ownershipFileCount: opts.files.ownership,
    otherFileCount: opts.files.other,
    file_at_office: opts.fileAtOffice,
  };
  const confirms = opts.confirmsAgent ?? true;
  const property = confirms
    ? {
        ...input.property,
        contract_agent_id: form.contract_agent_id || null,
        unconfirmed: (input.property.unconfirmed ?? []).filter((k) => k !== "contract_agent_id"),
      }
    : input.property;
  const out = contractSubmitMissing({ ...input, property, contract });
  // Эх сурвалж гэрээ илгээхэд заавал (DB нь «Бүртгэл» бүлэгт шаарддаг; энд UI түвшинд).
  if (opts.status === "draft" && owner && !owner.source && !out.includes("owner_source")) {
    const at = out.indexOf("owner_name");
    out.splice(at >= 0 ? at + 1 : out.length, 0, "owner_source");
  }
  return out;
}

// ── Батлах / идэвхжүүлэх ───────────────────────────────────────────────────

export type ActivationPanelState =
  | { kind: "hidden" }
  | { kind: "scheduled" }
  | { kind: "ready" }
  | { kind: "auto" }
  | { kind: "blocked"; missing: string[] };

/**
 * Батлагдсан гэрээтэй ноорог хөрөнгийн идэвхжүүлэлт: manual горимд «Идэвхжүүлэх», дутуу бол жагсаалт.
 * activate_on_start (эхлэх өдөр нь автоматаар) бол «scheduled».
 */
export function activationPanelState(opts: {
  propertyStatus: string;
  hasActiveContract: boolean;
  activateOnStart: boolean;
  mode: "auto" | "manual";
  check: { ok: boolean; missing: readonly string[] } | null;
}): ActivationPanelState {
  if (opts.propertyStatus !== "draft" || !opts.hasActiveContract) return { kind: "hidden" };
  if (opts.activateOnStart) return { kind: "scheduled" };
  if (!opts.check) return { kind: "hidden" };
  if (!opts.check.ok) return { kind: "blocked", missing: [...opts.check.missing] };
  return opts.mode === "manual" ? { kind: "ready" } : { kind: "auto" };
}

/** Батлахад файлтай тулгасныг заавал асуух эсэх. */
export function needsFileCheck(requireFile: boolean): boolean {
  return requireFile;
}

/** Батлах RPC-ийн file_checked аргумент (асуухгүй үед undefined — хуучин функцтэй таарна). */
export function approveFileArg(requireFile: boolean, checked: boolean): boolean | undefined {
  return requireFile ? checked : undefined;
}

/** Алхам: гэрээгүй эсвэл алхам 1-ийн дутуутай бол 1, эс бөгөөс 2. */
export function initialStep(hasContract: boolean, missing: readonly string[]): 1 | 2 {
  if (!hasContract) return 1;
  return missing.some((m) => STEP1_MISSING.has(m)) ? 1 : 2;
}

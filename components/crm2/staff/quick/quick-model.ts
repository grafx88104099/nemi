import { UNCONFIRMABLE_KEYS } from "@/lib/crm2/checklist";
import type { DraftIndexEntry, DraftSource } from "@/lib/crm2/device/draft-store";
import { groupDigits, shortAmount } from "@/lib/crm2/field-validation";
import type { ParsedListingFields } from "@/lib/crm2/listing-text";
import { buildQuickCreatePayload, SOURCE_TEXT_MAX, type QuickDraftForm, type QuickPayloadBuild } from "@/lib/crm2/quick-payload";
import { isOwnerFinal, type Crm2OwnerInput, type Crm2OwnerStatus, type Crm2PropertyCategory } from "@/lib/crm2/types";
import { foldSearchText } from "@/lib/search/fold";

import {
  confirmFields,
  emptyPropertyForm,
  fromCreateDraft,
  normalizeUnconfirmed,
  unconfirmedKeyOf,
  withCategory,
  type PropertyFormState,
} from "@/components/crm2/staff/form/form-model";
import type { OwnerDraft } from "@/components/crm2/staff/owner/owner-model";

/**
 * Шуурхай бүртгэл (P8) — ЦЭВЭР загвар (клиент дэлгэц ба тест).
 *
 * Шуурхай дэлгэц нь бүрэн формын ижил ноорогийн бичлэгийг (crm2:draft:{profileId}:staff-new:{clientKey})
 * ашиглана: нийтийн хэсэг = PropertyFormState (+ quick_meta), хувийн хэсэг (vault) = бүрэн формын
 * CreateDraftPrivate-тэй нийцтэй (owner_phone, address_detail …) + owner_draft. Тиймээс «Бүрэн форм»
 * руу шилжихэд юу ч алдагдахгүй.
 *
 * Дүрэм:
 *  - агентын бичсэн утгыг санал (наалт, төслийн санал) ХЭЗЭЭ Ч дарахгүй — зөвхөн хоосон талбарыг бөглөнө;
 *  - автоматаар бөглөсөн утга unconfirmed-д орж шараар харагдана; хадгалахыг саатуулахгүй;
 *  - гэрээний агентыг шуурхай бүртгэл тавихгүй (гэрээний цонх тавина).
 */

// ── Төлөв ──────────────────────────────────────────────────────────────────

export type QuickPanel = "agent" | "office";

/** Ноорогт хадгалах туслах мэдээлэл (бүрэн форм үл тооно). */
export type QuickMeta = {
  /** Агентын өөрөө бичсэн/сонгосон талбарууд (маягтын түлхүүр) — санал эдгээрийг дарахгүй. */
  typed: string[];
  /** Наасан эсвэл хуваалцсан бичвэрээс бөглөсөн эсэх. */
  pasted: boolean;
  /** Сүлжээгүй үед утсан дээр хадгалсан бичлэгээс эхэлсэн. */
  offline: boolean;
};

export type QuickForm = PropertyFormState;

export type QuickState = {
  form: QuickForm;
  meta: QuickMeta;
};

/** Ноорогийн нийтийн бичлэг (draft.form). */
export type QuickDraftRecordForm = PropertyFormState & { quick_meta?: QuickMeta };

/**
 * Ноорогийн хувийн (vault) хэсэг. Бүрэн формын CreateDraftPrivate-ийн түлхүүрүүдтэй нийцтэй:
 * owner_phone-ийг бүрэн форм «шуурхай бүртгэлд бичсэн дугаар» гэж уншина.
 */
export type QuickPrivate = {
  owner_phone?: string;
  owner_draft?: OwnerDraft | null;
  address_detail?: string;
  owner_note?: string;
  showing_instructions?: string;
  [key: string]: unknown;
};

export const EMPTY_META: QuickMeta = { typed: [], pasted: false, offline: false };

/** Шинэ шуурхай маягт: орон сууц; листлэгч = өөрөө; гэрээний агент хоосон (гэрээний цонх тавина). */
export function emptyQuickForm(me: string, panel: QuickPanel): QuickForm {
  const base = emptyPropertyForm(me);
  return {
    ...base,
    contract_agent_id: "",
    // Оффисын панельд листлэгч анхдагчаар — шалгах шаардлагатай.
    unconfirmed: panel === "office" ? ["listing_agent_id"] : [],
  };
}

export function emptyQuickState(me: string, panel: QuickPanel): QuickState {
  return { form: emptyQuickForm(me, panel), meta: { ...EMPTY_META, typed: [] } };
}

// ── Талбар засах ───────────────────────────────────────────────────────────

/** Агентын бичсэн утга: тавина, баталгаажсанд тооцно, «бичсэн» гэж тэмдэглэнэ. */
export function setTyped<K extends keyof QuickForm>(s: QuickState, key: K, value: QuickForm[K]): QuickState {
  const form = { ...s.form, [key]: value, unconfirmed: confirmFields(s.form.unconfirmed, [key as string]) };
  return { form, meta: markTyped(s.meta, [key as string]) };
}

/** Ангилал сонгох: үнийн хугацааг ангиллын анхдагч болгоно (бичсэн бол хэвээр). */
export function setCategory(s: QuickState, category: Crm2PropertyCategory): QuickState {
  const form = withCategory(s.form, category);
  return {
    form: { ...form, unconfirmed: confirmFields(form.unconfirmed, ["category"]) },
    meta: markTyped(s.meta, ["category"]),
  };
}

export function markTyped(meta: QuickMeta, keys: readonly string[]): QuickMeta {
  const set = new Set(meta.typed);
  let changed = false;
  for (const k of keys) {
    if (!set.has(k)) {
      set.add(k);
      changed = true;
    }
  }
  return changed ? { ...meta, typed: [...set] } : meta;
}

/** «Зөв» — утгыг өөрчлөхгүйгээр баталгаажуулна. */
export function confirmKeys(s: QuickState, keys: readonly string[]): QuickState {
  return { ...s, form: { ...s.form, unconfirmed: confirmFields(s.form.unconfirmed, keys) } };
}

export function isAuto(form: Pick<QuickForm, "unconfirmed">, formKey: string): boolean {
  const k = unconfirmedKeyOf(formKey);
  return !!k && form.unconfirmed.includes(k);
}

function addUnconfirmed(list: readonly string[], formKeys: readonly string[]): string[] {
  const keys = formKeys.map(unconfirmedKeyOf).filter((k): k is string => !!k);
  return normalizeUnconfirmed([...list, ...keys]);
}

// ── Наалт / хуваалцсан бичвэр (P9) ─────────────────────────────────────────

/** Үнийн бүлэг: нэг шар мөрөөр «Үнийг шалгана уу» — нэг «Зөв» дөрвүүлийг баталгаажуулна. */
export const PRICE_GROUP_KEYS = ["price", "currency", "price_basis", "price_period"] as const;

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Талбарыг санал бөглөж болох эсэх: агент бичээгүй, утга нь хоосон (эсвэл хөндөөгүй анхдагч). */
function fillable(s: QuickState, key: keyof QuickForm, defaults: QuickForm): boolean {
  if (s.meta.typed.includes(key as string)) return false;
  const v = s.form[key];
  if (isBlank(v)) return true;
  // Хөндөөгүй анхдагч (жишээ нь урьдчилан сонгосон «Орон сууц») — санал дарж болно.
  return key === "property_type" && v === defaults[key];
}

const numText = (n: number | undefined | null) => (n == null || !Number.isFinite(n) ? "" : String(n));

export type PasteContext = {
  me: string;
  panel: QuickPanel;
  /** Оффисын property.types — мэдэгдэхгүй төрлийг тавихгүй. */
  typeKeys: readonly string[];
  /** Төслийн нэр (id → нэр) — parse-ийн ctx.projects. */
  projects: readonly { id: string; name: string }[];
};

export type PasteMerge = {
  state: QuickState;
  /** Бөглөсөн маягтын түлхүүрүүд. */
  filled: string[];
  /** Үнийн бүлэг бөглөгдсөн («Үнийг шалгана уу» мөр). */
  price: boolean;
};

/**
 * Задалсан талбаруудыг ЗӨВХӨН хоосон талбарт бөглөнө (бичсэн утгыг хэзээ ч дарахгүй),
 * бөглөсөн бүгдийг unconfirmed-д нэмнэ. Утас хэзээ ч талбарт орохгүй (parse нь өөрөө хасна).
 */
export function mergeParsed(s: QuickState, parsed: ParsedListingFields, ctx: PasteContext): PasteMerge {
  const defaults = emptyQuickForm(ctx.me, ctx.panel);
  let form: QuickForm = { ...s.form };
  const filled: string[] = [];
  const can = (k: keyof QuickForm) => fillable({ form, meta: s.meta }, k, defaults);
  const put = <K extends keyof QuickForm>(k: K, v: QuickForm[K]) => {
    form = { ...form, [k]: v };
    filled.push(k as string);
  };

  if (parsed.category && can("category")) {
    form = withCategory(form, parsed.category);
    filled.push("category");
  }
  if (parsed.property_type && ctx.typeKeys.includes(parsed.property_type) && can("property_type") && parsed.property_type !== form.property_type) {
    put("property_type", parsed.property_type);
  }
  if (can("project_name")) {
    if (parsed.project_id) {
      const p = ctx.projects.find((x) => x.id === parsed.project_id);
      if (p) {
        form = { ...form, project_id: p.id, project_name: p.name };
        filled.push("project_name");
      }
    } else if (parsed.project_name?.trim()) {
      form = { ...form, project_id: null, project_name: parsed.project_name.trim().slice(0, 120) };
      filled.push("project_name");
    }
  }
  if (parsed.district && can("district")) put("district", parsed.district);
  if (parsed.area_m2 != null && can("area_m2")) put("area_m2", numText(parsed.area_m2));
  if (parsed.rooms != null && can("rooms")) put("rooms", numText(parsed.rooms));
  if (parsed.floor != null && can("floor")) put("floor", numText(parsed.floor));
  if (parsed.building_floors != null && can("building_floors")) put("building_floors", numText(parsed.building_floors));
  if (parsed.year_in_use != null && can("year_in_use")) put("year_in_use", numText(parsed.year_in_use));
  if (parsed.parking_spaces != null && can("parking_spaces")) put("parking_spaces", numText(parsed.parking_spaces));
  if (parsed.rent_advance_months != null && can("rent_advance_months")) put("rent_advance_months", numText(parsed.rent_advance_months));
  if (parsed.rent_deposit_months != null && can("rent_deposit_months")) put("rent_deposit_months", numText(parsed.rent_deposit_months));
  if (parsed.features?.length && can("features")) put("features", [...new Set(parsed.features)]);

  // Үнэ: бүлгээрээ — агент үнэ, валют, суурь, хугацааны аль нэгийг бичсэн бол бүхэлд нь алгасна.
  let price = false;
  const priceTyped = PRICE_GROUP_KEYS.some((k) => s.meta.typed.includes(k));
  if (parsed.price != null && parsed.price > 0 && !priceTyped && isBlank(form.price)) {
    form = { ...form, price: numText(parsed.price) };
    filled.push("price");
    if (parsed.currency) {
      form = { ...form, currency: parsed.currency };
      filled.push("currency");
    }
    if (parsed.price_basis) {
      form = { ...form, price_basis: parsed.price_basis };
      filled.push("price_basis");
    }
    if (parsed.price_period) {
      form = { ...form, price_period: parsed.price_period };
      filled.push("price_period");
    }
    price = true;
  }

  form = { ...form, unconfirmed: addUnconfirmed(form.unconfirmed, filled) };
  return { state: { form, meta: filled.length ? { ...s.meta, pasted: true } : s.meta }, filled, price };
}

/**
 * Наасан бичвэрийн далдалсан үлдэгдэл → дотоод тэмдэглэл (хоосон бол) ба field_notes.source_text (≤2000).
 * Тэмдэглэлийг агент бичсэн бол хөндөхгүй.
 */
export function applySourceText(s: QuickState, restMasked: string): QuickState {
  const text = restMasked.replace(/\s+/g, " ").trim().slice(0, SOURCE_TEXT_MAX);
  if (!text) return s;
  let form: QuickForm = { ...s.form, field_notes: { ...s.form.field_notes, source_text: text } };
  if (!s.meta.typed.includes("notes") && isBlank(form.notes)) {
    form = { ...form, notes: text, unconfirmed: addUnconfirmed(form.unconfirmed, ["notes"]) };
  }
  return { form, meta: { ...s.meta, pasted: true } };
}

/** Үнийн бүлэгт баталгаажаагүй түлхүүр байгаа эсэх. */
export function priceNeedsCheck(form: Pick<QuickForm, "unconfirmed">): boolean {
  return PRICE_GROUP_KEYS.some((k) => form.unconfirmed.includes(k));
}

/** «350 сая · нийт · ₮», «2.5 сая · сарын · ₮», «$1 200 · нийт · $». */
export function priceSummary(form: Pick<QuickForm, "price" | "currency" | "price_basis" | "price_period">): string {
  const n = Number(String(form.price).replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  const amount = form.currency === "USD" ? `$${groupDigits(n)}` : shortAmount(n);
  const basis = form.price_basis === "per_m2" ? "м²-ийн" : form.price_period === "month" ? "сарын" : form.price_period === "day" ? "өдрийн" : "нийт";
  const per = form.price_basis === "per_m2" && form.price_period !== "total" ? ` · ${form.price_period === "month" ? "сарын" : "өдрийн"}` : "";
  return `${amount} · ${basis}${per} · ${form.currency === "USD" ? "$" : "₮"}`;
}

// ── Төслийн санал ──────────────────────────────────────────────────────────

export type ProjectHintValues = { district: string | null; building_floors: number | null };

/** Төсөл сонгоход хоосон дүүрэг, барилгын давхарт санал (шар, unconfirmed). Бичсэнийг дарахгүй. */
export function applyProjectHints(s: QuickState, hints: ProjectHintValues | null, districts: readonly string[]): QuickState {
  if (!hints) return s;
  const defaults = emptyPropertyForm(null);
  let form = { ...s.form };
  const filled: string[] = [];
  if (hints.district && districts.includes(hints.district) && fillable({ form, meta: s.meta }, "district", defaults)) {
    form = { ...form, district: hints.district };
    filled.push("district");
  }
  if (hints.building_floors != null && hints.building_floors > 0 && fillable({ form, meta: s.meta }, "building_floors", defaults)) {
    form = { ...form, building_floors: String(hints.building_floors) };
    filled.push("building_floors");
  }
  if (!filled.length) return s;
  return { ...s, form: { ...form, unconfirmed: addUnconfirmed(form.unconfirmed, filled) } };
}

// ── Сүүлийн төслүүд (localStorage, сүлжээгүй үед санал) ────────────────────

export type RecentProject = { id: string; name: string; district: string | null };
export const RECENT_PROJECTS_MAX = 20;

/** Хэрэглэгч бүрийн түлхүүр — «crm2:» угтвартай тул гарахад цэвэрлэгдэнэ. Эзний мэдээлэл ОГТ үгүй. */
export function recentProjectsKey(profileId: string): string {
  return `crm2:recent-projects:${profileId}`;
}

export function parseRecentProjects(raw: string | null): RecentProject[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: RecentProject[] = [];
    for (const r of v) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      if (typeof o.id !== "string" || !o.id || typeof o.name !== "string" || !o.name.trim()) continue;
      out.push({ id: o.id, name: o.name.slice(0, 120), district: typeof o.district === "string" && o.district ? o.district : null });
      if (out.length >= RECENT_PROJECTS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function pushRecentProject(list: readonly RecentProject[], p: RecentProject, max = RECENT_PROJECTS_MAX): RecentProject[] {
  const prev = list.find((x) => x.id === p.id);
  const entry: RecentProject = { id: p.id, name: p.name, district: p.district ?? prev?.district ?? null };
  return [entry, ...list.filter((x) => x.id !== p.id)].slice(0, max);
}

/** Бичсэн хэсгээр (нугалсан) шүүнэ; хоосон бол бүгд. */
export function filterRecentProjects(list: readonly RecentProject[], query: string, limit = 6): RecentProject[] {
  const q = foldSearchText(query);
  const rows = q ? list.filter((p) => foldSearchText(p.name).includes(q)) : [...list];
  return rows.slice(0, limit);
}

/** Сүлжээний санал + кэш (давхардалгүй, сүлжээнийх эхэнд). */
export function mergeProjectSuggestions<T extends { key: string; label: string; hint?: string }>(
  remote: readonly T[],
  recent: readonly RecentProject[],
  limit = 10
): { key: string; label: string; hint?: string }[] {
  const seen = new Set(remote.map((r) => r.key));
  const out: { key: string; label: string; hint?: string }[] = [...remote];
  for (const p of recent) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ key: p.id, label: p.name, hint: p.district ?? "Сүүлд" });
  }
  return out.slice(0, limit);
}

// ── Дүүргийн товч ──────────────────────────────────────────────────────────

/** Дүүргийн товчнууд: төслийн дүүрэг, одоогийн утга, сүүлийн 3 (давхардалгүй, оффисын жагсаалтаас). */
export function districtChips(opts: {
  current: string;
  projectDistrict: string | null;
  recent: readonly string[];
  districts: readonly string[];
  max?: number;
}): string[] {
  const out: string[] = [];
  const add = (d: string | null | undefined) => {
    if (!d || !opts.districts.includes(d) || out.includes(d)) return;
    out.push(d);
  };
  add(opts.current);
  add(opts.projectDistrict);
  for (const d of opts.recent) add(d);
  return out.slice(0, opts.max ?? 4);
}

// ── Ноорог ↔ төлөв ─────────────────────────────────────────────────────────

function metaOf(v: unknown): QuickMeta {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...EMPTY_META, typed: [] };
  const o = v as Record<string, unknown>;
  return {
    typed: Array.isArray(o.typed) ? o.typed.filter((k): k is string => typeof k === "string").slice(0, 80) : [],
    pasted: o.pasted === true,
    offline: o.offline === true,
  };
}

function ownerDraftOf(v: unknown): OwnerDraft | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    phone: text(o.phone),
    name: text(o.name),
    source: typeof o.source === "string" && o.source ? o.source : null,
    sourceGuessed: o.sourceGuessed === true,
    sourceNote: text(o.sourceNote),
    chosenContactId: typeof o.chosenContactId === "string" && o.chosenContactId ? o.chosenContactId : null,
    allowDuplicate: o.allowDuplicate === true,
  };
}

export type RestoredQuick = {
  state: QuickState;
  /** Эзний талбарын анхны утга (vault). */
  owner: OwnerDraft | null;
  /** Бүрэн формын хувийн талбарууд (хадгалахдаа дамжуулна). */
  privateRest: QuickPrivate;
};

/**
 * Хадгалсан ноорог (шуурхай эсвэл бүрэн формынх) → шуурхай төлөв. Мэдэгдэхгүй түлхүүр, буруу
 * төрлийг хаяна (fromCreateDraft). Бүрэн формд сонгосон эзэн (owner) байвал утсыг нь авна.
 */
export function restoreQuick(storedForm: unknown, storedPrivate: unknown, me: string): RestoredQuick {
  const r = fromCreateDraft(storedForm, storedPrivate, me);
  const raw = storedForm && typeof storedForm === "object" ? (storedForm as Record<string, unknown>) : {};
  const meta = metaOf(raw.quick_meta);
  const priv = (storedPrivate && typeof storedPrivate === "object" && !Array.isArray(storedPrivate) ? storedPrivate : {}) as QuickPrivate;
  let owner = ownerDraftOf(priv.owner_draft);
  if (!owner && r.priv.owner) {
    owner = {
      phone: r.priv.owner.phone ?? "",
      name: "",
      source: null,
      sourceGuessed: false,
      sourceNote: "",
      chosenContactId: r.priv.owner.id,
      allowDuplicate: false,
    };
  } else if (!owner && r.quickPhone) {
    owner = { phone: r.quickPhone, name: "", source: null, sourceGuessed: false, sourceNote: "", chosenContactId: null, allowDuplicate: false };
  }
  // Бүрэн формын гэрээ/медиа холбоос зэрэг үл хамаарах хэсгийг шуурхайд авахгүй — хувийнхыг л дамжуулна.
  const { owner_draft: _drop, ...privateRest } = priv;
  void _drop;
  return { state: { form: r.form, meta }, owner, privateRest };
}

/** Төлөв → ноорогийн нийтийн хэсэг (хувийн талбаргүй — address_detail хувийнд). */
export function toDraftForm(s: QuickState): QuickDraftRecordForm {
  return { ...s.form, address_detail: "", quick_meta: s.meta };
}

/**
 * Төлөв → ноорогийн хувийн хэсэг. owner_phone — бүрэн форм «шуурхайд бичсэн дугаар» гэж уншина
 * (холбогдсон харилцагчгүй үед). Бүрэн формын бусад хувийн талбарыг хадгална.
 */
export function toDraftPrivate(s: QuickState, owner: OwnerDraft | null, rest: QuickPrivate = {}): QuickPrivate {
  const out: QuickPrivate = { ...rest };
  delete out.owner_phone;
  delete out.owner_draft;
  const phone = owner?.phone.trim() ?? "";
  if (owner && (phone || owner.chosenContactId || owner.name.trim())) out.owner_draft = owner;
  if (phone && !owner?.chosenContactId) out.owner_phone = phone;
  const addr = s.form.address_detail.trim();
  if (addr) out.address_detail = s.form.address_detail;
  else delete out.address_detail;
  return out;
}

/** Ноорогийн жагсаалтын товч нэр: зөвхөн төсөл/дүүрэг (эзний мэдээлэл ХЭЗЭЭ Ч үгүй). */
export function titleParts(form: Pick<QuickForm, "project_name" | "district">): { project: string; district: string } {
  return { project: form.project_name.trim(), district: form.district.trim() };
}

// ── Илгээх ─────────────────────────────────────────────────────────────────

/** Шуурхай маягтын нийтийн хэсэг → quick-payload-ийн оролт. */
export function toQuickDraftForm(s: QuickState, clientKey: string, source: DraftSource): QuickDraftForm {
  const f = s.form;
  return {
    clientKey,
    source: source === "paste" || source === "share" ? source : s.meta.pasted ? "paste" : "manual",
    category: f.category || null,
    property_type: f.property_type,
    project_id: f.project_id,
    project_name: f.project_name,
    district: f.district,
    location_text: f.location_text,
    address_detail: f.address_detail,
    lat: f.lat,
    lng: f.lng,
    pin_address: f.pin_address,
    area_m2: f.area_m2,
    rooms: f.rooms,
    floor: f.floor,
    building_floors: f.building_floors,
    price: f.price,
    currency: f.price ? f.currency : null,
    price_period: f.price ? f.price_period : null,
    price_basis: f.price ? f.price_basis : null,
    year_in_use: f.year_in_use,
    features: f.features,
    parking_spaces: f.parking_spaces,
    rent_advance_months: f.rent_advance_months,
    rent_deposit_months: f.rent_deposit_months,
    advantages: f.advantages,
    notes: f.notes,
    available_from: f.available_from,
    source_text: f.field_notes.source_text ?? null,
    listing_agent_id: f.listing_agent_id,
    photo_agent_id: f.photo_agent_id,
    unconfirmed: f.unconfirmed,
  };
}

/** Шуурхай төлөв + эзэн → POST body (buildQuickCreatePayload). */
export function quickPayload(
  s: QuickState,
  opts: { clientKey: string; source: DraftSource; owner: Crm2OwnerInput | null; privateRest?: QuickPrivate }
): QuickPayloadBuild {
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return buildQuickCreatePayload(toQuickDraftForm(s, opts.clientKey, opts.source), {
    owner: opts.owner,
    owner_note: text(opts.privateRest?.owner_note),
    showing_instructions: text(opts.privateRest?.showing_instructions),
  });
}

/** Хадгалах товч идэвхтэй эсэх: зөвхөн ангилал заавал. */
export function canSave(form: Pick<QuickForm, "category">): boolean {
  return form.category !== "";
}

/** Эзний төлөв эцсийн эсэх (эзэнгүй/холбогдсон/шинэ). Эцсийн бус үед хувийн хэсгийг утсан дээр үлдээнэ. */
export function ownerIsFinal(status: Crm2OwnerStatus | string | null | undefined, ownerSkipped = false): boolean {
  if (ownerSkipped) return false;
  if (!status) return true;
  return isOwnerFinal(status as Crm2OwnerStatus);
}

export type AfterSave =
  | { kind: "redirect"; sheet: "next" }
  | { kind: "notice"; ownerPending: boolean; duplicates: number; sheet: "owner" | "next" };

/** Хадгалсны дараа: харуулах зүйлгүй бол карт (?sheet=next) руу шууд; эзэн эцсийн биш бол ?sheet=owner. */
export function afterSave(opts: { ownerFinal: boolean; duplicates: number }): AfterSave {
  if (opts.ownerFinal && opts.duplicates === 0) return { kind: "redirect", sheet: "next" };
  return { kind: "notice", ownerPending: !opts.ownerFinal, duplicates: opts.duplicates, sheet: opts.ownerFinal ? "next" : "owner" };
}

// ── Ноорогийн жагсаалт ─────────────────────────────────────────────────────

/** «Дуусаагүй ноорог»: одоогийнхоос бусад, устгагдаагүй (шинэ нь эхэнд). */
export function otherDrafts(list: readonly DraftIndexEntry[], currentKey: string | null): DraftIndexEntry[] {
  return list.filter((e) => e.clientKey !== currentKey && !e.deletedAt).sort((a, b) => b.savedAt - a.savedAt);
}

/** Хэмжилт: шуурхай маягтад бөглөсөн талбарын тоо (утга биш, тоо). */
export function quickFieldsFilled(s: QuickState, hasOwner: boolean, photos: number): number {
  const f = s.form;
  const keys: (keyof QuickForm)[] = ["category", "project_name", "district", "location_text", "area_m2", "rooms", "floor", "building_floors", "price"];
  let n = keys.filter((k) => !isBlank(f[k])).length;
  if (f.lat !== null) n++;
  if (hasOwner) n++;
  if (photos > 0) n++;
  return n;
}

/** UNCONFIRMABLE_KEYS-ийн дагуу автоматаар бөглөсөн тоо (хэмжилт). */
export function autoCount(form: Pick<QuickForm, "unconfirmed">): number {
  return form.unconfirmed.filter((k) => (UNCONFIRMABLE_KEYS as readonly string[]).includes(k)).length;
}

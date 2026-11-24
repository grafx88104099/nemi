import type { z } from "zod";

import { MISSING_ITEM_LABEL } from "@/lib/crm2/labels";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Server action-ийн хариу ба DB алдааны текст. DB-ийн guard/RPC алдаа монголоор
 * «CRM: ...» хэлбэртэй — угтварыг хасаад шууд харуулна. Бусад (Postgres/PostgREST
 * англи) алдааг ерөнхий монгол текст болгоно.
 */

export const GENERIC_ERROR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
export const INPUT_ERROR = "Оролт буруу байна.";
export const NO_ACCESS_ERROR = "Энэ үйлдлийг хийх эрхгүй байна.";
export const NOT_FOUND_ERROR = "Бичлэг олдсонгүй эсвэл засах эрхгүй байна.";
export const AUTH_ERROR = "Нэвтэрнэ үү.";

const CRM_PREFIX = /^\s*CRM:\s*/;

type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null } | null | undefined;

/** «CRM: ...» угтвартай монгол алдааг цэвэрлэнэ; угтваргүй бол null. */
export function crmMessage(message: string | null | undefined): string | null {
  const m = (message ?? "").trim();
  if (!CRM_PREFIX.test(m)) return null;
  const text = m.replace(CRM_PREFIX, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

/** DB/PostgREST алдааг хэрэглэгчид харуулах монгол текст болгоно. */
export function dbErrorText(error: DbErrorLike): string {
  const crm = crmMessage(error?.message);
  if (crm) return crm;
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) return NO_ACCESS_ERROR;
  if (code === "23505") return "Ийм бичлэг аль хэдийн байна.";
  if (code === "23514" || code === "22P02" || code === "22003" || code === "22007" || code === "22008") {
    return "Оруулсан утга буруу байна. Талбаруудаа шалгана уу.";
  }
  if (code === "23503") return "Холбоотой бичлэг олдсонгүй.";
  if (code === "23502") return "Заавал бөглөх талбар дутуу байна.";
  if (code === "PGRST116") return NOT_FOUND_ERROR;
  return GENERIC_ERROR;
}

/**
 * DB алдааны мессежийн хэсэг эсвэл constraint нэр → маягтын талбарын түлхүүр (фокуслах, доор нь
 * алдааг харуулах). Эхний таарсан мөр хэрэглэгдэнэ — тусгай мөрийг ерөнхийн өмнө байрлуулна.
 */
const DB_ERROR_FIELDS: readonly (readonly [RegExp, string, string?])[] = [
  // Хөрөнгө (crm2_properties_guard, check constraint)
  [/дүүрэг жагсаалтад алга/i, "district"],
  [/бүртгэлгүй онцлог/i, "features"],
  [/нэг агент хэд хэдэн үүрэг/i, "contract_agent_id"],
  [/томилогдсон үүрэгт агентыг/i, "listing_agent_id"],
  [/crm2_properties_floor/, "floor", "Давхар барилгын давхраас их байж болохгүй."],
  [/crm2_properties_per_m2/, "area_m2", "м²-ийн үнэтэй бол хэмжээг оруулна уу."],
  [/crm2_properties_pin/, "lat", "Газрын зургийн цэгийг дахин тавина уу."],
  [/crm2_properties_parking_spaces_chk/, "parking_spaces"],
  [/crm2_properties_rent_terms_chk/, "rent_advance_months"],
  // Харилцагч (эзэн)
  [/эх сурвалж жагсаалтад алга|crm2_contacts_source_chk/i, "owner.source"],
  [/crm2_contacts_source_note_chk/, "owner.source_note"],
  // Зуучлалын гэрээ
  [/дугаартай гэрээ аль хэдийн бүртгэлтэй|гэрээний дугаар хоосон/i, "number"],
  [/crm2_brokerage_dates/, "end_date", "Дуусах огноо эхлэх огнооноос өмнө байж болохгүй."],
  [/crm2_brokerage_commission/, "commission_value", "Шимтгэлийн утга буруу байна."],
  [/crm2_brokerage_signer_note_chk|гарын үсэг зурах эрх/i, "signer_note"],
  [/гэрээний файлыг шалгаснаа/i, "file_checked"],
  // Нийтлэх (утасны дугаар гарчиг/тайлбарт эсвэл нийтлэх бичвэрт)
  [/утасны дугаар байна/i, "description"],
];

/** DB алдааны талбар (мэдэгдэхгүй бол null) ба хэрэглэгчид харуулах текст. */
export function dbErrorField(error: DbErrorLike): { field: string | null; text: string } {
  const hay = `${error?.message ?? ""} ${error?.details ?? ""}`;
  // «… дутуу: эхлэх огноо, шимтгэл» — эхний дутуу зүйлийн талбар.
  const missing = missingListField(error?.message);
  const hit = missing ? null : DB_ERROR_FIELDS.find(([re]) => re.test(hay));
  // «CRM: …» мессеж өөрөө тодорхой; constraint-ийн англи мессежийн оронд талбарын текст.
  const text = crmMessage(error?.message) ?? hit?.[2] ?? dbErrorText(error);
  return { field: missing ?? hit?.[1] ?? null, text };
}

/** crm2_missing_text-ийн код → маягтын талбар (кодоосоо өөр бол). */
const MISSING_ITEM_FIELD: Record<string, string> = {
  pin: "lat",
  project: "project_id",
  owner: "owner",
  owner_source: "owner.source",
  owner_name: "owner.full_name",
  owner_pending: "owner",
  images: "images",
  unconfirmed: "unconfirmed",
  brokerage_contract: "contract",
  end_date_past: "end_date",
  commission: "commission_value",
  file: "file",
  special_terms: "terms",
  signer_authority: "signer_note",
  defaults_unconfirmed: "prefilled",
  ownership_doc: "ownership_doc",
  role_unconfirmed: "contract_agent_id",
};

const LABEL_TO_ITEM = new Map(Object.entries(MISSING_ITEM_LABEL).map(([k, v]) => [v, k] as const));

function missingListField(message: string | null | undefined): string | null {
  const m = /дутуу:\s*(.+)$/.exec(message ?? "");
  if (!m) return null;
  const first = m[1].split(", ")[0]?.trim() ?? "";
  const item = LABEL_TO_ITEM.get(first);
  return item ? (MISSING_ITEM_FIELD[item] ?? item) : null;
}

export function ok<T>(data: T): Crm2Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string): Crm2Result<T> {
  return { ok: false, error };
}

/** DB алдааг лог руу бичээд хариу болгоно. */
export function dbFail<T = never>(where: string, error: DbErrorLike): Crm2Result<T> {
  console.error(`crm2 ${where}:`, error?.message ?? error);
  return fail(dbErrorText(error));
}

/** undefined утгатай түлхүүрийг хасна (PATCH-д зөвхөн өгсөн талбар). */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Zod-ийн эхний алдааны монгол текст (англи анхдагч текстийг ерөнхий болгоно). */
export function zodErrorText(err: z.ZodError): string {
  const msg = err.issues[0]?.message;
  if (!msg) return INPUT_ERROR;
  // Зөвхөн бидний бичсэн (кирилл) мессежийг харуулна.
  return /[Ѐ-ӿ]/.test(msg) ? msg : INPUT_ERROR;
}

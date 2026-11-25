import { MUST_HAVE_MAX, REQUIREMENT_LIST_MAX, REQUIREMENT_LOCATION_MAX } from "@/lib/crm2/limits";
import { parseNumberText } from "@/lib/number-input";
import { z } from "zod";

import { ubInputToIso, isIsoDate } from "@/lib/crm2/datetime";
import { isFullPhone, isValidPhone } from "@/lib/crm2/phone";
import { UNCONFIRMABLE_KEYS } from "@/lib/crm2/checklist";
import { UI_EVENTS, UI_FLOWS } from "@/lib/crm2/feature-flags";
import {
  BROKERAGE_FILE_KINDS,
  CONTACT_CONSENTS,
  CURRENCIES,
  DEAL_STAGES,
  PRICE_BASES,
  PRICE_PERIODS,
  PROPERTY_CATEGORIES,
  PROPERTY_STATUSES,
  RECORD_STATUSES,
  TASK_KINDS,
  TASK_STATUSES,
  VIEW_NOTE_LABEL,
} from "@/lib/crm2/labels";
import { CRM2_SETTING_KEYS } from "@/lib/crm2/settings";

/**
 * CRM v2 server action-ийн оролтын zod схемүүд (цэвэр модуль — тест, клиент маягт
 * ч ашиглана). DB-ийн check/guard-ыг давхардуулж эрт, монголоор анхааруулна;
 * эцсийн шалгалт DB дээр. Хамгаалагдсан багана (төлөв, батлалт, код, хариуцагч)
 * энд огт байхгүй — z.object үл мэдэх түлхүүрийг хасна.
 */

// ── Суурь ──────────────────────────────────────────────────────────────────

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
// Таслал нь мянгатын тусгаарлагч ч, бутархайн тэмдэг ч байж болох тул байрлалаар
// нь ялгана (lib/number-input.ts). Таниагүй бол бичвэрээр нь үлдээж, доорх
// z.number() монголоор алдаа өгнө.
const toNumber = (v: unknown) => {
  if (typeof v !== "string") return v;
  if (v.trim() === "") return null;
  return parseNumberText(v) ?? v;
};

export const idSchema = z.guid("Буруу холбоос (id).");
const optId = z.preprocess(emptyToNull, idSchema.nullable().optional());

/** Хоосон мөр → null; урт хязгаартай. */
const optText = (max: number, label = "Текст") =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `${label} ${max} тэмдэгтээс ихгүй.`).nullable().optional());

const reqText = (max: number, label: string) =>
  z.string({ error: `${label} оруулна уу.` }).trim().min(1, `${label} оруулна уу.`).max(max, `${label} ${max} тэмдэгтээс ихгүй.`);

const optNumber = (opts: { min?: number; max?: number; int?: boolean; label: string; gt?: number; lt?: number }) => {
  let n = z.number({ error: `${opts.label} тоо байна.` });
  if (opts.int) n = n.int(`${opts.label} бүхэл тоо байна.`);
  if (opts.min !== undefined) n = n.min(opts.min, `${opts.label} ${opts.min}-аас бага байж болохгүй.`);
  if (opts.max !== undefined) n = n.max(opts.max, `${opts.label} ${opts.max}-аас их байж болохгүй.`);
  if (opts.gt !== undefined) n = n.gt(opts.gt, `${opts.label} ${opts.gt}-аас их байна.`);
  if (opts.lt !== undefined) n = n.lt(opts.lt, `${opts.label} хэт их байна.`);
  return z.preprocess(toNumber, n.nullable().optional());
};

/** «YYYY-MM-DD» огноо. */
const optDate = (label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().refine(isIsoDate, `${label} буруу (ОООО-СС-ӨӨ).`).nullable().optional()
  );

/** Огноо+цаг: УБ-ын «YYYY-MM-DDTHH:mm» эсвэл бүстэй ISO → ISO (UTC). */
const ubDateTime = (label: string) =>
  z
    .string({ error: `${label} оруулна уу.` })
    .transform((v, ctx) => {
      const iso = ubInputToIso(v);
      if (!iso) {
        ctx.addIssue({ code: "custom", message: `${label} буруу байна.` });
        return z.NEVER;
      }
      return iso;
    });
const optDateTime = (label: string) => z.preprocess(emptyToNull, ubDateTime(label).nullable().optional());

const FUTURE_SLACK_MS = 15 * 60_000;
const notFuture = (iso: string | null | undefined) => !iso || Date.parse(iso) <= Date.now() + FUTURE_SLACK_MS;

const categoryEnum = z.enum(PROPERTY_CATEGORIES, { error: "Ангиллыг сонгоно уу." });
const currencyEnum = z.enum(CURRENCIES, { error: "Валют буруу." });
const periodEnum = z.enum(PRICE_PERIODS, { error: "Үнийн хугацаа буруу." });
const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Түлхүүрийн хэлбэр буруу.");

// ── Хөрөнгө ────────────────────────────────────────────────────────────────

const propertyShape = {
  category: categoryEnum,
  property_type: z.preprocess(emptyToNull, keySchema.nullable().optional()),
  project_id: optId,
  district: optText(60, "Дүүрэг"),
  location_text: optText(200, "Байршил"),
  address_detail: optText(1000, "Байршлын дэлгэрэнгүй"),
  lat: optNumber({ min: -90, max: 90, label: "Өргөрөг" }),
  lng: optNumber({ min: -180, max: 180, label: "Уртраг" }),
  pin_address: optText(300, "Pin-ий хаяг"),
  area_m2: optNumber({ gt: 0, lt: 10_000_000, label: "Хэмжээ" }),
  rooms: optNumber({ int: true, min: 0, max: 100, label: "Өрөөний тоо" }),
  floor: optNumber({ int: true, min: -10, max: 300, label: "Давхар" }),
  building_floors: optNumber({ int: true, min: 1, max: 300, label: "Барилгын давхар" }),
  price: optNumber({ min: 0, lt: 1e14, label: "Үнэ" }),
  currency: currencyEnum.optional(),
  price_period: periodEnum.optional(),
  price_basis: z.enum(PRICE_BASES, { error: "Үнийн суурь буруу." }).optional(),
  year_in_use: optNumber({ int: true, min: 1900, max: 2100, label: "Ашиглалтад орсон он" }),
  operating_cost: optNumber({ min: 0, lt: 1e12, label: "Ашиглалтын зардал" }),
  operating_cost_currency: currencyEnum.optional(),
  operating_cost_period: periodEnum.optional(),
  operating_cost_note: optText(1000, "Зардлын тайлбар"),
  condition: optText(4000, "Нөхцөл"),
  view_note: optText(4000, VIEW_NOTE_LABEL),
  notes: optText(8000, "Нэмэлт тайлбар"),
  advantages: optText(4000, "Давуу тал"),
  features: z.array(keySchema).max(40, "Онцлог 40-өөс ихгүй.").optional(),
  field_notes: z
    .record(z.string().max(40), z.string().max(2000, "Талбарын тайлбар 2000 тэмдэгтээс ихгүй."))
    // DB: pg_column_size(field_notes) <= 16000 байт — кирилл үсэг UTF-8-д 2 байт тул байтаар хэмжинэ
    // (jsonb-ийн толгой, түлхүүрийн зардалд ~1000 байт үлдээнэ).
    .refine((o) => Object.keys(o).length <= 20, "Талбарын тайлбар хэт олон.")
    .refine(
      (o) => new TextEncoder().encode(JSON.stringify(o)).length <= 15000,
      "Талбарын тайлбарууд нийлээд хэт урт (кирилл үсгээр ойролцоогоор 7000 тэмдэгтээс ихгүй)."
    )
    .optional(),
  available_from: optDate("Боломжтой огноо"),
  availability_note: optText(1000, "Боломжийн тайлбар"),
  listing_agent_id: optId,
  contract_agent_id: optId,
  photo_agent_id: optId,
  parking_spaces: optNumber({ int: true, min: 0, max: 50, label: "Зогсоолын тоо" }),
  rent_advance_months: optNumber({ int: true, min: 0, max: 24, label: "Урьдчилгаа (сар)" }),
  rent_deposit_months: optNumber({ int: true, min: 0, max: 24, label: "Барьцаа (сар)" }),
  /**
   * Автоматаар бөглөгдсөн, баталгаажаагүй талбарууд. Засахад зөвхөн БАГАСГАЖ болно — нэмэхийг DB
   * (crm2_properties_origin_guard) татгалзана; нэмэх нь зөвхөн quick create / import RPC.
   */
  unconfirmed: z
    .array(z.enum(UNCONFIRMABLE_KEYS, { error: "Баталгаажуулах талбар буруу." }))
    .max(40, "Баталгаажаагүй талбар хэт олон.")
    .optional(),
};

/** Хөрөнгийг хаанаас бүртгэсэн (клиентээс; 'listing'-ийг зөвхөн импорт RPC тавина). */
export const PROPERTY_CLIENT_SOURCES = ["manual", "paste", "share"] as const;
const clientSourceEnum = z.enum(PROPERTY_CLIENT_SOURCES, { error: "Эх сурвалж буруу." });

type PropertyCheck = {
  lat?: number | null;
  lng?: number | null;
  floor?: number | null;
  building_floors?: number | null;
  price_basis?: string;
  area_m2?: number | null;
};

function checkProperty(v: PropertyCheck, ctx: z.RefinementCtx, isCreate = false) {
  const latSet = v.lat !== undefined;
  const lngSet = v.lng !== undefined;
  if (latSet !== lngSet || (latSet && (v.lat === null) !== (v.lng === null))) {
    ctx.addIssue({ code: "custom", path: ["lat"], message: "Газрын зургийн цэгийн өргөрөг, уртрагийг хамт өгнө." });
  }
  if (v.floor != null && v.building_floors != null && v.floor > v.building_floors) {
    ctx.addIssue({ code: "custom", path: ["floor"], message: "Давхар барилгын давхраас их байж болохгүй." });
  }
  if (v.price_basis === "per_m2" && (v.area_m2 === null || (isCreate && v.area_m2 === undefined))) {
    ctx.addIssue({ code: "custom", path: ["area_m2"], message: "м²-ийн үнэтэй бол хэмжээг оруулна уу." });
  }
}

/** Хувийн талбар (эзэн, эзний тэмдэглэл, үзүүлэх заавар). */
export const propertyPrivateSchema = z.object({
  owner_contact_id: optId,
  owner_note: optText(4000, "Эзний тэмдэглэл"),
  showing_instructions: optText(4000, "Үзүүлэх заавар"),
});
export type PropertyPrivateInput = z.input<typeof propertyPrivateSchema>;

/**
 * Шинэ хөрөнгө (ноорог). project_name өгвөл crm2_ensure_project-оор холбоно.
 * client_key — төхөөрөмжийн ноорогийн түлхүүр (давтан илгээлт = нэг хөрөнгө), source — хэмжилтэд.
 */
export const propertyCreateSchema = z
  .object({
    ...propertyShape,
    project_name: optText(120, "Төслийн нэр"),
    client_key: idSchema.optional(),
    source: clientSourceEnum.optional(),
    private: propertyPrivateSchema.optional(),
  })
  .superRefine((v, ctx) => checkProperty(v, ctx, true));
export type PropertyCreateInput = z.input<typeof propertyCreateSchema>;

/** Хөрөнгө засах (зөвхөн өгсөн талбар). Төлөв, код, баталгаажуулалт энд орохгүй. */
export const propertyUpdateSchema = z
  .object({ ...propertyShape, category: categoryEnum.optional(), project_name: optText(120, "Төслийн нэр") })
  .superRefine((v, ctx) => checkProperty(v, ctx));
export type PropertyUpdateInput = z.input<typeof propertyUpdateSchema>;

// ── Эзэн (утас эхэлсэн нэг бүрэлдэхүүн, P6) ───────────────────────────────

/** RPC (crm2_resolve_owner)-тэй ижил: жигдрүүлсэн 8 ба түүнээс олон цифр. */
const ownerPhone = z
  .string({ error: "Дугаар 8 оронтой байх ёстой" })
  .trim()
  .max(40, "Утасны дугаар хэт урт.")
  .refine(isFullPhone, "Дугаар 8 оронтой байх ёстой");

/** Сонгосон харилцагч (зөвхөн ингэж холбогдоно). */
export const ownerContactSchema = z.object({ contact_id: idSchema });

/** Шинэ/хайх эзэн: утас заавал; нэргүй бол «Нэр баталгаажаагүй». allow_duplicate = «Өөр хүн». */
export const ownerNewSchema = z
  .object({
    phone: ownerPhone,
    full_name: optText(160, "Нэр"),
    source: z.preprocess(emptyToNull, keySchema.nullable().optional()),
    source_note: optText(200, "Эх сурвалжийн тайлбар"),
    allow_duplicate: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.source === "other" && !v.source_note) {
      ctx.addIssue({ code: "custom", path: ["source_note"], message: "«Бусад» эх сурвалжийн тайлбарыг бичнэ үү." });
    }
  });

export const ownerInputSchema = z.union([ownerContactSchema, ownerNewSchema]);
export type OwnerInput = z.input<typeof ownerInputSchema>;

/** setPropertyOwner: эзэн оноох эсвэл хүлээгдэж буй эзнийг цэвэрлэх ({ clear: true }). */
export const ownerSetSchema = z.union([ownerInputSchema, z.object({ clear: z.literal(true) })]);
export type OwnerSetInput = z.input<typeof ownerSetSchema>;

// ── Шуурхай бүртгэл (P8) ───────────────────────────────────────────────────

/**
 * crm2_create_property_quick-ийн оролт: хөрөнгө (propertyCreateSchema-ийн талбарууд + client_key заавал),
 * эзэн (сонголттой), хувийн тэмдэглэл. Давхар, м²-ийн үнийн дүрэм бүрэн формтой ижил (checkProperty).
 */
export const quickCreateSchema = z.object({
  property: z
    .object({
      ...propertyShape,
      project_name: optText(120, "Төслийн нэр"),
      client_key: idSchema,
      source: clientSourceEnum.default("manual"),
    })
    .superRefine((v, ctx) => checkProperty(v, ctx, true)),
  owner: ownerInputSchema.nullable().optional(),
  private: z
    .object({
      owner_note: optText(4000, "Эзний тэмдэглэл"),
      showing_instructions: optText(4000, "Үзүүлэх заавар"),
    })
    .optional(),
});
export type QuickCreateInput = z.input<typeof quickCreateSchema>;
export type QuickCreatePayload = z.output<typeof quickCreateSchema>;

/** Автоматаар бөглөсөн утгыг «Зөв» гэж баталгаажуулах. */
export const confirmFieldsSchema = z.object({
  property_id: idSchema,
  keys: z
    .array(z.enum(UNCONFIRMABLE_KEYS, { error: "Баталгаажуулах талбар буруу." }))
    .min(1, "Баталгаажуулах талбараа сонгоно уу.")
    .max(40),
});

// ── Давхардал (P11) ────────────────────────────────────────────────────────

export const duplicateFlagSchema = z
  .object({
    property_id: idSchema,
    token: idSchema,
    kind: z.enum(["distinct", "access"], { error: "Төрөл буруу." }),
    note: optText(1000, "Тайлбар"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "distinct" && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Тусдаа хөрөнгө гэх шалтгааныг бичнэ үү." });
    }
  });
export type DuplicateFlagInput = z.input<typeof duplicateFlagSchema>;

export const resolveDuplicateSchema = z.object({
  flag_id: idSchema,
  status: z.enum(["distinct", "duplicate", "dismissed"], { error: "Шийдвэр буруу." }),
  note: optText(1000, "Тайлбар"),
});

// ── Миний зараас үүсгэх (P12) ──────────────────────────────────────────────

export const importListingSchema = z.object({
  listing_id: idSchema,
  client_key: idSchema.optional(),
});

// ── Хэмжилт (P2) ───────────────────────────────────────────────────────────

const msValue = (label: string) => optNumber({ int: true, min: 0, max: 86_400_000, label });

/**
 * crm2_ui_events: зөвхөн хугацаа, тоо, туг. meta-д нэр, утас, чөлөөт текст ОРОХГҮЙ
 * (түлхүүр = код, утга = тоо |x| < 10 000 000 эсвэл туг; DB guard-тай ижил).
 */
export const uiEventSchema = z.object({
  event: z.enum(UI_EVENTS, { error: "Үйл явдал буруу." }),
  flow: z.enum(UI_FLOWS).nullable().optional(),
  property_id: optId,
  duration_ms: msValue("Хугацаа"),
  first_input_ms: msValue("Хугацаа"),
  taps: optNumber({ int: true, min: 0, max: 10_000, label: "Товшилт" }),
  fields_filled: optNumber({ int: true, min: 0, max: 300, label: "Талбар" }),
  meta: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Түлхүүрийн хэлбэр буруу."),
      z.union([z.number().refine((n) => Number.isFinite(n) && Math.abs(n) < 10_000_000, "Тоо хэт их."), z.boolean()])
    )
    .refine((o) => Object.keys(o).length <= 12, "Нэмэлт утга хэт олон.")
    .optional(),
});
export type UiEventInput = z.input<typeof uiEventSchema>;

export const propertyStatusSchema = z
  .object({
    property_id: idSchema,
    status: z.enum(PROPERTY_STATUSES, { error: "Төлөв буруу." }),
    reason: optText(2000, "Шалтгаан"),
  });
export type PropertyStatusInput = z.input<typeof propertyStatusSchema>;

export const verifySchema = z.object({ property_id: idSchema, note: optText(2000, "Тэмдэглэл") });

export const projectNameSchema = reqText(120, "Төслийн нэр");

// ── Нийтийн зар ────────────────────────────────────────────────────────────

/**
 * Staff хөрөнгийг нийтэд зарлах. Нууцлалтай талбар (эзэн, үзүүлэх заавар,
 * дэлгэрэнгүй хаяг, дотоод тэмдэглэл, код, үүрэгт агент) энд ОГТ байхгүй —
 * зард гарах үзүүлэлтийг DB (crm2_listing_payload) хөрөнгөөс өөрөө авна.
 * Агентынх зөвхөн гарчиг, зарлалын текст ба тамгатай зураг.
 */

/** Зөвхөн нийтийн `listings` bucket-ийн хаяг (DB-ийн шалгалттай ижил). */
const LISTING_PHOTO_URL_RE = /^https:\/\/[^/]+\/storage\/v1\/object\/public\/listings\//;
/** DB: crm2_set_listing_photos дээд тал нь 30 зураг. */
export const MAX_LISTING_PHOTOS = 30;

export const publishPropertySchema = z.object({
  property_id: idSchema,
  // Хоосон бол DB анхдагч гарчиг/текстийг (crm2_default_listing_*) ашиглана.
  title: optText(160, "Зарын гарчиг"),
  description: optText(4000, "Зарын тайлбар"),
  /** «Миний зараас үүсгэсэн» хөрөнгийг эх зартай нь холбох (зөвхөн source_listing_id). */
  link_listing: optId,
  /** Холбоход зарын зургийг CRM-ийн зургаар солих (анхдагч: хэвээр). */
  replace_photos: z.boolean().optional(),
});
export type PublishPropertyInput = z.input<typeof publishPropertySchema>;

export const unpublishPropertySchema = z.object({
  property_id: idSchema,
  reason: optText(2000, "Шалтгаан"),
});

export const listingTextSchema = z.object({
  property_id: idSchema,
  title: reqText(160, "Зарын гарчиг"),
  description: z
    .string({ error: "Зарын тайлбар буруу." })
    .trim()
    .max(4000, "Зарын тайлбар 4000 тэмдэгтээс ихгүй."),
});
export type ListingTextInput = z.input<typeof listingTextSchema>;

export const listingPhotosSchema = z.object({
  property_id: idSchema,
  urls: z
    .array(
      z
        .string()
        .trim()
        .max(1000, "Зургийн хаяг хэт урт.")
        .regex(LISTING_PHOTO_URL_RE, "Зөвшөөрөгдөөгүй зургийн хаяг.")
    )
    // Хоосон жагсаалт = «бүх зургийг устга». Санамсаргүйгээр зар зураггүй
    // үлдэхээс сэргийлж энд зогсооно (DB мөн татгалзана).
    .min(1, "Зар зураггүй үлдэхгүй — ядаж нэг зураг хэрэгтэй.")
    .max(MAX_LISTING_PHOTOS, `Зар дээр ${MAX_LISTING_PHOTOS}-аас олон зураг тавихгүй.`),
});
export type ListingPhotosInput = z.input<typeof listingPhotosSchema>;

// ── Медиа ба файл ──────────────────────────────────────────────────────────

const UUID_PART = "[0-9a-fA-F-]{36}";
const MEDIA_PATH_RE = new RegExp(`^${UUID_PART}/${UUID_PART}/[A-Za-z0-9._-]{1,120}$`);
// Өмчлөл/иргэний үнэмлэх: {office}/brokerage/{contract}/restricted/<uuid>.<ext> (crm2_brokerage_files_kind_guard).
const DOC_PATH_RE = new RegExp(`^${UUID_PART}/brokerage/${UUID_PART}/(restricted/)?[A-Za-z0-9._-]{1,120}$`);
const RESTRICTED_DOC_RE = new RegExp(`/restricted/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\.[A-Za-z0-9]{1,8}$`);

export const mediaRowSchema = z.object({
  property_id: idSchema,
  storage_path: z.string().regex(MEDIA_PATH_RE, "Медиа файлын зам буруу."),
  caption: optText(300, "Тайлбар"),
  sort_order: optNumber({ int: true, min: 0, max: 100000, label: "Дараалал" }),
  is_cover: z.boolean().optional(),
});
export type MediaRowInput = z.input<typeof mediaRowSchema>;

export const videoLinkSchema = z.object({
  property_id: idSchema,
  external_url: z
    .string()
    .trim()
    .max(1000, "Холбоос хэт урт.")
    .regex(/^https:\/\/\S+$/, "Бичлэгийн холбоос https:// -ээр эхэлнэ."),
  caption: optText(300, "Тайлбар"),
});
export type VideoLinkInput = z.input<typeof videoLinkSchema>;

export const mediaUpdateSchema = z.object({
  media_id: idSchema,
  caption: optText(300, "Тайлбар"),
  sort_order: optNumber({ int: true, min: 0, max: 100000, label: "Дараалал" }),
});

export const mediaReorderSchema = z.object({
  property_id: idSchema,
  media_ids: z.array(idSchema).min(1).max(300),
});

export const brokerageFileKindEnum = z.enum(BROKERAGE_FILE_KINDS, { error: "Файлын төрөл буруу." });

/** Гэрээ (kind='contract') зөвхөн PDF — crm2_brokerage_files_guard ч `\.pdf$` ба application/pdf шаардана. */
export const CONTRACT_PDF_ONLY_ERROR = "Гэрээ зөвхөн PDF (PMC-ийн тамга, гарын үсэгтэй) байна.";

export const brokerageFileRowSchema = z
  .object({
    contract_id: idSchema,
    storage_path: z.string().regex(DOC_PATH_RE, "Гэрээний файлын зам буруу."),
    file_name: optText(200, "Файлын нэр"),
    kind: brokerageFileKindEnum.default("contract"),
  })
  .superRefine((v, ctx) => {
    const restricted = v.kind === "ownership" || v.kind === "id";
    if (restricted !== v.storage_path.includes("/restricted/") || (restricted && !RESTRICTED_DOC_RE.test(v.storage_path))) {
      ctx.addIssue({ code: "custom", path: ["storage_path"], message: "Гэрээний файлын зам буруу." });
    }
    if (v.kind === "contract" && !/\.pdf$/i.test(v.storage_path)) {
      ctx.addIssue({ code: "custom", path: ["storage_path"], message: CONTRACT_PDF_ONLY_ERROR });
    }
  });

/** Файл байршуулах (төрөлтэй). */
export const brokerageFileSchema = z.object({
  contract_id: idSchema,
  kind: brokerageFileKindEnum.default("contract"),
});
export type BrokerageFileRowInput = z.input<typeof brokerageFileRowSchema>;

// ── Зуучлалын гэрээ ────────────────────────────────────────────────────────
//
// 20261125000100: батлах алхамгүй. Гэрээ = PMC-ийн тамга, гарын үсэгтэй НЭГ PDF + дуусах огноо.
// Дугаарыг DB (B###), эхлэх огноог бүртгэсэн өдрөөр тавина; шимтгэл, онцгой нөхцөл, гарын үсэг
// зурагч, оффисын анхдагч агентын урсгалд байхгүй (баганууд хуучин бичлэгт л үлдэнэ).

/** Ноорог гэрээ: хөрөнгө ба (сонголттой) дуусах огноо. Бусад түлхүүрийг z.object хасна. */
export const brokerageCreateSchema = z.object({
  property_id: idSchema,
  end_date: optDate("Дуусах огноо"),
});
export type BrokerageCreateInput = z.input<typeof brokerageCreateSchema>;

/** Гэрээ бүртгэх (crm2_brokerage_register): дуусах огноо заавал, «PMC-ийн тамга, гарын үсэгтэй» заавал. */
export const brokerageRegisterSchema = z.object({
  contract_id: idSchema,
  end_date: z
    .string({ error: "Дуусах огноо оруулна уу." })
    .trim()
    .min(1, "Дуусах огноо оруулна уу.")
    .refine(isIsoDate, "Дуусах огноо буруу (ОООО-СС-ӨӨ)."),
  stamp_confirmed: z.literal(true, { error: "PMC-ийн тамга, гарын үсэгтэйг баталгаажуулна уу." }),
});
export type BrokerageRegisterInput = z.input<typeof brokerageRegisterSchema>;

/** Шалтгаан заавал (цуцлах). */
export const contractReasonSchema = z.object({ contract_id: idSchema, reason: reqText(2000, "Шалтгаан") });
/**
 * «Гэрээ буруу» (crm2_brokerage_invalidate) — шалтгаан заавал. DB «Гэрээ буруу: » угтвартай хадгалж
 * 1900 тэмдэгтээр хязгаарлана.
 */
export const brokerageInvalidateSchema = contractReasonSchema.extend({ reason: reqText(1900, "Шалтгаан") });
/** Шалтгаан сонголттой (ноорог хаях). */
export const contractOptReasonSchema = z.object({ contract_id: idSchema, reason: optText(2000, "Шалтгаан") });

// ── Харилцагч, утас, шаардлага ─────────────────────────────────────────────

const phoneValue = z
  .string({ error: "Утасны дугаар оруулна уу." })
  .trim()
  .min(4, "Утасны дугаар хэт богино.")
  .max(40, "Утасны дугаар хэт урт.")
  .refine(isValidPhone, "Утасны дугаар буруу.");

export const phoneItemSchema = z.object({ phone: phoneValue, label: optText(40, "Шошго") });

const contactSourceFields = {
  /** contact.sources-ийн код (DB guard жагсаалтаар шалгана). */
  source: z.preprocess(emptyToNull, keySchema.nullable().optional()),
  source_note: optText(200, "Эх сурвалжийн тайлбар"),
  consent: z.enum(CONTACT_CONSENTS, { error: "Зөвшөөрлийн төлөв буруу." }).optional(),
};

export const contactCreateSchema = z.object({
  full_name: reqText(160, "Нэр"),
  phones: z.array(phoneItemSchema).max(10, "Дугаар 10-аас ихгүй.").default([]),
  note: optText(4000, "Тэмдэглэл"),
  agent_id: optId,
  allow_duplicate: z.boolean().optional(),
  ...contactSourceFields,
});
export type ContactCreateInput = z.input<typeof contactCreateSchema>;

export const contactUpdateSchema = z.object({
  contact_id: idSchema,
  full_name: reqText(160, "Нэр").optional(),
  note: optText(4000, "Тэмдэглэл"),
  status: z.enum(RECORD_STATUSES).optional(),
  ...contactSourceFields,
});
export type ContactUpdateInput = z.input<typeof contactUpdateSchema>;

export const phoneAddSchema = z.object({
  contact_id: idSchema,
  phone: phoneValue,
  label: optText(40, "Шошго"),
  is_primary: z.boolean().optional(),
});

export const phoneUpdateSchema = z.object({
  phone_id: idSchema,
  phone: phoneValue.optional(),
  label: optText(40, "Шошго"),
});

export const phoneLookupSchema = z.object({
  phone: z.string().trim().min(1, "Утасны дугаар оруулна уу.").max(40),
  property_id: optId,
});

/**
 * Мөр бүрээр нэг утга (жагсаалт). Алдааны мессеж нь уртын хязгаарыг ЗААЖ хэлнэ —
 * «хэт урт» гэдэг нь агентад юу засахаа ойлгуулдаггүй байв.
 */
const textList = (max: number, itemMax: number, label: string) =>
  z
    .array(z.string().trim().max(itemMax, `${label}: нэг мөр ${itemMax} тэмдэгтээс ихгүй.`))
    .max(max, `${label} ${max}-аас ихгүй.`)
    .optional();


const requirementShape = {
  purpose: optText(200, "Зорилго"),
  category: z.preprocess(emptyToNull, categoryEnum.nullable().optional()),
  property_type: z.preprocess(emptyToNull, keySchema.nullable().optional()),
  budget_min: optNumber({ min: 0, lt: 1e14, label: "Төсвийн доод" }),
  budget_max: optNumber({ min: 0, lt: 1e14, label: "Төсвийн дээд" }),
  currency: currencyEnum.optional(),
  price_period: periodEnum.optional(),
  locations: textList(REQUIREMENT_LIST_MAX, REQUIREMENT_LOCATION_MAX, "Байршил"),
  districts: textList(20, 60, "Дүүрэг"),
  rooms_min: optNumber({ int: true, min: 0, max: 100, label: "Өрөө (доод)" }),
  rooms_max: optNumber({ int: true, min: 0, max: 100, label: "Өрөө (дээд)" }),
  area_min: optNumber({ gt: 0, lt: 1e7, label: "Хэмжээ (доод)" }),
  area_max: optNumber({ gt: 0, lt: 1e7, label: "Хэмжээ (дээд)" }),
  move_in_from: optDate("Орох огноо"),
  move_in_note: optText(500, "Орох хугацааны тайлбар"),
  must_haves: textList(REQUIREMENT_LIST_MAX, MUST_HAVE_MAX, "Зайлшгүй нөхцөл"),
  required_features: z.array(keySchema).max(40).optional(),
  notes: optText(4000, "Тэмдэглэл"),
};

type RequirementCheck = {
  category?: string | null;
  price_period?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  area_min?: number | null;
  area_max?: number | null;
};

function checkRequirement(v: RequirementCheck, ctx: z.RefinementCtx) {
  const pair = (a: number | null | undefined, b: number | null | undefined, path: string, msg: string) => {
    if (a != null && b != null && a > b) ctx.addIssue({ code: "custom", path: [path], message: msg });
  };
  pair(v.budget_min, v.budget_max, "budget_max", "Төсвийн дээд хязгаар доодоос бага байж болохгүй.");
  pair(v.rooms_min, v.rooms_max, "rooms_max", "Өрөөний дээд тоо доодоос бага байж болохгүй.");
  pair(v.area_min, v.area_max, "area_max", "Хэмжээний дээд хязгаар доодоос бага байж болохгүй.");
  if (v.category === "sale" && v.price_period !== undefined && v.price_period !== "total") {
    ctx.addIssue({ code: "custom", path: ["price_period"], message: "Худалдан авах шаардлагын төсөв нийт дүнгээр байна." });
  }
}

export const requirementCreateSchema = z
  .object({ contact_id: idSchema, ...requirementShape })
  .superRefine(checkRequirement);
export type RequirementCreateInput = z.input<typeof requirementCreateSchema>;

export const requirementUpdateSchema = z
  .object({ requirement_id: idSchema, ...requirementShape, status: z.enum(RECORD_STATUSES).optional() })
  .superRefine(checkRequirement);
export type RequirementUpdateInput = z.input<typeof requirementUpdateSchema>;

export const transferContactSchema = z.object({
  contact_id: idSchema,
  to_agent_id: idSchema,
  reason: reqText(2000, "Шилжүүлэх шалтгаан"),
  with_deals: z.boolean().optional(),
});

// ── Хэлцэл, дуудлага ───────────────────────────────────────────────────────

export const openDealSchema = z.object({
  property_id: idSchema,
  contact_id: idSchema,
  requirement_id: optId,
  agent_id: optId,
  origin_deal_id: optId,
});
export type OpenDealInput = z.input<typeof openDealSchema>;

export const logCallSchema = z
  .object({
    property_id: idSchema,
    contact_id: idSchema,
    occurred_at: optDateTime("Дуудлагын цаг"),
    note: optText(4000, "Тэмдэглэл"),
    result: optText(2000, "Үр дүн"),
    next_action: z.preprocess(emptyToNull, z.enum(TASK_KINDS, { error: "Дараагийн алхам буруу." }).nullable().optional()),
    next_action_due: optDateTime("Дараагийн алхмын хугацаа"),
    next_action_note: optText(1000, "Дараагийн алхмын тэмдэглэл"),
    requirement_id: optId,
    agent_id: optId,
    origin_deal_id: optId,
  })
  .superRefine((v, ctx) => {
    if (!notFuture(v.occurred_at)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Дуудлагын цаг ирээдүйд байж болохгүй." });
    }
    if (!v.next_action && (v.next_action_due || v.next_action_note)) {
      ctx.addIssue({ code: "custom", path: ["next_action"], message: "Дараагийн алхмын төрлийг сонгоно уу." });
    }
  });
export type LogCallInput = z.input<typeof logCallSchema>;

/**
 * Өөр агентын харилцагч/хэлцэлтэй дуудлагыг шилжүүлэх хүсэлтэд хадгалах
 * (crm2_request_transfer_with_call). Гүйцэтгэгч нь үргэлж хүсэгч өөрөө.
 */
export const transferWithCallSchema = z
  .object({
    property_id: idSchema,
    contact_id: idSchema,
    occurred_at: optDateTime("Дуудлагын цаг"),
    note: optText(4000, "Тэмдэглэл"),
    result: optText(2000, "Үр дүн"),
    next_action: z.preprocess(emptyToNull, z.enum(TASK_KINDS, { error: "Дараагийн алхам буруу." }).nullable().optional()),
    next_action_due: optDateTime("Дараагийн алхмын хугацаа"),
    next_action_note: optText(1000, "Дараагийн алхмын тэмдэглэл"),
    requirement_id: optId,
    reason: optText(2000, "Шалтгаан"),
  })
  .superRefine((v, ctx) => {
    if (!notFuture(v.occurred_at)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Дуудлагын цаг ирээдүйд байж болохгүй." });
    }
    if (!v.next_action && (v.next_action_due || v.next_action_note)) {
      ctx.addIssue({ code: "custom", path: ["next_action"], message: "Дараагийн алхмын төрлийг сонгоно уу." });
    }
  });
export type TransferWithCallInput = z.input<typeof transferWithCallSchema>;

export const dealStageSchema = z.object({
  deal_id: idSchema,
  stage: z.enum(DEAL_STAGES, { error: "Шат буруу." }),
  note: optText(2000, "Тэмдэглэл"),
});

export const cancelDealSchema = z
  .object({
    deal_id: idSchema,
    reason_code: keySchema,
    reason: optText(2000, "Шалтгааны тайлбар"),
    requirement_id: optId,
  })
  .superRefine((v, ctx) => {
    if (v.reason_code === "other" && !v.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "«Бусад» шалтгааны тайлбарыг бичнэ үү." });
    }
  });
export type CancelDealInput = z.input<typeof cancelDealSchema>;

export const transferDealSchema = z.object({
  deal_id: idSchema,
  to_agent_id: idSchema,
  reason: reqText(2000, "Шилжүүлэх шалтгаан"),
});

/** Хэлцлийн тэмдэглэл/шаардлага (шууд REST-ээр засах боломжтой хэсэг). */
export const dealUpdateSchema = z.object({
  deal_id: idSchema,
  note: optText(4000, "Тэмдэглэл"),
  requirement_id: optId,
});

// ── Үзүүлэлт ───────────────────────────────────────────────────────────────

export const showingScheduleSchema = z.object({
  deal_id: idSchema,
  scheduled_at: ubDateTime("Үзүүлэх огноо, цаг"),
  agent_id: optId,
  note: optText(4000, "Тэмдэглэл"),
  source_activity_id: optId,
});
export type ShowingScheduleInput = z.input<typeof showingScheduleSchema>;

/** Товлолгүйгээр шууд «үзүүлсэн» бүртгэх (бодит цаг + санал хүсэлт). */
export const showingRecordSchema = z
  .object({
    deal_id: idSchema,
    occurred_at: ubDateTime("Үзүүлсэн огноо, цаг"),
    scheduled_at: optDateTime("Товлосон цаг"),
    feedback: optText(4000, "Санал хүсэлт"),
    result: optText(2000, "Үр дүн"),
    note: optText(4000, "Тэмдэглэл"),
    agent_id: optId,
    source_activity_id: optId,
  })
  .superRefine((v, ctx) => {
    if (!notFuture(v.occurred_at)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Ирээдүйн цагт «үзүүлсэн» гэж бүртгэхгүй." });
    }
  });
export type ShowingRecordInput = z.input<typeof showingRecordSchema>;

/** Товлосон үзүүлэлтийн үр дүн: үзүүлсэн (бодит цаг заавал) / цуцалсан / ирээгүй. */
export const showingOutcomeSchema = z
  .object({
    activity_id: idSchema,
    outcome: z.enum(["shown", "cancelled", "no_show"], { error: "Үр дүнг сонгоно уу." }),
    occurred_at: optDateTime("Үзүүлсэн огноо, цаг"),
    feedback: optText(4000, "Санал хүсэлт"),
    result: optText(2000, "Үр дүн"),
    note: optText(4000, "Тэмдэглэл"),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "shown" && !v.occurred_at) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Бодитоор үзүүлсэн огноо, цагийг оруулна уу." });
    }
    if (!notFuture(v.occurred_at)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Ирээдүйн цагт «үзүүлсэн» гэж бүртгэхгүй." });
    }
  });
export type ShowingOutcomeInput = z.input<typeof showingOutcomeSchema>;

export const showingRescheduleSchema = z.object({
  activity_id: idSchema,
  scheduled_at: ubDateTime("Үзүүлэх огноо, цаг"),
  agent_id: optId,
});

/** Дуудлага/үзүүлэлтийн текст, цаг засах (засах цонхыг DB шалгана). */
export const activityUpdateSchema = z
  .object({
    activity_id: idSchema,
    note: optText(4000, "Тэмдэглэл"),
    result: optText(2000, "Үр дүн"),
    feedback: optText(4000, "Санал хүсэлт"),
    occurred_at: optDateTime("Огноо, цаг"),
    agent_id: optId,
  })
  .superRefine((v, ctx) => {
    if (!notFuture(v.occurred_at)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Цаг ирээдүйд байж болохгүй." });
    }
  });

export const activityVoidSchema = z.object({ activity_id: idSchema, reason: reqText(1000, "Хүчингүй болгох шалтгаан") });

// ── Ажил ───────────────────────────────────────────────────────────────────

export const taskCreateSchema = z
  .object({
    kind: z.enum(TASK_KINDS, { error: "Ажлын төрлийг сонгоно уу." }),
    due_at: optDateTime("Хугацаа"),
    note: optText(1000, "Тэмдэглэл"),
    assignee_id: optId,
    property_id: optId,
    deal_id: optId,
    contact_id: optId,
    requirement_id: optId,
    brokerage_id: optId,
  })
  .superRefine((v, ctx) => {
    if (!v.property_id && !v.deal_id && !v.contact_id && !v.brokerage_id) {
      ctx.addIssue({ code: "custom", path: ["deal_id"], message: "Ажлыг хөрөнгө, хэлцэл, харилцагч эсвэл гэрээтэй холбоно уу." });
    }
  });
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = z.object({
  task_id: idSchema,
  kind: z.enum(TASK_KINDS).optional(),
  due_at: optDateTime("Хугацаа"),
  note: optText(1000, "Тэмдэглэл"),
  assignee_id: optId,
});
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

export const taskStatusSchema = z.object({ task_id: idSchema, status: z.enum(TASK_STATUSES) });

// ── Хүсэлт, тохиргоо ───────────────────────────────────────────────────────

export const decideRequestSchema = z
  .object({ request_id: idSchema, approve: z.boolean(), note: optText(2000, "Тайлбар") })
  .superRefine((v, ctx) => {
    if (!v.approve && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Татгалзсан шалтгааныг бичнэ үү." });
  });

export const settingKeySchema = z.enum(CRM2_SETTING_KEYS as [string, ...string[]], { error: "Тодорхойгүй тохиргоо." });

const jsonValue: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.record(z.string(), z.string()),
]);

export const setSettingSchema = z.object({ key: settingKeySchema, value: jsonValue });

export const searchQuerySchema = z.string().trim().max(120).default("");

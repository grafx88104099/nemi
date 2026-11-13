import { z } from "zod";

import { ubInputToIso, isIsoDate } from "@/lib/crm2/datetime";
import { isValidPhone } from "@/lib/crm2/phone";
import {
  COMMISSION_TYPES,
  CURRENCIES,
  DEAL_STAGES,
  PRICE_BASES,
  PRICE_PERIODS,
  PROPERTY_CATEGORIES,
  PROPERTY_STATUSES,
  RECORD_STATUSES,
  TASK_KINDS,
  TASK_STATUSES,
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
const toNumber = (v: unknown) => {
  if (typeof v === "string") {
    const t = v.trim().replace(/[\s,]/g, "");
    if (t === "") return null;
    const n = Number(t);
    return Number.isNaN(n) ? v : n;
  }
  return v;
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
  view_note: optText(4000, "Харууц"),
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
};

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

/** Шинэ хөрөнгө (ноорог). project_name өгвөл crm2_ensure_project-оор холбоно. */
export const propertyCreateSchema = z
  .object({
    ...propertyShape,
    project_name: optText(120, "Төслийн нэр"),
    private: propertyPrivateSchema.optional(),
  })
  .superRefine((v, ctx) => checkProperty(v, ctx, true));
export type PropertyCreateInput = z.input<typeof propertyCreateSchema>;

/** Хөрөнгө засах (зөвхөн өгсөн талбар). Төлөв, код, баталгаажуулалт энд орохгүй. */
export const propertyUpdateSchema = z
  .object({ ...propertyShape, category: categoryEnum.optional(), project_name: optText(120, "Төслийн нэр") })
  .superRefine((v, ctx) => checkProperty(v, ctx));
export type PropertyUpdateInput = z.input<typeof propertyUpdateSchema>;

export const propertyStatusSchema = z
  .object({
    property_id: idSchema,
    status: z.enum(PROPERTY_STATUSES, { error: "Төлөв буруу." }),
    reason: optText(2000, "Шалтгаан"),
  });
export type PropertyStatusInput = z.input<typeof propertyStatusSchema>;

export const verifySchema = z.object({ property_id: idSchema, note: optText(2000, "Тэмдэглэл") });

export const projectNameSchema = reqText(120, "Төслийн нэр");

// ── Медиа ба файл ──────────────────────────────────────────────────────────

const UUID_PART = "[0-9a-fA-F-]{36}";
const MEDIA_PATH_RE = new RegExp(`^${UUID_PART}/${UUID_PART}/[A-Za-z0-9._-]{1,120}$`);
const DOC_PATH_RE = new RegExp(`^${UUID_PART}/brokerage/${UUID_PART}/[A-Za-z0-9._-]{1,120}$`);

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

export const brokerageFileRowSchema = z.object({
  contract_id: idSchema,
  storage_path: z.string().regex(DOC_PATH_RE, "Гэрээний файлын зам буруу."),
  file_name: optText(200, "Файлын нэр"),
});
export type BrokerageFileRowInput = z.input<typeof brokerageFileRowSchema>;

// ── Зуучлалын гэрээ ────────────────────────────────────────────────────────

const brokerageShape = {
  number: optText(60, "Гэрээний дугаар"),
  owner_contact_id: optId,
  start_date: optDate("Эхлэх огноо"),
  end_date: optDate("Дуусах огноо"),
  terms: optText(8000, "Нөхцөл"),
  commission_type: z.preprocess(emptyToNull, z.enum(COMMISSION_TYPES, { error: "Шимтгэлийн төрөл буруу." }).nullable().optional()),
  commission_value: optNumber({ min: 0, lt: 1e10, label: "Шимтгэл" }),
  commission_currency: currencyEnum.optional(),
  commission_note: optText(2000, "Шимтгэлийн тайлбар"),
  responsible_agent_id: optId,
};

type BrokerageCheck = {
  start_date?: string | null;
  end_date?: string | null;
  commission_type?: string | null;
  commission_value?: number | null;
};

function checkBrokerage(v: BrokerageCheck, ctx: z.RefinementCtx) {
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    ctx.addIssue({ code: "custom", path: ["end_date"], message: "Дуусах огноо эхлэх огнооноос өмнө байж болохгүй." });
  }
  if (v.commission_type === "percent" && v.commission_value != null && v.commission_value > 100) {
    ctx.addIssue({ code: "custom", path: ["commission_value"], message: "Шимтгэлийн хувь 100-аас ихгүй." });
  }
}

export const brokerageCreateSchema = z
  .object({ property_id: idSchema, ...brokerageShape })
  .superRefine(checkBrokerage);
export type BrokerageCreateInput = z.input<typeof brokerageCreateSchema>;

export const brokerageUpdateSchema = z
  .object({ contract_id: idSchema, ...brokerageShape })
  .superRefine(checkBrokerage);
export type BrokerageUpdateInput = z.input<typeof brokerageUpdateSchema>;

export const brokerageApproveSchema = z.object({
  contract_id: idSchema,
  note: optText(2000, "Тэмдэглэл"),
  /** Батлагчийн харсан updated_at (өөрчлөгдсөн бол DB татгалзана). */
  expected_updated_at: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

/** Шалтгаан заавал (татгалзах, цуцлах). */
export const contractReasonSchema = z.object({ contract_id: idSchema, reason: reqText(2000, "Шалтгаан") });
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

export const contactCreateSchema = z.object({
  full_name: reqText(160, "Нэр"),
  phones: z.array(phoneItemSchema).max(10, "Дугаар 10-аас ихгүй.").default([]),
  note: optText(4000, "Тэмдэглэл"),
  agent_id: optId,
  allow_duplicate: z.boolean().optional(),
});
export type ContactCreateInput = z.input<typeof contactCreateSchema>;

export const contactUpdateSchema = z.object({
  contact_id: idSchema,
  full_name: reqText(160, "Нэр").optional(),
  note: optText(4000, "Тэмдэглэл"),
  status: z.enum(RECORD_STATUSES).optional(),
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

const textList = (max: number, itemMax: number, label: string) =>
  z.array(z.string().trim().max(itemMax, `${label} хэт урт.`)).max(max, `${label} ${max}-аас ихгүй.`).optional();

const requirementShape = {
  purpose: optText(200, "Зорилго"),
  category: z.preprocess(emptyToNull, categoryEnum.nullable().optional()),
  property_type: z.preprocess(emptyToNull, keySchema.nullable().optional()),
  budget_min: optNumber({ min: 0, lt: 1e14, label: "Төсвийн доод" }),
  budget_max: optNumber({ min: 0, lt: 1e14, label: "Төсвийн дээд" }),
  currency: currencyEnum.optional(),
  price_period: periodEnum.optional(),
  locations: textList(30, 200, "Байршил"),
  districts: textList(20, 60, "Дүүрэг"),
  rooms_min: optNumber({ int: true, min: 0, max: 100, label: "Өрөө (доод)" }),
  rooms_max: optNumber({ int: true, min: 0, max: 100, label: "Өрөө (дээд)" }),
  area_min: optNumber({ gt: 0, lt: 1e7, label: "Хэмжээ (доод)" }),
  area_max: optNumber({ gt: 0, lt: 1e7, label: "Хэмжээ (дээд)" }),
  move_in_from: optDate("Орох огноо"),
  move_in_note: optText(500, "Орох хугацааны тайлбар"),
  must_haves: textList(30, 200, "Зайлшгүй нөхцөл"),
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

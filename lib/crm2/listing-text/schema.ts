/**
 * Задалсан (дүрэм эсвэл AI) талбарын zod баталгаажуулалт — propertyCreateSchema-ийн
 * талбар бүрийн validator-ийн дэд олонлог, superRefine-гүй (давхар > барилга мэт
 * хоорондын дүрмийг маягт/DB шалгана). Талбар тус бүрээр шалгаж, тэнцээгүйг хаяна —
 * нэг буруу утгаас болж бусад нь алдагдахгүй.
 */
import { z } from "zod";

import { propertyCreateSchema } from "@/lib/crm2/schemas";

const shape = propertyCreateSchema.shape;

/** crm2 schemas.ts-д шинэ (20261124000100) багануудтай ижил хязгаар. */
const monthCount = (label: string) =>
  z.number({ error: `${label} тоо байна.` }).int(`${label} бүхэл тоо байна.`).min(0).max(24, `${label} 24-өөс ихгүй.`);

export const propertyParseSchema = z.object({
  category: shape.category.optional(),
  property_type: shape.property_type,
  area_m2: shape.area_m2,
  rooms: shape.rooms,
  floor: shape.floor,
  building_floors: shape.building_floors,
  price: shape.price,
  currency: shape.currency,
  price_basis: shape.price_basis,
  price_period: shape.price_period,
  year_in_use: shape.year_in_use,
  district: shape.district,
  project_id: shape.project_id,
  project_name: shape.project_name,
  features: shape.features,
  parking_spaces: z
    .number({ error: "Зогсоолын тоо тоо байна." })
    .int("Зогсоолын тоо бүхэл тоо байна.")
    .min(0)
    .max(50, "Зогсоолын тоо 50-аас ихгүй.")
    .optional(),
  rent_advance_months: monthCount("Урьдчилгаа").optional(),
  rent_deposit_months: monthCount("Барьцаа").optional(),
});

export type PropertyParseFields = z.output<typeof propertyParseSchema>;
export type PropertyParseKey = keyof typeof propertyParseSchema.shape;
export const PROPERTY_PARSE_KEYS = Object.keys(propertyParseSchema.shape) as PropertyParseKey[];

/**
 * Талбар бүрийг тусад нь шалгаж, тэнцсэнийг (zod-оор хувиргасан утгаар) буцаана.
 * Мэдэгдээгүй түлхүүр, null/undefined утга хасагдана.
 */
export function sanitizeParsedFields(raw: Record<string, unknown>): Partial<PropertyParseFields> {
  const out: Record<string, unknown> = {};
  for (const key of PROPERTY_PARSE_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    const r = propertyParseSchema.shape[key].safeParse(v);
    if (r.success && r.data !== undefined && r.data !== null) out[key] = r.data;
  }
  return out as Partial<PropertyParseFields>;
}

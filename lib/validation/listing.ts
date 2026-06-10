import { z } from "zod";

import { LISTING_STATUSES, DEAL_TYPES } from "@/lib/constants";
import type { ListingInput } from "@/lib/actions/listings";

/**
 * Серверийн оролтын баталгаажуулалт. Server Action-ийг формоос гадуур шууд
 * дуудаж болдог тул клиентийн шалгалтад НАЙДАХГҮЙ — энд бүх талбарыг хатуу
 * шалгана. lat/lng-г тоо гэдгийг баталснаар EWKT-д муу утга орохоос сэргийлнэ.
 */

const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => /^https?:\/\//i.test(u), "URL буруу байна");

const listingSchema = z
  .object({
    title: z.string().trim().min(1, "Гарчиг оруулна уу").max(200, "Гарчиг хэт урт байна"),
    type: z.string().trim().min(1).max(60),
    district: z.string().trim().min(1).max(60),
    rooms: z.number().int().min(0).max(50),
    area: z.number().min(0).max(100000),
    floor: z.string().trim().max(20),
    price: z.number().positive("Үнэ 0-ээс их байх ёстой").max(1_000_000_000_000, "Үнэ хэт өндөр байна"),
    year: z.number().int().min(0).max(2100),
    parking: z.number().int().min(0).max(1000),
    description: z.string().max(5000, "Тайлбар хэт урт байна"),
    amenities: z.array(z.string().trim().max(50)).max(30, "Тохижилт хэт олон байна"),
    photos: z.array(httpUrl).max(20, "Зураг хэт олон байна (дээд тал 20)"),
    status: z.enum(LISTING_STATUSES),
    deal_type: z.enum(DEAL_TYPES),
    rent_advance_months: z.number().int().min(0).max(24).nullable(),
    rent_deposit_months: z.number().int().min(0).max(24).nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .strict();

const LABEL: Record<string, string> = {
  title: "Гарчиг", type: "Төрөл", district: "Дүүрэг", rooms: "Өрөө", area: "Талбай",
  floor: "Давхар", price: "Үнэ", year: "Ашиглалтын он", parking: "Зогсоол",
  description: "Тайлбар", amenities: "Тохижилт", photos: "Зураг", status: "Төлөв",
  deal_type: "Зарын төрөл", rent_advance_months: "Урьдчилгаа", rent_deposit_months: "Барьцаа",
  lat: "Байршил", lng: "Байршил",
};

/** Амжилттай бол {data}, эс бөгөөс {error} (хэрэглэгчид ээлтэй мессеж). */
export function validateListingInput(input: unknown): { data: ListingInput } | { error: string } {
  const r = listingSchema.safeParse(input);
  if (r.success) return { data: r.data as ListingInput };
  const issue = r.error.issues[0];
  const field = issue?.path?.[0] as string | undefined;
  // Тодорхой мессеж байвал түүнийг, эс бөгөөс талбарын нэрээр.
  const msg =
    issue && issue.message && !issue.message.startsWith("Invalid") && !issue.message.startsWith("Expected")
      ? issue.message
      : `«${(field && LABEL[field]) || "Оролт"}» талбар буруу байна.`;
  return { error: msg };
}

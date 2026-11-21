import { z } from "zod";

import { DEAL_TYPES } from "@/lib/constants";

/**
 * Эзэний холбоо барих мэдээлэл ба зуучлуулах хүсэлтийн баталгаажуулалт
 * (серверт — Server Action-ийг маягтаас гадуур шууд дуудаж болно).
 */

/** Монгол утас: зай, зураас, +976-г хасаад 8 орон (бусад улсын 6–15 оронг ч зөвшөөрнө). */
export function normalizeOwnerPhone(raw: string): string | null {
  const d = raw.replace(/[\s\-()]/g, "").replace(/^\+?976/, "");
  return /^\+?\d{6,15}$/.test(d) ? d : null;
}

const name = z.string().trim().min(1, "Нэрээ оруулна уу").max(120, "Нэр хэт урт байна");
const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeOwnerPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Утасны дугаар буруу байна" });
      return z.NEVER;
    }
    return n;
  });

export function validateOwnerContact(input: unknown): { data: { owner_name: string; owner_phone: string } } | { error: string } {
  const r = z.object({ owner_name: name, owner_phone: phone }).safeParse(input);
  return r.success ? { data: r.data } : { error: r.error.issues[0]?.message ?? "Холбоо барих мэдээлэл буруу." };
}

const optNum = (max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().positive().max(max).nullable());

const requestSchema = z
  .object({
    office_id: z.guid("Оффисоо сонгоно уу"),
    contact_name: name,
    contact_phone: phone,
    deal_type: z.enum(DEAL_TYPES, { error: "Худалдах уу, түрээслүүлэх үү сонгоно уу" }),
    property_type: z.string().trim().max(60).nullable().optional(),
    district: z.string().trim().max(60).nullable().optional(),
    location_text: z.string().trim().max(300, "Байршил хэт урт").nullable().optional(),
    area: optNum(1_000_000),
    rooms: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(100).nullable()),
    price: optNum(1e15),
    note: z.string().trim().max(2000, "Тэмдэглэл хэт урт").nullable().optional(),
  })
  .strict();

export type OwnerRequestInput = z.input<typeof requestSchema>;
export type OwnerRequestData = z.output<typeof requestSchema>;

export function validateOwnerRequest(input: unknown): { data: OwnerRequestData } | { error: string } {
  const r = requestSchema.safeParse(input);
  if (r.success) {
    const d = r.data;
    // Хоосон мөрийг null болгоно.
    const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
    return {
      data: {
        ...d,
        property_type: blank(d.property_type),
        district: blank(d.district),
        location_text: blank(d.location_text),
        note: blank(d.note),
      },
    };
  }
  return { error: r.error.issues[0]?.message ?? "Мэдээлэл буруу байна." };
}

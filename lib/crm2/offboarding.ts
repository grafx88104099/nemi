import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Ажилтан гарах / чөлөө авах үеийн цэвэр дүрэм ба DB шалгалт.
 *
 * Нэвтрэлт хаах, идэвхгүй болгох, бүрэн устгахаас өмнө DB-ийн
 * crm_offboarding_blockers(p_profile)-ийг дуудна. Функц нь хүний нээлттэй
 * Staff хэлцэл ба Staff хөрөнгийн үүргийг тоолж, ижил JSON түлхүүрүүдийг буцаана.
 * Энэ файл серверийн импортгүй — client компонент ч isOnLeave-ийг ашиглана.
 */

export type OffboardingBlockers = {
  has_staff: boolean;
  staff_id?: string;
  office_id?: string;
  is_active?: boolean;
  offboarding?: boolean;
  /** Хуучин CRM-ийн нээлттэй бичлэг (шинэ тоололд 0). */
  leads?: number;
  /** Хүний хариуцсан нээлттэй Staff хэлцэл. */
  opportunities?: number;
  /** Идэвхтэй/ноорог Staff хөрөнгө дээрх үүрэг (листлэгч, гэрээ, зураг). */
  property_roles?: number;
  had_ownership?: boolean;
  approved_act?: boolean;
};

const CHECK_ERR = "CRM-ийн хүлээлцэх төлөвийг шалгаж чадсангүй. Дахин оролдоно уу.";

type RpcClient = Pick<SupabaseClient<Database>, "rpc">;

/**
 * DB-ийн хориг. Дуудагч client-ээ өгнө (оффисын админ бусад оффисын хүнийг ч
 * шалгадаг тул одоогийн дуудагчид service-role client дамжуулна). Алдаа гарвал
 * аюулгүй тал руу — «саадтай» гэж үзнэ.
 */
export async function getOffboardingBlockers(
  client: RpcClient,
  profileId: string
): Promise<OffboardingBlockers | { error: string }> {
  try {
    const { data, error } = await client.rpc("crm_offboarding_blockers", { p_profile: profileId });
    if (error) {
      console.error("getOffboardingBlockers:", error.message);
      return { error: CHECK_ERR };
    }
    return (data ?? { has_staff: false }) as unknown as OffboardingBlockers;
  } catch (e) {
    console.error("getOffboardingBlockers:", e instanceof Error ? e.message : e);
    return { error: CHECK_ERR };
  }
}

/** Нэвтрэлт хаах / идэвхгүй болгох / устгахаас өмнөх хориг (null = болно). */
export function offboardingBlockMessage(b: OffboardingBlockers, action: "disable" | "delete"): string | null {
  if (!b.has_staff) return null;
  if (action === "delete") {
    return "Энэ ажилтан CRM-д бүртгэлтэй — Staff хэлцэл, түүх хадгалагдах ёстой тул бүрэн устгахгүй. CRM-ээс идэвхгүй болгоод нэвтрэлтийг хаана уу.";
  }
  const legacy = b.leads ?? 0;
  const deals = b.opportunities ?? 0;
  const roles = b.property_roles ?? 0;
  if (legacy + deals + roles > 0) {
    const parts = [`нээлттэй Staff хэлцэл ${deals}`, `Staff хөрөнгийн үүрэг ${roles}`];
    if (legacy > 0) parts.push(`хуучин CRM-ийн нээлттэй бичлэг ${legacy}`);
    return `Хүлээлцэх дуусаагүй — ${parts.join(", ")}. Хэлцлийг өөр агентад шилжүүлж, хөрөнгийн үүрэгт агентыг сольсны дараа дахин оролдоно уу.`;
  }
  if (b.is_active && b.had_ownership && !b.approved_act) {
    return "Батлагдсан хүлээлцэх акт шаардлагатай — CRM-ийн удирдлагад хандана уу.";
  }
  return null;
}

/** Тухайн өдөр (YYYY-MM-DD) чөлөөтэй эсэх — DB crm_staff_on_leave()-тэй ижил. */
export function isOnLeave(from: string | null, to: string | null, day: string): boolean {
  if (!from) return false;
  return from <= day && (!to || to >= day);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу");

export const leaveSchema = z
  .object({
    staffId: z.string().uuid(),
    from: isoDate.nullable(),
    to: isoDate.nullable(),
    substituteId: z.string().uuid().nullable(),
    note: z.string().trim().max(1000, "Тэмдэглэл хэт урт байна").optional(),
  })
  .strict()
  .refine((v) => !v.to || !!v.from, { message: "Эхлэх огноог оруулна уу", path: ["from"] })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Дуусах огноо эхлэхээс өмнө байна", path: ["to"] });

export type LeaveInput = z.infer<typeof leaveSchema>;

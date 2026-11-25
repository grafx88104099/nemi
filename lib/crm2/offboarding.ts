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
  /** Хүний хариуцсан идэвхтэй харилцагч (migration 20261125000310-аас; түүнээс өмнө ирэхгүй). */
  contacts?: number;
  /** Хүнд оноогдсон нээлттэй CRM ажил. */
  open_tasks?: number;
  /** Хүний гаргасан, эсвэл түүнд/түүнээс шилжүүлэх шийдвэрлээгүй хүсэлт. */
  pending_requests?: number;
  had_ownership?: boolean;
  approved_act?: boolean;
};

/**
 * Хүлээлцэх зүйлс (0-ээс их нь л): «харилцагч 3», «нээлттэй ажил 1» …
 * Хэлцэл/хөрөнгийн үүргийг offboardingBlockMessage тусад нь (үргэлж) хэлнэ.
 */
export function handoverExtras(b: OffboardingBlockers): string[] {
  const out: string[] = [];
  if ((b.contacts ?? 0) > 0) out.push(`хариуцсан харилцагч ${b.contacts}`);
  if ((b.open_tasks ?? 0) > 0) out.push(`нээлттэй ажил ${b.open_tasks}`);
  if ((b.pending_requests ?? 0) > 0) out.push(`шийдвэрлээгүй хүсэлт ${b.pending_requests}`);
  return out;
}

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

/**
 * Нэвтрэлт хаах / идэвхгүй болгох / устгахаас өмнөх хориг (null = болно).
 *
 * `includeHandover` — харилцагч, нээлттэй ажил, шийдвэрлээгүй хүсэлтийг ч хориг болгоно. ЗӨВХӨН CRM-ийн
 * «Идэвхгүй болгох»-д (deactivateStaff — хүлээлцэлтийн эцсийн алхам). Нэвтрэлт хаах (ban), оффисын
 * «Идэвхгүй» нь хамгаалалтын яаралтай алхам (ажлаас гарсан, утсаа гээсэн): бөөнөөр шилжүүлэх хэрэгсэлгүй
 * үед харилцагч бүрийг нэг нэгээр шилжүүлэх хүртэл хувийн мэдээлэлд хандах эрх үлдээхгүйн тулд эдгээрт
 * зөвхөн хэлцэл / хөрөнгийн үүргийг (DB-ийн crm_staff_deactivate_guard-тай ижил) шалгана.
 */
export function offboardingBlockMessage(
  b: OffboardingBlockers,
  action: "disable" | "delete",
  opts: { includeHandover?: boolean } = {}
): string | null {
  if (!b.has_staff) return null;
  if (action === "delete") {
    return "Энэ ажилтан CRM-д бүртгэлтэй — Staff хэлцэл, түүх хадгалагдах ёстой тул бүрэн устгахгүй. CRM-ээс идэвхгүй болгоод нэвтрэлтийг хаана уу.";
  }
  const legacy = b.leads ?? 0;
  const deals = b.opportunities ?? 0;
  const roles = b.property_roles ?? 0;
  // Харилцагч, нээлттэй ажил, хүлээгдэж буй хүсэлт — зөвхөн CRM-ийн «Идэвхгүй болгох»-д хориг.
  const extras = opts.includeHandover ? handoverExtras(b) : [];
  if (legacy + deals + roles > 0 || extras.length > 0) {
    const parts = [`нээлттэй Staff хэлцэл ${deals}`, `Staff хөрөнгийн үүрэг ${roles}`, ...extras];
    if (legacy > 0) parts.push(`хуучин CRM-ийн нээлттэй бичлэг ${legacy}`);
    const hint =
      extras.length > 0
        ? "Хэлцэл, харилцагчийг өөр агентад шилжүүлж, хөрөнгийн үүрэгт агентыг сольж, ажил, хүсэлтийг шийдвэрлэсний дараа дахин оролдоно уу."
        : "Хэлцлийг өөр агентад шилжүүлж, хөрөнгийн үүрэгт агентыг сольсны дараа дахин оролдоно уу.";
    return `Хүлээлцэх дуусаагүй — ${parts.join(", ")}. ${hint}`;
  }
  if (b.is_active && b.had_ownership && !b.approved_act) {
    return "Батлагдсан хүлээлцэх акт шаардлагатай — CRM-ийн удирдлагад хандана уу.";
  }
  return null;
}

/** «Гарах урсгал»-ын хүлээлцэх даалгаврын гарчиг — хэнийх болохыг нэрээр нь. */
export function handoverTaskTitle(name: string): string {
  const n = name.trim() || "ажилтан";
  return `Хүлээлцэх: ${n.length > 80 ? `${n.slice(0, 79)}…` : n} — гарах урсгал`;
}

/** Хүлээлцэх даалгаврын тайлбар: юуг шилжүүлэх (тоо мэдэгдэж байвал), хаана хийх. */
export function handoverTaskDescription(name: string, b: OffboardingBlockers | null): string {
  const n = name.trim() || "Ажилтан";
  const lines = [`${n} гарах урсгалд орлоо.`];
  if (b && b.has_staff) {
    const parts = [
      `нээлттэй Staff хэлцэл ${b.opportunities ?? 0}`,
      `Staff хөрөнгийн үүрэг ${b.property_roles ?? 0}`,
      ...handoverExtras(b),
    ];
    lines.push(`Шилжүүлэх: ${parts.join(", ")}.`);
  } else {
    lines.push("Нээлттэй хэлцэл, хөрөнгийн үүрэг, харилцагч, нээлттэй ажлыг нь өөр агентад шилжүүлнэ.");
  }
  lines.push("Дууссаны дараа: /office/crm/settings/staff → «Идэвхгүй болгох».");
  return lines.join("\n");
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

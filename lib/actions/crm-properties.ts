"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { getZoneFor } from "@/lib/queries-crm-properties";
import {
  CRM_PROPERTY_ROLES,
  CRM_PROPERTY_STATUSES,
  CRM_PROPERTY_TYPES,
  CRM_PROPERTY_TYPE_LABEL,
  OCCUPANCY_STATUSES,
  SERVICE_KINDS,
  type CrmPropertyRole,
  type CrmPropertyStatus,
  type OccupancyStatus,
} from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

/**
 * Объектын сангийн бичилтүүд (U3 — F-200–219, P-03). Гол дүрмүүд:
 *  • Статусын машин DB guard-д (F-202) — энд алдааг ойлгомжтой буулгана.
 *  • Идэвхжүүлэлтийн босго DB-д (F-203) — дутуу жагсаалтыг задалж буцаана.
 *  • Үнэ өөрчлөх зөвхөн RPC (шалтгаан заавал, түүх trigger-ээр — F-208).
 *  • Эх сурвалжийн роль зөвхөн RPC-ээр шилжинэ (F-206).
 *  • Д-30: өөр салбарын бүсийн листингэд хамтран ажиллах даалгавар автомат.
 *  • Идэвхжүүлэлт → Д-07 урвуу тохируулга (runRule хэв: rule шалгаад цөм дуудна).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Объект олдсонгүй эсвэл танд эрх алга.";

function revalidatePropertyPaths(id?: string) {
  revalidatePath("/office/crm/properties");
  revalidatePath("/agent/crm/properties");
  if (id) {
    revalidatePath(`/office/crm/properties/${id}`);
    revalidatePath(`/agent/crm/properties/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

/** Мэдэгдэл — admin client, алдаа үндсэн үйлдлийг унагахгүй (crm-staff загвар). */
async function notify(recipientIds: string[], type: string, title: string, body: string, link?: string) {
  try {
    const targets = [...new Set(recipientIds)].filter(Boolean);
    if (!targets.length) return;
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, role").in("id", targets);
    const rows = (profiles ?? []).map((p) => ({
      user_id: p.id,
      type,
      title,
      body: body.slice(0, 120),
      link:
        link ??
        (p.role === "office_admin" || p.role === "admin" ? "/office/crm/properties" : "/agent/crm/properties"),
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

/** Д-дүрмийн гүйцэтгэлийн лог (F-602). */
async function logRuleRun(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: "ok" | "error" | "skipped" | "dry_run" | "pending",
  result?: Record<string, unknown>,
  error?: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("crm_rule_runs").insert({
      office_id: officeId,
      rule_code: ruleCode,
      entity,
      entity_id: entityId,
      status,
      result: (result ?? null) as Json,
      error: error ?? null,
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

/** Дүрэм идэвхтэй эсэх (F-601): {active, dryRun}. Мөр байхгүй бол идэвхтэйд тооцно. */
async function ruleState(officeId: string, code: string): Promise<{ active: boolean; dryRun: boolean }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("crm_automation_rules")
      .select("is_active, dry_run")
      .eq("office_id", officeId)
      .eq("code", code)
      .maybeSingle();
    return { active: data?.is_active ?? true, dryRun: data?.dry_run ?? false };
  } catch {
    return { active: true, dryRun: false };
  }
}

/** DB guard-ын алдааг хэрэглэгчид ойлгомжтой болгоно. */
function friendlyDbError(message: string): string {
  if (message.includes("идэвхжүүлэлтийн босго дутуу")) {
    return message.replace(/^.*идэвхжүүлэлтийн босго дутуу/, "Идэвхжүүлэлтийн босго дутуу");
  }
  if (message.includes("шилжилт зөвшөөрөгдөөгүй")) return "Энэ статусын шилжилт зөвшөөрөгдөөгүй (F-202).";
  if (message.includes("шилжилтийн эрх алга")) return "Танд энэ статусын шилжилтийн эрх алга.";
  if (message.includes("шалтгаан заавал")) return "Энэ үйлдэлд шалтгаан заавал.";
  if (message.includes("бүсийн салбараас өөр салбар")) {
    return "Бүсийн салбараас өөр салбар сонгоход шалтгаан заавал (F-207).";
  }
  if (message.includes("эх сурвалжийн ролийг")) {
    return "Эх сурвалжийн ролийг зөвхөн Борлуулалтын захирал/ЧМТ шалтгаантайгаар шилжүүлнэ (F-206).";
  }
  if (message.includes("crm_sequences")) return "Дугаарлалтын тохиргоо (property) хийгдээгүй байна.";
  return SAVE_ERR;
}

// ── Схемүүд ───────────────────────────────────────────────

const addressSchema = z
  .object({
    district: z.string().trim().min(1, "Дүүрэг заавал"),
    khoroo: z.string().trim().max(50).optional().or(z.literal("")),
    complex: z.string().trim().max(120).optional().or(z.literal("")),
    building: z.string().trim().max(120).optional().or(z.literal("")),
    unit: z.string().trim().max(50).optional().or(z.literal("")),
  })
  .strict();

const matchTagsSchema = z
  .object({
    location: z.array(z.string().trim().min(1)).max(20),
    type: z.array(z.string().trim().min(1)).max(20),
    price: z.array(z.string().trim().min(1)).max(20),
    goal: z.array(z.string().trim().min(1)).max(20),
    special: z.array(z.string().trim().min(1)).max(20),
  })
  .strict();

const propertySchema = z
  .object({
    name: z.string().trim().min(1, "Нэр заавал").max(200),
    address: addressSchema,
    serviceKind: z.enum(SERVICE_KINDS),
    propertyType: z.enum(CRM_PROPERTY_TYPES),
    price: z.number().positive("Үнэ эерэг байх ёстой").nullable(),
    rentPrice: z.number().positive("Түрээсийн үнэ эерэг байх ёстой").nullable(),
    areaM2: z.number().positive("Талбай эерэг байх ёстой").nullable(),
    rooms: z.number().int().positive().nullable(),
    ownerContactId: z.string().uuid("Өмчлөгч сонгоно уу"),
    branchId: z.string().uuid().nullable(),
    branchOverrideReason: z.string().trim().max(300).nullable(),
    paymentDay: z.number().int().min(1).max(31).nullable(),
    features: z.array(z.string().trim().min(1)).max(40),
    matchTags: matchTagsSchema.nullable(),
    keyLocation: z.string().trim().max(200).nullable(),
    keyHolderId: z.string().uuid().nullable(),
  })
  .strict();

export type PropertyInput = z.infer<typeof propertySchema>;

function firstIssue(err: z.ZodError): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") ? msg : "Оролт буруу байна.";
}

// ── Үүсгэх (F-200/201/207, Д-30) ─────────────────────────

export async function createProperty(raw: PropertyInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = propertySchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const isRental = input.serviceKind !== "sale";
  if (!isRental && input.price == null) return { error: "Худалдах объектод үнэ заавал." };
  if (isRental && input.rentPrice == null) return { error: "Түрээсийн объектод түрээсийн үнэ заавал." };

  // Бүс автомат санал (F-207): zone lookup → branch; олдохгүй бол үүсгэгчийн салбар.
  const zone = await getZoneFor(input.address);
  const branchId = input.branchId ?? zone?.branchId ?? ctx.branchId;

  // Property ID — crm_next_number зөвхөн service-role (U2 конвенц).
  const admin = createAdminClient();
  const { data: number, error: numErr } = await admin.rpc("crm_next_number", {
    p_office: ctx.officeId,
    p_kind: "property",
  });
  if (numErr || !number) {
    console.error("createProperty number:", numErr?.message);
    return { error: "Объектын дугаар олгоход алдаа гарлаа. Дугаарлалтын тохиргоог шалгана уу." };
  }

  const { data: row, error } = await supabase
    .from("crm_properties")
    .insert({
      office_id: ctx.officeId,
      number,
      name: input.name,
      address: input.address as unknown as Json,
      branch_id: branchId,
      branch_override_reason: input.branchOverrideReason,
      service_kind: input.serviceKind,
      property_type: input.propertyType,
      zone_id: zone?.zoneId ?? null,
      price: input.price,
      rent_price: input.rentPrice,
      area_m2: input.areaM2,
      rooms: input.rooms,
      occupancy: input.serviceKind === "managed_rental" ? "vacant" : null,
      owner_contact_id: input.ownerContactId,
      payment_day: input.paymentDay,
      features: input.features,
      match_tags: input.matchTags as unknown as Json,
      key_location: input.keyLocation,
      key_holder_id: input.keyHolderId,
      created_by: ctx.profileId,
    })
    .select("id, branch_id")
    .single();
  if (error || !row) {
    console.error("createProperty:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  // Эх сурвалжийн роль автомат — бүртгэсэн агент (F-206, P-03).
  const { error: roleErr } = await supabase.from("crm_property_roles").insert({
    office_id: ctx.officeId,
    property_id: row.id,
    role: "sourcing",
    agent_profile_id: ctx.profileId,
  });
  if (roleErr) console.error("createProperty sourcing role:", roleErr.message);

  // Д-30: өөр салбарын бүс бол хамтран ажиллах даалгавар (F-605).
  if (row.branch_id && ctx.branchId && row.branch_id !== ctx.branchId) {
    const rule = await ruleState(ctx.officeId, "D-30");
    if (!rule.active) {
      await logRuleRun(ctx.officeId, "D-30", "crm_properties", row.id, "skipped", { reason: "inactive" });
    } else if (rule.dryRun) {
      await logRuleRun(ctx.officeId, "D-30", "crm_properties", row.id, "dry_run", { branch_id: row.branch_id });
    } else {
      try {
        const { data: partner } = await admin
          .from("crm_staff")
          .select("profile_id")
          .eq("office_id", ctx.officeId)
          .eq("branch_id", row.branch_id)
          .eq("is_active", true)
          .eq("offboarding", false)
          .contains("roles", ["agent"])
          .order("created_at")
          .limit(1)
          .maybeSingle();
        const responsible = partner?.profile_id ?? ctx.profileId;
        const { data: task } = await supabase
          .from("tasks")
          .insert({
            office_id: ctx.officeId,
            created_by: ctx.profileId,
            responsible_id: responsible,
            title: `Салбар хоорондын листингийн хамтын ажиллагаа (Д-30): ${input.name}`,
            description:
              "Өөр салбарын бүсэд бүртгэгдсэн листинг — орон нутгийн агент үзлэг/гэрээнд хамтарна. " +
              "Эх сурвалжийн роль бүртгэсэн агент дээр хадгалагдана (F-206).",
            priority: "normal",
          })
          .select("id")
          .single();
        await logRuleRun(ctx.officeId, "D-30", "crm_properties", row.id, "ok", {
          task_id: task?.id ?? null,
          partner: responsible,
        });
        if (responsible !== ctx.profileId) {
          await notify(
            [responsible],
            "crm_property_collab",
            "Хамтран ажиллах листинг",
            "Таны салбарын бүсэд өөр салбарын агент листинг бүртгэлээ — хамтран ажиллана уу."
          );
        }
      } catch (e) {
        await logRuleRun(ctx.officeId, "D-30", "crm_properties", row.id, "error", undefined, e instanceof Error ? e.message : String(e));
      }
    }
  }

  revalidatePropertyPaths();
  return { id: row.id };
}

// ── Засах (үнэгүй талбарууд) ─────────────────────────────

const updateSchema = propertySchema
  .omit({ price: true, rentPrice: true, ownerContactId: true })
  .partial()
  .extend({ id: z.string().uuid() })
  .strict();

export type PropertyUpdateInput = z.infer<typeof updateSchema>;

export async function updateProperty(raw: PropertyUpdateInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const patch: Database["public"]["Tables"]["crm_properties"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.address !== undefined) patch.address = input.address as unknown as Json;
  if (input.serviceKind !== undefined) patch.service_kind = input.serviceKind;
  if (input.propertyType !== undefined) patch.property_type = input.propertyType;
  if (input.areaM2 !== undefined) patch.area_m2 = input.areaM2;
  if (input.rooms !== undefined) patch.rooms = input.rooms;
  if (input.branchId !== undefined) patch.branch_id = input.branchId;
  if (input.branchOverrideReason !== undefined) patch.branch_override_reason = input.branchOverrideReason;
  if (input.paymentDay !== undefined) patch.payment_day = input.paymentDay;
  if (input.features !== undefined) patch.features = input.features;
  if (input.matchTags !== undefined) patch.match_tags = input.matchTags as unknown as Json;
  if (input.keyLocation !== undefined) patch.key_location = input.keyLocation;
  if (input.keyHolderId !== undefined) patch.key_holder_id = input.keyHolderId;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error, count } = await supabase
    .from("crm_properties")
    .update(patch, { count: "exact" })
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateProperty:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };

  // Тохируулгад нөлөөлөх өөрчлөлт → дахин тооцооллын дараалалд (F-255).
  if (input.matchTags !== undefined || input.features !== undefined || input.propertyType !== undefined) {
    await logRuleRun(ctx.officeId, "F-255", "crm_properties", input.id, "pending", { reason: "property_changed" });
  }

  revalidatePropertyPaths(input.id);
  return { ok: true };
}

// ── Үнэ (F-208 — RPC, шалтгаан заавал) ───────────────────

export async function updatePropertyPrice(
  id: string,
  input: { price?: number | null; rentPrice?: number | null; reason: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!input.reason?.trim()) return { ok: false, error: "Үнийн өөрчлөлтөд шалтгаан заавал (F-208)." };
  if (input.price == null && input.rentPrice == null) return { ok: false, error: "Шинэ үнэ оруулна уу." };
  if ((input.price != null && input.price <= 0) || (input.rentPrice != null && input.rentPrice <= 0)) {
    return { ok: false, error: "Үнэ эерэг байх ёстой." };
  }

  const { error } = await supabase.rpc("crm_update_property_price", {
    p_property: id,
    p_price: input.price ?? null,
    p_rent_price: input.rentPrice ?? null,
    p_reason: input.reason.trim(),
  });
  if (error) {
    console.error("updatePropertyPrice:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  // Үнийн өөрчлөлт → дахин тооцоолол (F-255).
  await logRuleRun(ctx.officeId, "F-255", "crm_properties", id, "pending", { reason: "price_changed" });
  revalidatePropertyPaths(id);
  return { ok: true };
}

// ── Статус (F-202/203, Д-07) ─────────────────────────────

export async function setPropertyStatus(
  id: string,
  status: CrmPropertyStatus,
  reason?: string
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!CRM_PROPERTY_STATUSES.includes(status)) return { ok: false, error: "Статус буруу байна." };

  const { data: before } = await supabase
    .from("crm_properties")
    .select("id, status, listing_id")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: NOT_FOUND_ERR };

  const { error } = await supabase.rpc("crm_set_property_status", {
    p_property: id,
    p_status: status,
    p_reason: reason?.trim() || null,
  });
  if (error) {
    console.error("setPropertyStatus:", error.message);
    // F-203: дутуу жагсаалтыг задална («…босго дутуу — А; Б; В»).
    const m = error.message.match(/идэвхжүүлэлтийн босго дутуу — (.+)$/);
    if (m) {
      return {
        ok: false,
        error: "Идэвхжүүлэлтийн босго дутуу байна (F-203).",
        missing: m[1].split(";").map((s) => s.trim()).filter(Boolean),
      };
    }
    return { ok: false, error: friendlyDbError(error.message) };
  }

  // Идэвхжүүлэлт → Д-07 урвуу тохируулга (F-254).
  if (status === "active" && before.status !== "active") {
    const rule = await ruleState(ctx.officeId, "D-07");
    if (!rule.active) {
      await logRuleRun(ctx.officeId, "D-07", "crm_properties", id, "skipped", { reason: "inactive" });
    } else if (rule.dryRun) {
      await logRuleRun(ctx.officeId, "D-07", "crm_properties", id, "dry_run", {});
    } else {
      // Их тооцоолол арын горимд (F-259) — cron crm-matching pending мөрөөр гүйцэтгэнэ.
      await logRuleRun(ctx.officeId, "D-07", "crm_properties", id, "pending", { reason: "activated" });
    }
  }

  // D1 синк: идэвхгүй болсон объектын нийтийн зар нуугдана.
  if (before.listing_id && status !== "active") {
    try {
      const admin = createAdminClient();
      await admin.from("listings").update({ status: "draft" }).eq("id", before.listing_id);
    } catch (e) {
      console.error("setPropertyStatus listing sync:", e instanceof Error ? e.message : e);
    }
  }

  revalidatePropertyPaths(id);
  return { ok: true };
}

// ── Роли (F-206) ─────────────────────────────────────────

export async function assignPropertyRole(
  propertyId: string,
  role: CrmPropertyRole,
  agentProfileId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!CRM_PROPERTY_ROLES.includes(role)) return { ok: false, error: "Роль буруу байна." };
  if (!agentProfileId) return { ok: false, error: "Агент сонгоно уу." };

  const { data: existing } = await supabase
    .from("crm_property_roles")
    .select("id, agent_profile_id")
    .eq("property_id", propertyId)
    .eq("role", role)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error:
        role === "sourcing"
          ? "Эх сурвалжийн роль аль хэдийн оноогдсон — өөрчлөлт зөвхөн шилжүүлэлтээр (F-206)."
          : "Энэ роль аль хэдийн оноогдсон — «Шилжүүлэх» үйлдлээр солино уу.",
    };
  }

  const { error } = await supabase.from("crm_property_roles").insert({
    office_id: ctx.officeId,
    property_id: propertyId,
    role,
    agent_profile_id: agentProfileId,
  });
  if (error) {
    console.error("assignPropertyRole:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidatePropertyPaths(propertyId);
  return { ok: true };
}

export async function reassignPropertyRole(
  propertyId: string,
  role: CrmPropertyRole,
  agentProfileId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!reason?.trim()) return { ok: false, error: "Ролийн шилжүүлэлтэд шалтгаан заавал." };

  const { error } = await supabase.rpc("crm_reassign_property_role", {
    p_property: propertyId,
    p_role: role,
    p_new_agent: agentProfileId,
    p_reason: reason.trim(),
  });
  if (error) {
    console.error("reassignPropertyRole:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidatePropertyPaths(propertyId);
  return { ok: true };
}

// ── Листингийн гэрээ (F-205) ─────────────────────────────

const agreementSchema = z
  .object({
    propertyId: z.string().uuid(),
    number: z.string().trim().min(1, "Гэрээний дугаар заавал").max(60),
    signedOn: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Гарын үсэг зурсан огноо буруу"),
    expiresOn: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Дуусах огноо буруу"),
    specialTerms: z.string().trim().max(1000).nullable(),
  })
  .strict();

export type ListingAgreementInput = z.infer<typeof agreementSchema>;

export async function createListingAgreement(raw: ListingAgreementInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = agreementSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  if (input.signedOn > input.expiresOn) return { error: "Дуусах огноо гарын үсгийн огнооноос өмнө байж болохгүй." };

  const { data, error } = await supabase
    .from("crm_listing_agreements")
    .insert({
      office_id: ctx.officeId,
      property_id: input.propertyId,
      number: input.number,
      signed_on: input.signedOn.slice(0, 10),
      expires_on: input.expiresOn.slice(0, 10),
      special_terms: input.specialTerms,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createListingAgreement:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }
  revalidatePropertyPaths(input.propertyId);
  return { id: data.id };
}

// ── Ашиглалтын статус (F-210/565) ────────────────────────

export async function setOccupancy(
  propertyId: string,
  occupancy: OccupancyStatus
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!OCCUPANCY_STATUSES.includes(occupancy)) return { ok: false, error: "Ашиглалтын статус буруу байна." };

  const { error, count } = await supabase
    .from("crm_properties")
    .update({ occupancy }, { count: "exact" })
    .eq("id", propertyId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setOccupancy:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };
  revalidatePropertyPaths(propertyId);
  return { ok: true };
}

// ── Тоолуур (F-214) ──────────────────────────────────────

export async function addMeter(
  propertyId: string,
  input: { meterType: string; serial?: string | null }
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  if (!input.meterType?.trim()) return { error: "Тоолуурын төрөл заавал." };

  const { data, error } = await supabase
    .from("crm_meters")
    .insert({
      office_id: ctx.officeId,
      property_id: propertyId,
      meter_type: input.meterType.trim(),
      serial: input.serial?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("addMeter:", error?.message);
    return { error: SAVE_ERR };
  }
  revalidatePropertyPaths(propertyId);
  return { id: data.id };
}

export async function addMeterReading(
  meterId: string,
  input: { reading: number; readOn: string }
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  if (!Number.isFinite(input.reading) || input.reading < 0) return { error: "Заалт буруу байна." };
  if (Number.isNaN(Date.parse(input.readOn))) return { error: "Огноо буруу байна." };

  const { data, error } = await supabase
    .from("crm_meter_readings")
    .insert({
      office_id: ctx.officeId,
      meter_id: meterId,
      reading: input.reading,
      read_on: input.readOn.slice(0, 10),
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("addMeterReading:", error?.message);
    return { error: SAVE_ERR };
  }
  revalidatePropertyPaths();
  return { id: data.id };
}

// ── Нийтийн сайтад нийтлэх (D1 синк) ─────────────────────

export async function publishToSite(propertyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: propRaw } = await supabase
    .from("crm_properties")
    .select(
      "id, number, name, address, service_kind, property_type, price, rent_price, area_m2, rooms, status, features, listing_id, " +
        "roles:crm_property_roles(role, agent_profile_id)"
    )
    .eq("id", propertyId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  type RoleLite = { role: CrmPropertyRole; agent_profile_id: string };
  type PropLite = {
    id: string;
    number: string;
    name: string;
    address: Json;
    service_kind: string;
    property_type: string;
    price: number | null;
    rent_price: number | null;
    area_m2: number | null;
    rooms: number | null;
    status: string;
    features: string[];
    listing_id: string | null;
    roles: RoleLite[];
  };
  const prop = (propRaw ?? null) as unknown as PropLite | null;
  if (!prop) return { ok: false, error: NOT_FOUND_ERR };
  if (prop.status !== "active") return { ok: false, error: "Зөвхөн Идэвхтэй объектыг сайтад нийтэлнэ (F-202)." };

  const roles = prop.roles ?? [];
  const agentProfile =
    roles.find((r) => r.role === "sourcing")?.agent_profile_id ??
    roles.find((r) => r.role === "contract")?.agent_profile_id ??
    ctx.profileId;

  const admin = createAdminClient();
  const { data: agentRow } = await admin
    .from("agents")
    .select("id")
    .eq("profile_id", agentProfile)
    .maybeSingle();
  if (!agentRow) {
    return { ok: false, error: "Эх сурвалжийн агентад нийтийн агент профайл алга — эхлээд агентаа бүртгүүлнэ үү." };
  }

  const address = (prop.address ?? {}) as { district?: string };
  const isRental = prop.service_kind !== "sale";
  const priceValue = isRental ? prop.rent_price : prop.price;
  if (priceValue == null) return { ok: false, error: "Үнэ бүртгэгдээгүй тул нийтлэх боломжгүй." };

  const listingPayload: Database["public"]["Tables"]["listings"]["Insert"] = {
    agent_id: agentRow.id,
    title: prop.name,
    district: address.district ?? null,
    type: CRM_PROPERTY_TYPE_LABEL[prop.property_type as keyof typeof CRM_PROPERTY_TYPE_LABEL] ?? prop.property_type,
    rooms: prop.rooms ?? 0,
    area: prop.area_m2,
    price: Math.round(Number(priceValue)),
    deal_type: isRental ? "rent" : "sale",
    status: "active",
    description: (prop.features ?? []).join(", ") || null,
    amenities: prop.features ?? [],
  };

  try {
    if (prop.listing_id) {
      const { error } = await admin.from("listings").update(listingPayload).eq("id", prop.listing_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: listing, error } = await admin.from("listings").insert(listingPayload).select("id").single();
      if (error || !listing) throw new Error(error?.message ?? "insert failed");
      const { error: linkErr } = await supabase
        .from("crm_properties")
        .update({ listing_id: listing.id })
        .eq("id", propertyId)
        .eq("office_id", ctx.officeId);
      if (linkErr) console.error("publishToSite link:", linkErr.message);
    }
  } catch (e) {
    console.error("publishToSite:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Сайтад нийтлэхэд алдаа гарлаа. Дахин оролдоно уу." };
  }

  revalidatePropertyPaths(propertyId);
  return { ok: true };
}

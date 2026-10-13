"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { getSignedUrl } from "@/lib/queries-crm-docs";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/constants-crm";

/**
 * Баримтын бичилтүүд (U5 — F-700–709).
 *  • F-703: upload бүр settings 'doc_upload_policy'-ийн MIME whitelist +
 *    өргөтгөл↔MIME тулгалт + хэмжээний шалгалтаар; зөрвөл монгол алдаа.
 *  • Private bucket 'crm-docs' — файл service role-оор байрлана,
 *    метадата crm_documents-д ХЭРЭГЛЭГЧИЙН клиентээр (RLS сахина).
 *  • F-707: устгал retention trigger-ээр хамгаалагдсан.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

const LINK_ENTITIES = ["transaction", "opportunity", "contact", "property", "lease", "maintenance", "aml_case"] as const;

const EXT_MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

type UploadPolicy = Record<string, { allowed_mime?: string[]; max_bytes?: number }>;

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function revalidateForEntity(entity: string, entityId: string) {
  if (entity === "transaction") revalidatePath(`/office/crm/transactions/${entityId}`);
  if (entity === "property") {
    revalidatePath(`/office/crm/properties/${entityId}`);
    revalidatePath(`/agent/crm/properties/${entityId}`);
  }
  if (entity === "contact") revalidatePath(`/office/crm/contacts/${entityId}`);
  if (entity === "opportunity") revalidatePath(`/office/crm/deals/${entityId}`);
  if (entity === "aml_case") revalidatePath(`/office/crm/aml/${entityId}`);
}

function friendlyDocError(message: string): string {
  const idx = message.indexOf("CRM_DOC:");
  if (idx !== -1) return message.slice(idx + "CRM_DOC:".length).trim() || SAVE_ERR;
  if (message.includes("row-level security")) return "Танд энэ үйлдлийг хийх эрх алга.";
  return SAVE_ERR;
}

// ── Байршуулах (F-700/701/703) ────────────────────────────

export type UploadDocumentResult = { id?: string; error?: string };

export async function uploadDocument(formData: FormData): Promise<UploadDocumentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "");
  const entity = String(formData.get("entity") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const titleRaw = String(formData.get("title") ?? "").trim();
  const parentDocumentId = String(formData.get("parentDocumentId") ?? "").trim() || null;

  if (!(file instanceof File) || file.size === 0) return { error: "Файл сонгоно уу." };
  if (!(DOC_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Баримтын ангилал буруу байна." };
  }
  if (!(LINK_ENTITIES as readonly string[]).includes(entity) || !entityId) {
    return { error: "Хавсаргах объект буруу байна." };
  }
  if (category === "aml" && !ctx.roles.includes("aml_officer")) {
    return { error: "МУТСТ ангиллын баримтыг зөвхөн хяналт тавих ажилтан байршуулна (F-706)." };
  }

  // F-703: ангилал тус бүрийн MIME whitelist + хэмжээ (settings).
  const { data: policyData } = await supabase.rpc("crm_setting_at", {
    p_office: ctx.officeId,
    p_key: "doc_upload_policy",
  });
  const policy = (policyData ?? {}) as UploadPolicy;
  const rule = policy[category] ?? policy.default ?? {};
  const allowedMime = rule.allowed_mime ?? ["application/pdf", "image/jpeg", "image/png"];
  const maxBytes = rule.max_bytes ?? 20 * 1024 * 1024;

  const mime = file.type || "application/octet-stream";
  if (!allowedMime.includes(mime)) {
    return { error: `Энэ ангилалд «${mime}» төрлийн файл зөвшөөрөгдөөгүй (F-703).` };
  }
  if (file.size > maxBytes) {
    return { error: `Файлын хэмжээ дээд хязгаараас (${Math.round(maxBytes / 1048576)}MB) их байна (F-703).` };
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ext || !EXT_MIME[ext] || !EXT_MIME[ext].includes(mime)) {
    return { error: "Файлын өргөтгөл MIME төрөлтэй тохирохгүй байна (F-703)." };
  }

  // Private bucket — service role-оор байршуулна (клиент шууд хандахгүй).
  const admin = createAdminClient();
  const objectName = `${ctx.officeId}/${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from("crm-docs").upload(objectName, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    console.error("uploadDocument storage:", upErr.message);
    return { error: "Файл байршуулахад алдаа гарлаа. Дахин оролдоно уу." };
  }

  // Метадата — ХЭРЭГЛЭГЧИЙН клиент (RLS сахина; алдвал файлыг цэвэрлэнэ).
  const { data: doc, error } = await supabase
    .from("crm_documents")
    .insert({
      office_id: ctx.officeId,
      category: category as DocCategory,
      title: titleRaw || file.name,
      storage_path: `crm-docs/${objectName}`,
      mime,
      size_bytes: file.size,
      parent_document_id: parentDocumentId,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error || !doc) {
    console.error("uploadDocument:", error?.message);
    await admin.storage.from("crm-docs").remove([objectName]).catch(() => undefined);
    return { error: friendlyDocError(error?.message ?? "") };
  }

  const { error: linkErr } = await supabase.from("crm_document_links").insert({
    document_id: doc.id,
    entity,
    entity_id: entityId,
  });
  if (linkErr) console.error("uploadDocument link:", linkErr.message);

  // F-702: шинэ хувилбар — өмнөх хувилбарын холбоосуудыг шинэ рүү шилжүүлнэ.
  if (parentDocumentId) {
    try {
      const { data: oldLinks } = await supabase
        .from("crm_document_links")
        .select("entity, entity_id, is_cover, sort_order")
        .eq("document_id", parentDocumentId);
      for (const l of oldLinks ?? []) {
        if (l.entity === entity && l.entity_id === entityId) continue;
        await supabase.from("crm_document_links").insert({
          document_id: doc.id,
          entity: l.entity,
          entity_id: l.entity_id,
          is_cover: l.is_cover,
          sort_order: l.sort_order,
        });
      }
      await supabase.from("crm_document_links").delete().eq("document_id", parentDocumentId);
    } catch (e) {
      console.error("uploadDocument version links:", e instanceof Error ? e.message : e);
    }
  }

  revalidateForEntity(entity, entityId);
  return { id: doc.id };
}

// ── Татах холбоос (F-709 аудиттай — queries-crm-docs-ийн wrapper) ──

export async function getDocumentUrl(docId: string): Promise<{ url?: string; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  return getSignedUrl(docId);
}

// ── Холбоос (M:N — F-700) ─────────────────────────────────

export async function linkDocument(
  docId: string,
  entity: string,
  entityId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!(LINK_ENTITIES as readonly string[]).includes(entity) || !entityId) {
    return { ok: false, error: "Хавсаргах объект буруу байна." };
  }
  const { error } = await supabase.from("crm_document_links").insert({
    document_id: docId,
    entity,
    entity_id: entityId,
  });
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Энэ объектод аль хэдийн хавсрагдсан." };
    }
    console.error("linkDocument:", error.message);
    return { ok: false, error: friendlyDocError(error.message) };
  }
  revalidateForEntity(entity, entityId);
  return { ok: true };
}

export async function unlinkDocument(
  docId: string,
  entity: string,
  entityId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { error, count } = await supabase
    .from("crm_document_links")
    .delete({ count: "exact" })
    .eq("document_id", docId)
    .eq("entity", entity)
    .eq("entity_id", entityId);
  if (error) {
    console.error("unlinkDocument:", error.message);
    return { ok: false, error: friendlyDocError(error.message) };
  }
  if (!count) return { ok: false, error: "Холбоос олдсонгүй эсвэл танд эрх алга." };
  revalidateForEntity(entity, entityId);
  return { ok: true };
}

// ── Устгах (F-707 retention guard DB-д) ───────────────────

export async function deleteDocument(docId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: doc } = await supabase
    .from("crm_documents")
    .select("id, storage_path")
    .eq("id", docId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Баримт олдсонгүй эсвэл танд эрх алга." };

  const { error, count } = await supabase
    .from("crm_documents")
    .delete({ count: "exact" })
    .eq("id", docId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("deleteDocument:", error.message);
    return { ok: false, error: friendlyDocError(error.message) };
  }
  if (!count) return { ok: false, error: "Устгах эрх алга." };

  try {
    const admin = createAdminClient();
    await admin.storage.from("crm-docs").remove([doc.storage_path.replace(/^crm-docs\//, "")]);
  } catch (e) {
    console.error("deleteDocument storage:", e instanceof Error ? e.message : e);
  }
  revalidatePath("/office/crm/transactions");
  return { ok: true };
}

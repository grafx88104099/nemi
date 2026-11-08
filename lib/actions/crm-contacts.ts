"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import {
  findDuplicates,
  getContacts,
  type ContactFilters,
  type DuplicateHit,
} from "@/lib/queries-crm-contacts";
import {
  validateContactInput,
  validateSavedView,
  type ContactInput,
} from "@/lib/validation/crm";
import { normalizePhone, normalizeEmail } from "@/lib/crm/normalize";
import { CONSENT_STATUSES, type ConsentStatus } from "@/lib/constants-crm";
import { findDuplicatesMasked, type MaskedDuplicate } from "@/lib/actions/crm-ownership";
import { authorizeExport } from "@/lib/actions/crm-exports";

/** Эх сурвалж тайлбар шаардах эсэх (лавлахын requires_note). */
async function sourceNeedsNote(sourceId: string): Promise<{ ok: boolean; requiresNote: boolean }> {
  const admin = createAdminClient();
  const { data } = await admin.from("crm_lookups").select("kind, requires_note").eq("id", sourceId).maybeSingle();
  if (!data || data.kind !== "lead_source") return { ok: false, requiresNote: false };
  return { ok: true, requiresNote: data.requires_note };
}

/**
 * Утас/и-мэйлээр өөр агентын нээлттэй сэжимтэй харилцагч олдсон эсэх —
 * ийм үед шинэ давхар бүртгэл үүсгэхгүй, эзэмшлийн маргааны замаар явна (§6.26).
 */
function blockingDuplicate(hits: MaskedDuplicate[]): MaskedDuplicate | null {
  return (
    hits.find(
      (h) =>
        (h.match_kind === "phone" || h.match_kind === "email") &&
        !!h.open_lead_id &&
        h.has_owner &&
        !h.owner_is_me
    ) ?? null
  );
}

/**
 * Харилцагчийн бичилтүүд (U2 — F-100–124). RLS давхар хамгаална;
 * бүх бичилт .eq("office_id") давхар scoping-той.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

function revalidateContactPaths(id?: string) {
  revalidatePath("/office/crm/contacts");
  revalidatePath("/agent/crm/contacts");
  if (id) {
    revalidatePath(`/office/crm/contacts/${id}`);
    revalidatePath(`/agent/crm/contacts/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

/** Аудит бичих — definer RPC; алдаа үндсэн үйлдлийг унагахгүй. */
async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  extra?: { field?: string; reason?: string; newValue?: unknown }
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: extra?.field ?? null,
      p_old: null,
      p_new: extra?.newValue != null ? JSON.parse(JSON.stringify(extra.newValue)) : null,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

// ── Давхардлын live шалгалт (F-107 — LeadFormModal/DuplicateHint) ──

export async function findDuplicatesAction(input: {
  phone?: string;
  email?: string;
  name?: string;
  excludeContactId?: string;
}): Promise<{ hits: DuplicateHit[]; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { hits: [], error: c.error };
  try {
    const hits = await findDuplicates(input);
    return { hits };
  } catch (e) {
    console.error("findDuplicatesAction:", e instanceof Error ? e.message : e);
    return { hits: [] };
  }
}

// ── Үүсгэх / засах ────────────────────────────────────────

export type CreateContactResult = {
  id?: string;
  error?: string;
  duplicates?: DuplicateHit[];
  /** Оффисын хэмжээний масктай давхардал (өөр агентын бүртгэл ч орно). */
  maskedDuplicates?: MaskedDuplicate[];
};

export async function createContact(raw: ContactInput): Promise<CreateContactResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = validateContactInput(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;

  const src = await sourceNeedsNote(input.sourceId);
  if (!src.ok) return { error: "Эх сурвалж буруу байна." };
  if (src.requiresNote && !input.sourceDetail?.trim()) {
    return { error: "Энэ эх сурвалжид тайлбар заавал — дэлгэрэнгүйг бичнэ үү." };
  }

  // Давхардлын шалгалт — RLS хүрээнд + оффисын хэмжээнд масктай (§6.26).
  const dupName = input.kind === "person" ? `${input.firstName ?? ""}`.trim() : (input.orgName ?? "");
  const [dupHits, masked] = await Promise.all([
    findDuplicates({ phone: input.phones[0], email: input.emails[0], name: dupName }),
    findDuplicatesMasked({
      phone: input.phones[0] || undefined,
      email: input.emails[0] || undefined,
      name: dupName.length >= 3 ? dupName : undefined,
    }),
  ]);
  const maskedHits = masked.hits ?? [];
  const blocking = blockingDuplicate(maskedHits);
  if (blocking) {
    return {
      error:
        "Энэ утас/и-мэйлтэй харилцагч өөр агентын нээлттэй сэжимд бүртгэлтэй — давхар бүртгэл үүсгэхгүй. Эзэмшлийн маргаан нээж болно.",
      duplicates: dupHits,
      maskedDuplicates: maskedHits,
    };
  }
  if ((dupHits.length > 0 || maskedHits.length > 0) && !input.duplicateOverride) {
    return {
      error: "Ижил төстэй бүртгэл олдлоо — давхардлыг шалгаад байгаа бүртгэлийг сонгох эсвэл «Шинээр үүсгэх»-ийг баталгаажуулна уу.",
      duplicates: dupHits,
      maskedDuplicates: maskedHits,
    };
  }

  // Client ID — crm_next_number зөвхөн service-role тул admin client-ээр.
  const admin = createAdminClient();
  const { data: number, error: numErr } = await admin.rpc("crm_next_number", {
    p_office: ctx.officeId,
    p_kind: "contact",
  });
  if (numErr || !number) {
    console.error("createContact number:", numErr?.message);
    return { error: "Харилцагчийн дугаар олгоход алдаа гарлаа. Дугаарлалтын тохиргоог шалгана уу." };
  }

  const displayName =
    input.kind === "person"
      ? [input.lastName, input.firstName].filter(Boolean).join(" ").trim() || (input.firstName ?? "")
      : (input.orgName ?? "");

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .insert({
      office_id: ctx.officeId,
      number,
      kind: input.kind,
      last_name: input.lastName,
      first_name: input.firstName,
      org_name: input.orgName,
      display_name: displayName,
      contact_types: input.contactTypes,
      source_id: input.sourceId,
      source_detail: input.sourceDetail,
      branch_id: input.branchId ?? ctx.branchId,
      consent: input.consent,
      consent_at: input.consent !== "not_asked" ? new Date().toISOString() : null,
      consent_channel: input.consentChannel,
      privacy_level: input.privacyLevel ?? "standard",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !contact) {
    console.error("createContact:", error?.message);
    return { error: SAVE_ERR };
  }
  let channelError: string | null = null;

  // Утас/и-мэйл (эхнийх нь үндсэн).
  if (input.phones.length > 0) {
    const { error: pErr } = await supabase.from("crm_contact_phones").insert(
      input.phones.map((p, i) => ({
        office_id: ctx.officeId,
        contact_id: contact.id,
        raw: p,
        normalized: normalizePhone(p),
        is_primary: i === 0,
      }))
    );
    if (pErr) {
      console.error("createContact phones:", pErr.message);
      channelError = "Харилцагч бүртгэгдсэн боловч утас хадгалагдсангүй — картаас дахин нэмнэ үү.";
    }
  }
  if (input.emails.length > 0) {
    const { error: eErr } = await supabase.from("crm_contact_emails").insert(
      input.emails.map((e, i) => ({
        office_id: ctx.officeId,
        contact_id: contact.id,
        email: normalizeEmail(e) || e,
        is_primary: i === 0,
      }))
    );
    if (eErr) {
      console.error("createContact emails:", eErr.message);
      channelError = channelError ?? "Харилцагч бүртгэгдсэн боловч и-мэйл хадгалагдсангүй — картаас дахин нэмнэ үү.";
    }
  }

  // Анхааруулгыг үл хэрэгссэн бол аудитад.
  const overridden = [...new Set([...dupHits.map((h) => h.contact_id), ...maskedHits.map((h) => h.contact_id)])];
  if (overridden.length > 0 && input.duplicateOverride) {
    await writeAudit(ctx.officeId, "crm_contacts", contact.id, "duplicate_override", {
      reason: `Давхардлын анхааруулгыг үл хэрэгсэв (${overridden.length} тохирол)`,
      newValue: overridden,
    });
  }

  revalidateContactPaths();
  return { id: contact.id, error: channelError ?? undefined };
}

export async function updateContact(raw: ContactInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateContactInput(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  if (!input.id) return { ok: false, error: "Бүртгэлийн дугаар алга." };
  const src = await sourceNeedsNote(input.sourceId);
  if (!src.ok) return { ok: false, error: "Эх сурвалж буруу байна." };
  if (src.requiresNote && !input.sourceDetail?.trim()) {
    return { ok: false, error: "Энэ эх сурвалжид тайлбар заавал." };
  }

  const displayName =
    input.kind === "person"
      ? [input.lastName, input.firstName].filter(Boolean).join(" ").trim() || (input.firstName ?? "")
      : (input.orgName ?? "");

  const { error, count } = await supabase
    .from("crm_contacts")
    .update(
      {
        kind: input.kind,
        last_name: input.lastName,
        first_name: input.firstName,
        org_name: input.orgName,
        display_name: displayName,
        contact_types: input.contactTypes,
        source_id: input.sourceId,
        source_detail: input.sourceDetail,
        branch_id: input.branchId,
        ...(input.privacyLevel ? { privacy_level: input.privacyLevel } : {}),
      },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateContact:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд засах эрх алга." };

  revalidateContactPaths(input.id);
  return { ok: true };
}

/** F-114: зөвшөөрлийн төлөв — огноо, суваг заавал хамт бүртгэгдэнэ. */
export async function setConsent(
  contactId: string,
  consent: ConsentStatus,
  channel: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!CONSENT_STATUSES.includes(consent)) return { ok: false, error: "Зөвшөөрлийн төлөв буруу." };

  const { error, count } = await supabase
    .from("crm_contacts")
    .update(
      {
        consent,
        consent_at: consent === "not_asked" ? null : new Date().toISOString(),
        consent_channel: consent === "not_asked" ? null : channel,
      },
      { count: "exact" }
    )
    .eq("id", contactId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setConsent:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  revalidateContactPaths(contactId);
  return { ok: true };
}

// ── Утас / и-мэйл (F-102/103) ─────────────────────────────

export async function addPhone(contactId: string, raw: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const normalized = normalizePhone(raw);
  if (normalized === "") return { ok: false, error: "Утасны дугаар буруу байна." };

  const { error } = await supabase.from("crm_contact_phones").insert({
    office_id: ctx.officeId,
    contact_id: contactId,
    raw: raw.trim(),
    normalized,
  });
  if (error) {
    console.error("addPhone:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateContactPaths(contactId);
  return { ok: true };
}

/** Холбоо барих сувгийн доод шаардлага (§6.2): сүүлийн утас/и-мэйлийг устгахгүй. */
async function channelCount(contactId: string): Promise<number> {
  const supabase = await createClient();
  const [p, e] = await Promise.all([
    supabase.from("crm_contact_phones").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
    supabase.from("crm_contact_emails").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
  ]);
  return (p.count ?? 0) + (e.count ?? 0);
}

const LAST_CHANNEL_ERR = "Харилцагчид дор хаяж нэг холбоо барих суваг (утас эсвэл и-мэйл) үлдэнэ — эхлээд шинийг нэмнэ үү.";

export async function removePhone(phoneId: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if ((await channelCount(contactId)) <= 1) return { ok: false, error: LAST_CHANNEL_ERR };
  const { error, count } = await supabase
    .from("crm_contact_phones")
    .delete({ count: "exact" })
    .eq("id", phoneId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("removePhone:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Мөр олдсонгүй эсвэл танд эрх алга." };
  revalidateContactPaths(contactId);
  return { ok: true };
}

export async function addEmail(contactId: string, raw: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const email = normalizeEmail(raw);
  if (email === "") return { ok: false, error: "И-мэйлийн формат буруу байна." };

  const { error } = await supabase.from("crm_contact_emails").insert({
    office_id: ctx.officeId,
    contact_id: contactId,
    email,
  });
  if (error) {
    console.error("addEmail:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateContactPaths(contactId);
  return { ok: true };
}

export async function removeEmail(emailId: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if ((await channelCount(contactId)) <= 1) return { ok: false, error: LAST_CHANNEL_ERR };
  const { error, count } = await supabase
    .from("crm_contact_emails")
    .delete({ count: "exact" })
    .eq("id", emailId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("removeEmail:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Мөр олдсонгүй эсвэл танд эрх алга." };
  revalidateContactPaths(contactId);
  return { ok: true };
}

// ── Багц шошго (F-118/122) ────────────────────────────────

export async function addTags(
  contactIds: string[],
  lookupIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (contactIds.length === 0 || lookupIds.length === 0) {
    return { ok: false, error: "Харилцагч болон шошго сонгоно уу." };
  }
  if (contactIds.length > 100) return { ok: false, error: "Нэг удаад дээд тал нь 100 бүртгэл." };

  const rows = contactIds.flatMap((cid) =>
    lookupIds.map((lid) => ({ contact_id: cid, lookup_id: lid, office_id: ctx.officeId }))
  );
  const { error } = await supabase
    .from("crm_contact_tags")
    .upsert(rows, { onConflict: "contact_id,lookup_id", ignoreDuplicates: true });
  if (error) {
    console.error("addTags:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateContactPaths();
  return { ok: true };
}

export async function removeTags(
  contactIds: string[],
  lookupIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (contactIds.length === 0 || lookupIds.length === 0) {
    return { ok: false, error: "Харилцагч болон шошго сонгоно уу." };
  }
  const { error } = await supabase
    .from("crm_contact_tags")
    .delete()
    .in("contact_id", contactIds)
    .in("lookup_id", lookupIds)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("removeTags:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateContactPaths();
  return { ok: true };
}

// ── Экспорт (F-123 — эрхийн хяналт + аудит) ───────────────

export async function exportContacts(
  filters: ContactFilters
): Promise<{ csv?: string; error?: string; needsRequest?: boolean }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const rows = await getContacts(filters);
  // §6.32: экспорт зөвшөөрлөөр (удирдлага тохиргооны дээд мөр хүртэл шууд).
  const auth = await authorizeExport("contacts", rows.length);
  if (!auth.ok) return { error: auth.error, needsRequest: auth.needsRequest };
  const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = "Дугаар,Нэр,Хэлбэр,Төрөл,Утас,И-мэйл,Төлөв,Зөвшөөрөл,Бүртгэсэн огноо";
  const lines = rows.map((r) =>
    [
      esc(r.number),
      esc(r.display_name),
      esc(r.kind),
      esc(r.contact_types.join("; ")),
      esc(r.phones.map((p) => p.raw).join("; ")),
      esc(r.emails.map((e) => e.email).join("; ")),
      esc(r.lifecycle),
      esc(r.consent),
      esc(r.created_at),
    ].join(",")
  );

  // Экспорт бүр аудит логт (F-123).
  await writeAudit(ctx.officeId, "crm_contacts", ctx.staffId, "export", {
    reason: `Харилцагчийн экспорт (${rows.length} мөр)${auth.requestId ? " — зөвшөөрөлтэй хүсэлтээр" : ""}`,
    newValue: filters as unknown as Record<string, unknown>,
  });

  return { csv: [header, ...lines].join("\n") };
}

// ── Хадгалсан харагдац (F-121) ────────────────────────────

export async function saveSavedView(raw: {
  page: string;
  name: string;
  params: Record<string, string>;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = validateSavedView(raw);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await supabase
    .from("crm_saved_views")
    .insert({
      office_id: ctx.officeId,
      profile_id: user.id,
      page: parsed.data.page,
      name: parsed.data.name,
      params: parsed.data.params,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("saveSavedView:", error?.message);
    return { error: SAVE_ERR };
  }
  revalidatePath("/office/crm/leads");
  revalidatePath("/office/crm/contacts");
  return { id: data.id };
}

export async function deleteSavedView(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };

  const { error, count } = await supabase
    .from("crm_saved_views")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) {
    console.error("deleteSavedView:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Харагдац олдсонгүй." };
  revalidatePath("/office/crm/leads");
  revalidatePath("/office/crm/contacts");
  return { ok: true };
}

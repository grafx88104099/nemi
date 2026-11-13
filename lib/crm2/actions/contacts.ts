"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { isFullPhone } from "@/lib/crm2/phone";
import { searchContacts as searchContactsQuery, type ContactListItem } from "@/lib/crm2/queries/contacts";
import {
  contactCreateSchema,
  contactUpdateSchema,
  idSchema,
  phoneAddSchema,
  phoneLookupSchema,
  phoneUpdateSchema,
  requirementCreateSchema,
  requirementUpdateSchema,
  searchQuerySchema,
  transferContactSchema,
  type ContactCreateInput,
  type ContactUpdateInput,
  type RequirementCreateInput,
  type RequirementUpdateInput,
} from "@/lib/crm2/schemas";
import type { Crm2ApplyOutcome, Crm2CreateContactResult, Crm2PhoneMatch, Crm2Result } from "@/lib/crm2/types";

/**
 * Харилцагч (T07): үүсгэх зөвхөн crm2_create_contact (дугаар заавал, давхардлын
 * шалгалт, автоматаар нэгтгэхгүй); нэр/тэмдэглэл/архив, дугаар, шаардлага шууд
 * REST (RLS); хариуцагч солих — шилжүүлэх RPC.
 */

/**
 * Шинэ харилцагч. Ижил дугаартай харилцагч байвал (allow_duplicate=false) ҮҮСГЭХГҮЙ —
 * data.contact_id = null, data.duplicates-д далд нэртэй жагсаалт. Хэрэглэгч
 * «Тусдаа хүн» гэж батлавал allow_duplicate=true-гээр дахин дуудна.
 */
export async function createContact(input: ContactCreateInput): Promise<Crm2Result<Crm2CreateContactResult>> {
  const parsed = contactCreateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const { data, error } = await session.supabase.rpc("crm2_create_contact", {
    p_full_name: v.full_name,
    p_phones: v.phones.map((p) => ({ phone: p.phone, label: p.label ?? null })),
    p_note: v.note ?? null,
    p_agent: v.agent_id ?? null,
    p_allow_duplicate: v.allow_duplicate ?? false,
  });
  if (error) return dbFail("createContact", error);
  const res = data as unknown as Crm2CreateContactResult;
  if (res?.contact_id) revalidateCrm2();
  return ok({ contact_id: res?.contact_id ?? null, code: res?.code ?? null, duplicates: res?.duplicates ?? [] });
}

/** Бүтэн дугаараар шалгах (S04). property_id өгвөл тухайн хөрөнгө дээрх нээлттэй хэлцлийг харуулна. */
export async function findContactsByPhone(phone: string, propertyId?: string | null): Promise<Crm2Result<Crm2PhoneMatch[]>> {
  const parsed = phoneLookupSchema.safeParse({ phone, property_id: propertyId });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  if (!isFullPhone(parsed.data.phone)) return fail("Утасны дугаарыг бүтнээр оруулна уу.");
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_find_contacts_by_phone", {
    p_phone: parsed.data.phone,
    p_property: parsed.data.property_id ?? null,
  });
  if (error) return dbFail("findContactsByPhone", error);
  return ok(data ?? []);
}

/** Харах эрхтэй харилцагчаас нэр/код/дугаараар хайх (эзэн сонгох г.м.). */
export async function searchContacts(query: string, limit = 10): Promise<Crm2Result<ContactListItem[]>> {
  const q = searchQuerySchema.safeParse(query);
  if (!q.success) return fail(zodErrorText(q.error));
  if (!q.data) return ok([]);
  return ok(await searchContactsQuery(q.data, limit));
}

/** Нэр, тэмдэглэл, архивлах/сэргээх (status). */
export async function updateContact(input: ContactUpdateInput): Promise<Crm2Result<null>> {
  const parsed = contactUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { contact_id, ...fields } = parsed.data;
  const patch = definedOnly(fields);
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_contacts").update(patch).eq("id", contact_id).select("id");
  if (error) return dbFail("updateContact", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/**
 * Хариуцагч солих: батлагч эсвэл хоёр агентын ахлагч → 'applied'; бусад → 'pending'
 * (хүсэлт). with_deals — нээлттэй хэлцлүүдийг хамт; нээлттэй ажил дагаж шилжинэ.
 */
export async function transferContact(input: {
  contact_id: string;
  to_agent_id: string;
  reason: string;
  with_deals?: boolean;
}): Promise<Crm2Result<Crm2ApplyOutcome>> {
  const parsed = transferContactSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_transfer_contact", {
    p_contact: parsed.data.contact_id,
    p_to_agent: parsed.data.to_agent_id,
    p_reason: parsed.data.reason,
    p_with_deals: parsed.data.with_deals ?? false,
  });
  if (error) return dbFail("transferContact", error);
  revalidateCrm2();
  return ok((data === "pending" ? "pending" : "applied") as Crm2ApplyOutcome);
}

// ── Дугаар ─────────────────────────────────────────────────────────────────

type Supabase = NonNullable<Awaited<ReturnType<typeof crm2Session>>>["supabase"];

async function unsetPrimary(supabase: Supabase, contactId: string, exceptId?: string) {
  let q = supabase.from("crm2_contact_phones").update({ is_primary: false }).eq("contact_id", contactId).eq("is_primary", true);
  if (exceptId) q = q.neq("id", exceptId);
  return q;
}

/** Дугаар нэмэх. is_primary бол өмнөх үндсэн дугаарыг буулгана. */
export async function addContactPhone(input: {
  contact_id: string;
  phone: string;
  label?: string | null;
  is_primary?: boolean;
}): Promise<Crm2Result<{ id: string }>> {
  const parsed = phoneAddSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  if (v.is_primary) {
    const res = await unsetPrimary(session.supabase, v.contact_id);
    if (res.error) return dbFail("addContactPhone unset", res.error);
  }
  const { data, error } = await session.supabase
    .from("crm2_contact_phones")
    .insert({
      contact_id: v.contact_id,
      phone: v.phone,
      label: v.label ?? null,
      is_primary: v.is_primary ?? false,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return fail("Энэ дугаар энэ харилцагчид аль хэдийн бүртгэлтэй.");
    return dbFail("addContactPhone", error);
  }
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Дугаар, шошго засах. */
export async function updateContactPhone(input: {
  phone_id: string;
  phone?: string;
  label?: string | null;
}): Promise<Crm2Result<null>> {
  const parsed = phoneUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { phone_id, ...fields } = parsed.data;
  const patch = definedOnly(fields);
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_contact_phones").update(patch).eq("id", phone_id).select("id");
  if (error) {
    if (error.code === "23505") return fail("Энэ дугаар энэ харилцагчид аль хэдийн бүртгэлтэй.");
    return dbFail("updateContactPhone", error);
  }
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/** Үндсэн дугаар сонгох. */
export async function setPrimaryPhone(contactId: string, phoneId: string): Promise<Crm2Result<null>> {
  const c = idSchema.safeParse(contactId);
  const p = idSchema.safeParse(phoneId);
  if (!c.success || !p.success) return fail("Буруу холбоос (id).");
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const off = await unsetPrimary(session.supabase, c.data, p.data);
  if (off.error) return dbFail("setPrimaryPhone unset", off.error);
  const { data, error } = await session.supabase
    .from("crm2_contact_phones")
    .update({ is_primary: true })
    .eq("id", p.data)
    .eq("contact_id", c.data)
    .select("id");
  if (error) return dbFail("setPrimaryPhone", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/** Дугаар устгах (сүүлийн дугаарыг DB хориглоно). */
export async function deleteContactPhone(phoneId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(phoneId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_contact_phones").delete().eq("id", id.data).select("id");
  if (error) return dbFail("deleteContactPhone", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

// ── Шаардлага ──────────────────────────────────────────────────────────────

/** Шинэ шаардлага (харилцагчийн засварлагч эсвэл нээлттэй хэлцэлтэй агент). */
export async function createRequirement(input: RequirementCreateInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = requirementCreateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { contact_id, ...fields } = parsed.data;
  const { data, error } = await session.supabase
    .from("crm2_requirements")
    .insert({ ...definedOnly(fields), contact_id, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) return dbFail("createRequirement", error);
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Шаардлага засах — өмнөх хувилбар DB-д хадгалагдана (version +1). status=archived = архивлах. */
export async function updateRequirement(input: RequirementUpdateInput): Promise<Crm2Result<null>> {
  const parsed = requirementUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { requirement_id, ...fields } = parsed.data;
  const patch = definedOnly(fields);
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_requirements")
    .update(patch)
    .eq("id", requirement_id)
    .select("id");
  if (error) return dbFail("updateRequirement", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

"use server";

import { crm2Session, revalidateCrm2, type Crm2Supabase } from "@/lib/crm2/server";
import { expirePublicListings } from "@/lib/listings-cache";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbErrorText, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  idSchema,
  projectNameSchema,
  propertyCreateSchema,
  propertyPrivateSchema,
  propertyStatusSchema,
  propertyUpdateSchema,
  verifySchema,
  type PropertyCreateInput,
  type PropertyPrivateInput,
  type PropertyStatusInput,
  type PropertyUpdateInput,
} from "@/lib/crm2/schemas";
import { duplicatesAfterSave } from "@/lib/crm2/queries/duplicates";
import type { Crm2ActivationCheck, Crm2ApplyOutcome, Crm2PropertyDuplicate, Crm2Result } from "@/lib/crm2/types";
import type { Database } from "@/types/database";

type PropertyPatch = Database["public"]["Tables"]["crm2_properties"]["Update"];

/**
 * Staff хөрөнгө (S02, S03): бүртгэх, засах, хувийн талбар, төлөв, баталгаажуулалт,
 * төсөл. Төлөв/баталгаажуулалтыг зөвхөн RPC өөрчилнө (шууд update-ийг DB хориглоно).
 */

async function ensureProjectId(supabase: Crm2Supabase, name: string) {
  const { data, error } = await supabase.rpc("crm2_ensure_project", { p_name: name });
  return { id: (data as string | null) ?? null, error };
}

/** crm2_properties_client_key_uq — ижил ноорогийн давтан илгээлт (сүлжээ тасарсны дараа). */
function isClientKeyReplay(error: { code?: string | null; message?: string | null; details?: string | null } | null): boolean {
  if (error?.code !== "23505") return false;
  return `${error.message ?? ""} ${error.details ?? ""}`.includes("crm2_properties_client_key_uq");
}

/**
 * Шинэ хөрөнгө (ноорог) — бүрэн формын шууд insert зам (шуурхай бүртгэл нь /api/crm2/quick-create).
 * Код (P###) ба листлэгч агентыг (анхдагч — өөрөө) DB олгоно. client_key өгвөл давтан илгээлт нэг
 * хөрөнгө: 23505 (client_key_uq) → өмнө үүссэн id/кодыг буцаана (хувийн талбарыг дахин бичихгүй).
 * Хадгалсны дараа давхардлыг шалгаж буцаана (R15) — давхардал хадгалалтыг хаахгүй.
 */
export async function createProperty(
  input: PropertyCreateInput
): Promise<
  Crm2Result<{ id: string; code: string; warning: string | null; replayed: boolean; duplicates: Crm2PropertyDuplicate[] }>
> {
  const parsed = propertyCreateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { supabase, userId } = session;
  const { project_name, private: priv, ...fields } = parsed.data;

  let projectId = fields.project_id ?? null;
  if (!projectId && project_name) {
    const res = await ensureProjectId(supabase, project_name);
    if (res.error) return dbFail("ensure_project", res.error);
    projectId = res.id;
  }

  const { data, error } = await supabase
    .from("crm2_properties")
    .insert({ ...definedOnly(fields), category: fields.category, project_id: projectId })
    .select("id, code")
    .single();

  let row: { id: string; code: string } | null = data ?? null;
  let replayed = false;
  if (error && fields.client_key && isClientKeyReplay(error)) {
    const prev = await supabase
      .from("crm2_properties")
      .select("id, code")
      .eq("client_key", fields.client_key)
      .eq("created_by", userId)
      .maybeSingle();
    if (prev.error || !prev.data) return dbFail("createProperty replay", prev.error ?? error);
    row = prev.data;
    replayed = true;
  } else if (error || !row) {
    return dbFail("createProperty", error);
  }

  // Хувийн талбарын мөрийг trigger үүсгэсэн — өгсөн бол бөглөнө (давтан илгээлтэд дахин бичихгүй).
  let warning: string | null = null;
  const privPatch = priv && !replayed ? definedOnly(priv) : {};
  if (Object.keys(privPatch).length > 0) {
    const res = await supabase.from("crm2_property_private").update(privPatch).eq("property_id", row.id).select("property_id");
    if (res.error || !res.data?.length) {
      if (res.error) console.error("crm2 createProperty private:", res.error.message);
      const reason = res.error ? dbErrorText(res.error) : NOT_FOUND_ERROR;
      warning = `Хөрөнгө бүртгэгдсэн ч эзэн, үзүүлэх зааврыг хадгалж чадсангүй: ${reason}`;
    }
  }
  const duplicates = await duplicatesAfterSave(supabase, row.id);
  revalidateCrm2();
  return ok({ id: row.id, code: row.code, warning, replayed, duplicates });
}

/** Хөрөнгийн талбар засах (зөвхөн өгсөн талбар). */
export async function updateProperty(propertyId: string, input: PropertyUpdateInput): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const parsed = propertyUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { supabase } = session;
  const { project_name, unconfirmed, ...fields } = parsed.data;
  const patch: PropertyPatch = definedOnly(fields);

  // unconfirmed-ийг зөвхөн БАГАСГАНА (DB origin guard нэмэхийг татгалзана): одоогийн жагсаалтаас
  // өгсөн жагсаалтад байхгүйг хасна, шинэ түлхүүрийг үл тооно.
  if (unconfirmed !== undefined) {
    const cur = await supabase.from("crm2_properties").select("unconfirmed").eq("id", id.data).maybeSingle();
    if (cur.error) return dbFail("updateProperty unconfirmed", cur.error);
    if (!cur.data) return fail(NOT_FOUND_ERROR);
    const keep = new Set<string>(unconfirmed);
    const current = cur.data.unconfirmed ?? [];
    const next = current.filter((k) => keep.has(k));
    if (next.length !== current.length) patch.unconfirmed = next;
  }

  if (project_name && fields.project_id === undefined) {
    const res = await ensureProjectId(supabase, project_name);
    if (res.error) return dbFail("ensure_project", res.error);
    patch.project_id = res.id;
  }
  if (Object.keys(patch).length === 0) return ok(null);

  const { data, error } = await supabase.from("crm2_properties").update(patch).eq("id", id.data).select("id");
  if (error) return dbFail("updateProperty", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  expirePublicListings(); // нийтэлсэн зарын үнэ/төлөв DB триггерээр шинэчлэгдэж болно
  return ok(null);
}

/** Эзэн, эзний тэмдэглэл, үзүүлэх заавар (хувийн талбар харах + засах эрхтэн). */
export async function updatePropertyPrivate(propertyId: string, input: PropertyPrivateInput): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const parsed = propertyPrivateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const patch = definedOnly(parsed.data);
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_property_private")
    .update(patch)
    .eq("property_id", id.data)
    .select("property_id");
  if (error) return dbFail("updatePropertyPrivate", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/**
 * Хөрөнгийн төлөв: батлагч → 'applied' (шууд), засварлагч → 'pending' (хүсэлт).
 * Идэвхжүүлэхээс бусад шилжилтэд шалтгаан заавал.
 */
export async function setPropertyStatus(input: PropertyStatusInput): Promise<Crm2Result<Crm2ApplyOutcome>> {
  const parsed = propertyStatusSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_property_set_status", {
    p_property: parsed.data.property_id,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return dbFail("setPropertyStatus", error);
  revalidateCrm2();
  expirePublicListings(); // «зарагдсан/түдгэлзсэн» болсон нийтэлсэн зар нүүрнээс гарна
  return ok((data === "pending" ? "pending" : "applied") as Crm2ApplyOutcome);
}

/** «Эзэнтэй мэдээллээ тулгасан» — last_verified_at-ыг одоо болгоно. */
export async function markPropertyVerified(propertyId: string, note?: string | null): Promise<Crm2Result<{ verifiedAt: string }>> {
  const parsed = verifySchema.safeParse({ property_id: propertyId, note });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_property_mark_verified", {
    p_property: parsed.data.property_id,
    p_note: parsed.data.note ?? null,
  });
  if (error) return dbFail("markPropertyVerified", error);
  revalidateCrm2();
  return ok({ verifiedAt: data as string });
}

/** Төслийг нэрээр олох эсвэл шинээр үүсгэх → id. */
export async function ensureProject(name: string): Promise<Crm2Result<{ id: string }>> {
  const parsed = projectNameSchema.safeParse(name);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const res = await ensureProjectId(session.supabase, parsed.data);
  if (res.error || !res.id) return dbFail("ensureProject", res.error);
  return ok({ id: res.id });
}

/** Идэвхжүүлэх нөхцөлийг дахин шалгах (маягт хадгалсны дараа). */
export async function checkPropertyActivation(propertyId: string): Promise<Crm2Result<Crm2ActivationCheck>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_property_activation_check", { p_property: id.data });
  if (error) return dbFail("checkPropertyActivation", error);
  return ok(data as unknown as Crm2ActivationCheck);
}

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import { ingestLead } from "@/lib/crm/lead-intake";
import { normalizeEmail, normalizePhone } from "@/lib/crm/normalize";
import { ubIso } from "@/lib/crm/today";
import {
  cleanText,
  clientKey,
  collectionSizeError,
  generateShortCode,
  generateToken,
  hashToken,
  isPlausibleToken,
  linkState,
  normalizePublicLinkSettings,
  openHouseState,
  type PublicLinkSettings,
} from "@/lib/crm/public-links";
import { searchPropertyOptions, type PropertyOption } from "@/lib/queries-crm-pipeline";
import type { MatchResponse } from "@/lib/constants-crm";

/**
 * Харилцагчид гарах токентой холбоос (R9, R10, R11).
 * Ажилтны үйлдэл: RLS-тэй client (insert policy эрхийг шалгана).
 * Нийтийн үйлдэл (нэвтрэлтгүй): токен/кодын hash-аар service role-оор
 * хайж, хугацаа/цуцлалтыг шалгаад зөвхөн тухайн мөрөнд бичнэ.
 * Токеныг зөвхөн үүсгэх мөчид нэг удаа буцаана — DB-д hash л хадгална.
 */

const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const PUBLIC_ERR = "Холбоос хүчингүй эсвэл хугацаа нь дууссан байна.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "https://www.nemi.mn";
}

async function settings(): Promise<PublicLinkSettings> {
  return normalizePublicLinkSettings(await getSettingValue("public_links"));
}

function dbMessage(message: string): string {
  const idx = message.indexOf("CRM:");
  if (idx !== -1) return message.slice(idx).replace(/^CRM:\s*/, "").trim() || SAVE_ERR;
  if (message.includes("row-level security")) return "Танд энэ бүртгэлд холбоос үүсгэх эрх алга.";
  if (message.includes("does not exist")) return "Энэ боломж идэвхжээгүй байна (өгөгдлийн сангийн шинэчлэл хүлээгдэж байна).";
  return SAVE_ERR;
}

function revalidateLinks() {
  revalidatePath("/agent/crm/links");
}

// ── Ажилтан: сонголтын жагсаалт (R11) ─────────────────────

export type CollectionOption = {
  property_id: string;
  match_id: string | null;
  number: string;
  name: string;
  price: number | null;
  rent_price: number | null;
  strength: string | null;
  score: number | null;
  response: string | null;
};

/** Харилцагчийн хэрэгцээний профайлд тохирсон идэвхтэй үл хөдлөх (Тохироогүйг хасна). */
export async function getCollectionOptions(
  contactId: string
): Promise<{ options: CollectionOption[]; consent: string | null; name: string | null; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { options: [], consent: null, name: null, error: NO_CRM_ERR };
  if (!UUID.test(contactId)) return { options: [], consent: null, name: null, error: "Харилцагч олдсонгүй." };
  const supabase = await createClient();
  const [{ data: contact }, { data: profiles }] = await Promise.all([
    supabase.from("crm_contacts").select("display_name, consent").eq("id", contactId).maybeSingle(),
    supabase.from("crm_need_profiles").select("id").eq("contact_id", contactId).eq("status", "active"),
  ]);
  if (!contact) return { options: [], consent: null, name: null, error: "Харилцагч олдсонгүй эсвэл танд эрх алга." };
  const ids = (profiles ?? []).map((p) => p.id);
  if (!ids.length) return { options: [], consent: contact.consent, name: contact.display_name };
  const { data, error } = await supabase
    .from("crm_matches")
    .select(
      "id, score, strength, response, " +
        "property:crm_properties!crm_matches_property_id_fkey(id, number, name, price, rent_price, status)"
    )
    .in("need_profile_id", ids)
    .order("score", { ascending: false })
    .limit(40);
  if (error) console.error("getCollectionOptions:", error.message);
  type Raw = {
    id: string;
    score: number | null;
    strength: string | null;
    response: string | null;
    property: { id: string; number: string; name: string; price: number | null; rent_price: number | null; status: string } | null;
  };
  const seen = new Set<string>();
  const options: CollectionOption[] = [];
  for (const m of (data ?? []) as unknown as Raw[]) {
    if (!m.property || m.property.status !== "active" || m.response === "not_fit" || seen.has(m.property.id)) continue;
    seen.add(m.property.id);
    options.push({
      property_id: m.property.id,
      match_id: m.id,
      number: m.property.number,
      name: m.property.name,
      price: m.property.price,
      rent_price: m.property.rent_price,
      strength: m.strength,
      score: m.score == null ? null : Number(m.score),
      response: m.response,
    });
  }
  return { options, consent: contact.consent, name: contact.display_name };
}

export async function searchLinkProperties(q: string): Promise<PropertyOption[]> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return [];
  return searchPropertyOptions(typeof q === "string" ? q : "");
}

export async function createCollectionLink(input: {
  contactId: string;
  leadId?: string | null;
  propertyIds: string[];
  title?: string | null;
}): Promise<{ url?: string; id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  if (!UUID.test(input.contactId)) return { error: "Харилцагчийг сонгоно уу." };
  const propertyIds = [...new Set((input.propertyIds ?? []).filter((id) => UUID.test(id)))];
  const s = await settings();
  const sizeErr = collectionSizeError(propertyIds.length, s);
  if (sizeErr) return { error: sizeErr };
  const supabase = await createClient();

  const { data: contact } = await supabase.from("crm_contacts").select("id, consent").eq("id", input.contactId).maybeSingle();
  if (!contact) return { error: "Харилцагч олдсонгүй эсвэл танд эрх алга." };
  if (contact.consent === "declined") {
    return { error: "Харилцагч мэдээлэл хүлээн авахаас татгалзсан тул холбоос илгээх боломжгүй." };
  }
  const { data: props } = await supabase.from("crm_properties").select("id, status").in("id", propertyIds);
  const active = new Set((props ?? []).filter((p) => p.status === "active").map((p) => p.id));
  if (active.size !== propertyIds.length) return { error: "Зөвхөн идэвхтэй листингийг жагсаалтад оруулна." };

  const { data: profiles } = await supabase.from("crm_need_profiles").select("id").eq("contact_id", input.contactId);
  const profileIds = (profiles ?? []).map((p) => p.id);
  const matchOf = new Map<string, string>();
  if (profileIds.length) {
    const { data: matches } = await supabase
      .from("crm_matches")
      .select("id, property_id, suggested_at")
      .in("need_profile_id", profileIds)
      .in("property_id", propertyIds);
    for (const m of matches ?? []) if (!matchOf.has(m.property_id)) matchOf.set(m.property_id, m.id);
  }

  const leadId = input.leadId && UUID.test(input.leadId) ? input.leadId : null;
  const token = generateToken();
  const now = new Date();
  const { data: link, error } = await supabase
    .from("crm_public_links")
    .insert({
      office_id: ctx.officeId,
      kind: "collection",
      token_hash: hashToken(token),
      contact_id: input.contactId,
      lead_id: leadId,
      title: cleanText(input.title, 80),
      expires_at: new Date(now.getTime() + s.collectionDays * 86_400_000).toISOString(),
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !link) {
    console.error("createCollectionLink:", error?.message);
    return { error: dbMessage(error?.message ?? "") };
  }
  const { error: itemErr } = await supabase.from("crm_public_link_items").insert(
    propertyIds.map((pid, i) => ({ link_id: link.id, property_id: pid, match_id: matchOf.get(pid) ?? null, sort_order: i }))
  );
  if (itemErr) {
    console.error("createCollectionLink items:", itemErr.message);
    await supabase.from("crm_public_links").update({ revoked_at: now.toISOString() }).eq("id", link.id);
    return { error: dbMessage(itemErr.message) };
  }
  // §6.10.5: санал болгосон гэж тэмдэглэнэ (хариу нь жагсаалтаас ирнэ).
  const matchIds = [...matchOf.values()];
  if (matchIds.length) {
    const { error: sugErr } = await supabase
      .from("crm_matches")
      .update({ suggested_at: now.toISOString(), suggested_by: ctx.profileId })
      .in("id", matchIds)
      .is("suggested_at", null);
    if (sugErr) console.error("createCollectionLink suggested:", sugErr.message);
  }
  revalidateLinks();
  return { url: `${await siteOrigin()}/c/${token}`, id: link.id };
}

// ── Ажилтан: өмчлөгчийн тайлан (R10) ─────────────────────

export async function createOwnerReportLink(input: {
  propertyId: string;
  note?: string | null;
}): Promise<{ url?: string; id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  if (!UUID.test(input.propertyId)) return { error: "Үл хөдлөхийг сонгоно уу." };
  const s = await settings();
  const supabase = await createClient();
  const token = generateToken();
  const { data, error } = await supabase
    .from("crm_public_links")
    .insert({
      office_id: ctx.officeId,
      kind: "owner_report",
      token_hash: hashToken(token),
      property_id: input.propertyId,
      note: cleanText(input.note, 500),
      expires_at: new Date(Date.now() + s.ownerReportDays * 86_400_000).toISOString(),
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createOwnerReportLink:", error?.message);
    return { error: dbMessage(error?.message ?? "") };
  }
  revalidateLinks();
  return { url: `${await siteOrigin()}/o/${token}`, id: data.id };
}

export async function updateOwnerReportNote(linkId: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!UUID.test(linkId)) return { ok: false, error: "Холбоос олдсонгүй." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_public_links")
    .update({ note: cleanText(note, 500) })
    .eq("id", linkId)
    .eq("kind", "owner_report")
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("updateOwnerReportNote:", error.message);
    return { ok: false, error: error ? dbMessage(error.message) : "Холбоос олдсонгүй эсвэл танд эрх алга." };
  }
  revalidateLinks();
  return { ok: true };
}

export async function revokePublicLink(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!UUID.test(linkId)) return { ok: false, error: "Холбоос олдсонгүй." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_public_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("revokePublicLink:", error.message);
    return { ok: false, error: error ? dbMessage(error.message) : "Холбоос олдсонгүй эсвэл аль хэдийн цуцлагдсан." };
  }
  revalidateLinks();
  return { ok: true };
}

// ── Ажилтан: нээлттэй үзлэг, байнгын QR (R9) ──────────────

export async function createOpenHouse(input: {
  propertyId: string;
  kind: "open_house" | "permanent";
  startsAt?: string | null;
  endsAt?: string | null;
  title?: string | null;
}): Promise<{ url?: string; id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  if (!UUID.test(input.propertyId)) return { error: "Үл хөдлөхийг сонгоно уу." };
  if (input.kind !== "open_house" && input.kind !== "permanent") return { error: "Төрлийг сонгоно уу." };
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (input.kind === "open_house") {
    const s = Date.parse(input.startsAt ?? "");
    const e = Date.parse(input.endsAt ?? "");
    if (!Number.isFinite(s) || !Number.isFinite(e)) return { error: "Эхлэх, дуусах цагийг оруулна уу." };
    if (e <= s) return { error: "Дуусах цаг эхлэхээс хойш байна." };
    if (e - s > 3 * 86_400_000) return { error: "Нэг арга хэмжээ 3 хоногоос урт байж болохгүй." };
    if (e < Date.now()) return { error: "Өнгөрсөн арга хэмжээнд QR үүсгэхгүй." };
    startsAt = new Date(s).toISOString();
    endsAt = new Date(e).toISOString();
  }
  const supabase = await createClient();
  // Ш11: нээлттэй үзлэгийн сэжмийн эзэмшигч = листингийн агент.
  const [{ data: prop }, { data: roles }] = await Promise.all([
    supabase.from("crm_properties").select("id, status, created_by").eq("id", input.propertyId).maybeSingle(),
    supabase
      .from("crm_property_roles")
      .select("agent_profile_id, role, assigned_at")
      .eq("property_id", input.propertyId)
      .eq("role", "sourcing")
      .order("assigned_at", { ascending: false })
      .limit(1),
  ]);
  if (!prop) return { error: "Үл хөдлөх олдсонгүй эсвэл танд эрх алга." };
  if (prop.status !== "active") return { error: "Зөвхөн идэвхтэй листингид QR үүсгэнэ." };
  const ownerAgent = roles?.[0]?.agent_profile_id ?? prop.created_by ?? ctx.profileId;

  const code = generateShortCode();
  const { data, error } = await supabase
    .from("crm_open_houses")
    .insert({
      office_id: ctx.officeId,
      property_id: input.propertyId,
      kind: input.kind,
      code_hash: hashToken(code),
      title: cleanText(input.title, 80),
      host_id: ctx.profileId,
      owner_agent_id: ownerAgent,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createOpenHouse:", error?.message);
    return { error: dbMessage(error?.message ?? "") };
  }
  revalidateLinks();
  return { url: `${await siteOrigin()}/q/${code}`, id: data.id };
}

export async function revokeOpenHouse(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!UUID.test(id)) return { ok: false, error: "QR олдсонгүй." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_open_houses")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("revokeOpenHouse:", error.message);
    return { ok: false, error: error ? dbMessage(error.message) : "QR олдсонгүй эсвэл аль хэдийн цуцлагдсан." };
  }
  revalidateLinks();
  return { ok: true };
}

// ── Нийтийн: сонголтын жагсаалтын хариу (нэвтрэлтгүй) ─────

const PUBLIC_RESPONSES: MatchResponse[] = ["interested", "maybe", "not_fit"];

export async function respondToCollection(input: {
  token: string;
  propertyId: string;
  response: MatchResponse;
  comment?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPlausibleToken(input.token) || !UUID.test(input.propertyId) || !PUBLIC_RESPONSES.includes(input.response)) {
    return { ok: false, error: PUBLIC_ERR };
  }
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("crm_public_links")
    .select("id, office_id, kind, contact_id, lead_id, created_by, expires_at, revoked_at")
    .eq("token_hash", hashToken(input.token))
    .maybeSingle();
  if (!link || link.kind !== "collection" || linkState(link) !== "active") return { ok: false, error: PUBLIC_ERR };
  const { data: item } = await admin
    .from("crm_public_link_items")
    .select("property_id, match_id, response")
    .eq("link_id", link.id)
    .eq("property_id", input.propertyId)
    .maybeSingle();
  if (!item) return { ok: false, error: PUBLIC_ERR };
  const comment = cleanText(input.comment, 500);
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("crm_public_link_items")
    .update({ response: input.response, comment, responded_at: nowIso })
    .eq("link_id", link.id)
    .eq("property_id", input.propertyId);
  if (error) {
    console.error("respondToCollection:", error.message);
    return { ok: false, error: "Хариуг хадгалж чадсангүй. Дахин оролдоно уу." };
  }
  if (item.match_id) {
    const { error: mErr } = await admin
      .from("crm_matches")
      .update({ response: input.response, response_reason: comment, responded_at: nowIso })
      .eq("id", item.match_id);
    if (mErr) console.error("respondToCollection match:", mErr.message);
  }
  if (!item.response) {
    const { data: prop } = await admin.from("crm_properties").select("number, name").eq("id", input.propertyId).maybeSingle();
    const label = { interested: "Сонирхсон", maybe: "Магадгүй", not_fit: "Тохироогүй", no_response: "Хариу өгөөгүй" }[input.response];
    await notifyCrm({
      officeId: link.office_id,
      event: "match_found",
      recipients: [link.created_by],
      title: "Сонголтын жагсаалтад хариу ирлээ",
      body: `${prop?.name ?? prop?.number ?? "Үл хөдлөх"} — ${label}${comment ? `: ${comment.slice(0, 60)}` : ""}`,
      link: link.lead_id ? `/agent/crm/leads/${link.lead_id}` : `/agent/crm/contacts/${link.contact_id}`,
      entity: "crm_public_links",
      entityId: link.id,
      admin,
    });
  }
  return { ok: true };
}

// ── Нийтийн: нээлттэй үзлэгийн бүртгэл (нэвтрэлтгүй) ──────

export type OpenHouseVisitInput = {
  code: string;
  fullName: string;
  phone: string;
  email?: string | null;
  interest: "buy" | "rent" | "sell" | "other";
  comment?: string | null;
  consent: boolean;
  /** Ботын урхи — хүн бөглөхгүй. */
  website?: string | null;
};

export async function registerOpenHouseVisit(input: OpenHouseVisitInput): Promise<{ ok: boolean; error?: string }> {
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  if (!isPlausibleToken(code)) return { ok: false, error: PUBLIC_ERR };
  if (input.website) return { ok: true }; // урхинд орсон бот — чимээгүй
  const name = cleanText(input.fullName, 80);
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  const email = input.email ? normalizeEmail(input.email) : "";
  if (!name || name.length < 2) return { ok: false, error: "Нэрээ оруулна уу." };
  if (!phone || phone.length < 8) return { ok: false, error: "Утасны дугаараа зөв оруулна уу." };
  if (input.email && !email) return { ok: false, error: "И-мэйл хаяг буруу байна." };
  if (input.consent !== true) return { ok: false, error: "Мэдээллээ ашиглуулах зөвшөөрлийг тэмдэглэнэ үү." };
  if (!["buy", "rent", "sell", "other"].includes(input.interest)) return { ok: false, error: "Сонирхлоо сонгоно уу." };

  const admin = createAdminClient();
  const { data: oh } = await admin
    .from("crm_open_houses")
    .select("id, office_id, property_id, kind, title, owner_agent_id, starts_at, ends_at, revoked_at, visit_count")
    .eq("code_hash", hashToken(code))
    .maybeSingle();
  if (!oh) return { ok: false, error: PUBLIC_ERR };
  const { data: setRow } = await admin.rpc("crm_setting_at", { p_office: oh.office_id, p_key: "public_links" });
  const s = normalizePublicLinkSettings(setRow);
  const state = openHouseState(oh as Parameters<typeof openHouseState>[0], s);
  if (state === "upcoming") return { ok: false, error: "Бүртгэл арга хэмжээ эхлэхэд нээгдэнэ." };
  if (state !== "open") return { ok: false, error: "Энэ арга хэмжээний бүртгэл хаагдсан байна." };

  // Давтамжийн хязгаар (IP-г хадгалахгүй — өдрийн нэргүй түлхүүр).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip");
  const ckey = clientKey(ip, h.get("user-agent"), ubIso(), process.env.CRM_PUBLIC_LINK_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: byClient }, { count: byEvent }] = await Promise.all([
    admin.from("crm_open_house_visits").select("id", { count: "exact", head: true }).eq("client_hash", ckey).gte("created_at", hourAgo),
    admin.from("crm_open_house_visits").select("id", { count: "exact", head: true }).eq("open_house_id", oh.id).gte("created_at", hourAgo),
  ]);
  if ((byClient ?? 0) >= s.visitsPerClientHour || (byEvent ?? 0) >= s.visitsPerEventHour) {
    return { ok: false, error: "Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу." };
  }

  const { data: prop } = await admin.from("crm_properties").select("number, name").eq("id", oh.property_id).maybeSingle();
  const interestLabel = { buy: "Худалдан авах", rent: "Түрээслэх", sell: "Өөрийн үл хөдлөхөө зарах", other: "Бусад" }[input.interest];
  const comment = cleanText(input.comment, 300);
  const sourceDetail = [
    oh.kind === "open_house" ? "Нээлттэй үзлэгийн QR" : "Үл хөдлөхийн QR",
    prop?.number ?? null,
    interestLabel,
    comment,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 300);

  const res = await ingestLead({
    officeId: oh.office_id,
    fullName: name,
    phone,
    email: email || null,
    sourceCode: oh.kind === "open_house" ? "open_house" : "listing_inquiry",
    sourceDetail,
    channelRef: `open_house:${oh.id}`,
    preferredOwnerId: oh.owner_agent_id,
    registrarId: oh.owner_agent_id,
    contactType: input.interest === "rent" ? "tenant" : input.interest === "sell" ? "seller" : "buyer",
  });
  if (res.error || !res.leadId) {
    console.error("registerOpenHouseVisit ingest:", res.error);
    return { ok: false, error: "Бүртгэл амжилтгүй боллоо. Дахин оролдоно уу." };
  }
  // Зөвшөөрлийг зөвхөн энэ маягтаар шинээр үүссэн харилцагчид бүртгэнэ — өмнө нь
  // бүртгэлтэй хүний зөвшөөрлийн төлөвийг утасны дугаар мэдсэн гуравдагч этгээд өөрчилж болохгүй.
  if (res.contactId && !res.existing) {
    const { data: c } = await admin.from("crm_contacts").select("created_at, consent").eq("id", res.contactId).maybeSingle();
    if (c && c.consent === "not_asked" && Date.now() - Date.parse(c.created_at) < 5 * 60_000) {
      const { error: cErr } = await admin
        .from("crm_contacts")
        .update({ consent: "granted", consent_at: new Date().toISOString(), consent_channel: "open_house_form" })
        .eq("id", res.contactId);
      if (cErr) console.error("registerOpenHouseVisit consent:", cErr.message);
    }
  }
  const { error: vErr } = await admin.from("crm_open_house_visits").insert({
    office_id: oh.office_id,
    open_house_id: oh.id,
    lead_id: res.leadId,
    existing_lead: !!res.existing,
    client_hash: ckey,
  });
  if (vErr) console.error("registerOpenHouseVisit visit:", vErr.message);
  await admin.from("crm_open_houses").update({ visit_count: (oh.visit_count ?? 0) + 1 }).eq("id", oh.id);
  return { ok: true };
}

import { createClient } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/queries-crm-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashToken,
  isLikelyBot,
  isPlausibleToken,
  linkState,
  normalizePublicLinkSettings,
  openHouseState,
  publicLocation,
  type LinkState,
  type OpenHouseState,
  type PublicLinkSettings,
} from "@/lib/crm/public-links";
import { CRM_PROPERTY_TYPE_LABEL, type CrmPropertyType, type MatchResponse } from "@/lib/constants-crm";
import { FEEDBACK_CATEGORY_LABEL, type FeedbackCategory } from "@/lib/crm/deal-flow";

/**
 * Харилцагчид гарах холбоосын өгөгдөл (R9, R10, R11).
 * Нийтийн функцууд (getPublic*) service role-оор зөвхөн токены hash-аар
 * хайж, НИЙТЭД ГАРАХ ТАЛБАРЫГ л буцаана: хаягийн байр/тоот, өмчлөгч,
 * бусад харилцагч, үнийн саналын дүн гарахгүй.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

function typeLabel(t: string | null): string {
  return (t && CRM_PROPERTY_TYPE_LABEL[t as CrmPropertyType]) || "Үл хөдлөх";
}

async function officeSettings(admin: AdminClient, officeId: string): Promise<PublicLinkSettings> {
  const { data } = await admin.rpc("crm_setting_at", { p_office: officeId, p_key: "public_links" });
  return normalizePublicLinkSettings(data);
}

async function agentCard(admin: AdminClient, profileId: string, officeId: string) {
  const [{ data: p }, { data: a }, { data: o }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    admin.from("agents").select("display_name, phone").eq("profile_id", profileId).maybeSingle(),
    admin.from("offices").select("name").eq("id", officeId).maybeSingle(),
  ]);
  return { name: a?.display_name || p?.full_name || "Агент", phone: a?.phone ?? null, office: o?.name ?? null };
}

async function markOpened(admin: AdminClient, id: string, openCount: number, userAgent: string | null) {
  if (isLikelyBot(userAgent)) return;
  const { error } = await admin
    .from("crm_public_links")
    .update({ open_count: openCount + 1, last_opened_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("public link open:", error.message);
}

// ── R11 Сонголтын жагсаалт ───────────────────────────────

export type PublicCollectionItem = {
  propertyId: string;
  number: string;
  typeLabel: string;
  location: string;
  rooms: number | null;
  area: number | null;
  price: number | null;
  rentPrice: number | null;
  isRental: boolean;
  features: string[];
  photo: string | null;
  response: MatchResponse | null;
  comment: string | null;
};

export type PublicCollection = {
  state: LinkState;
  title: string | null;
  expiresAt: string;
  agent: { name: string; phone: string | null; office: string | null };
  items: PublicCollectionItem[];
};

export async function getPublicCollection(token: string, userAgent: string | null): Promise<PublicCollection | null> {
  if (!isPlausibleToken(token)) return null;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("crm_public_links")
    .select("id, office_id, kind, title, expires_at, revoked_at, open_count, created_by")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!link || link.kind !== "collection") return null;
  const state = linkState(link);
  const agent = await agentCard(admin, link.created_by, link.office_id);
  if (state !== "active") return { state, title: null, expiresAt: link.expires_at, agent, items: [] };

  const { data: items } = await admin
    .from("crm_public_link_items")
    .select(
      "property_id, sort_order, response, comment, " +
        "property:crm_properties!crm_public_link_items_property_id_fkey(number, property_type, service_kind, address, rooms, area_m2, price, rent_price, features, status, listing_id)"
    )
    .eq("link_id", link.id)
    .order("sort_order");
  type Raw = {
    property_id: string;
    response: MatchResponse | null;
    comment: string | null;
    property: {
      number: string;
      property_type: string | null;
      service_kind: string;
      address: unknown;
      rooms: number | null;
      area_m2: number | null;
      price: number | null;
      rent_price: number | null;
      features: string[] | null;
      status: string;
      listing_id: string | null;
    } | null;
  };
  const rows = ((items ?? []) as unknown as Raw[]).filter((r) => r.property);
  const listingIds = rows.map((r) => r.property!.listing_id).filter((v): v is string => !!v);
  const photos = new Map<string, string>();
  if (listingIds.length) {
    const { data: ls } = await admin.from("listings").select("id, photo").in("id", listingIds);
    for (const l of ls ?? []) if (typeof l.photo === "string" && l.photo.startsWith("http")) photos.set(l.id, l.photo);
  }
  await markOpened(admin, link.id, link.open_count, userAgent);
  return {
    state,
    title: link.title,
    expiresAt: link.expires_at,
    agent,
    items: rows.map((r) => {
      const p = r.property!;
      const isRental = p.service_kind !== "sale";
      return {
        propertyId: r.property_id,
        number: p.number,
        typeLabel: typeLabel(p.property_type),
        location: publicLocation(p.address),
        rooms: p.rooms,
        area: p.area_m2 == null ? null : Number(p.area_m2),
        price: p.price == null ? null : Number(p.price),
        rentPrice: p.rent_price == null ? null : Number(p.rent_price),
        isRental,
        features: (p.features ?? []).slice(0, 6),
        photo: p.listing_id ? (photos.get(p.listing_id) ?? null) : null,
        response: r.response,
        comment: r.comment,
      };
    }),
  };
}

// ── R10 Өмчлөгчийн явцын тайлан ──────────────────────────

export type PublicOwnerReport = {
  state: LinkState;
  agent: { name: string; phone: string | null; office: string | null };
  property: {
    number: string;
    typeLabel: string;
    location: string;
    statusLabel: string;
    price: number | null;
    rentPrice: number | null;
    isRental: boolean;
    daysOnMarket: number | null;
  } | null;
  funnel: { suggested: number; interested: number; maybe: number; notFit: number };
  showings: { done: number; upcoming: number; feedback: { label: string; count: number }[]; interested: number };
  offers: { count: number; open: number };
  visits: number;
  priceHistory: { date: string; field: "price" | "rent_price"; from: number | null; to: number | null }[];
  nextStep: string | null;
  generatedAt: string;
};

const PROPERTY_STATUS_PUBLIC: Record<string, string> = {
  draft: "Бэлтгэл",
  active: "Идэвхтэй листинг",
  reserved: "Захиалгатай",
  sold: "Зарагдсан",
  rented: "Түрээслэгдсэн",
  withdrawn: "Зах зээлээс татсан",
};

export async function getPublicOwnerReport(token: string, userAgent: string | null): Promise<PublicOwnerReport | null> {
  if (!isPlausibleToken(token)) return null;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("crm_public_links")
    .select("id, office_id, kind, property_id, note, expires_at, revoked_at, open_count, created_by")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!link || link.kind !== "owner_report" || !link.property_id) return null;
  const state = linkState(link);
  const agent = await agentCard(admin, link.created_by, link.office_id);
  const empty: PublicOwnerReport = {
    state,
    agent,
    property: null,
    funnel: { suggested: 0, interested: 0, maybe: 0, notFit: 0 },
    showings: { done: 0, upcoming: 0, feedback: [], interested: 0 },
    offers: { count: 0, open: 0 },
    visits: 0,
    priceHistory: [],
    nextStep: null,
    generatedAt: new Date().toISOString(),
  };
  if (state !== "active") return empty;

  const pid = link.property_id;
  const [propRes, matchRes, showRes, oppRes, histRes, ohRes] = await Promise.all([
    admin
      .from("crm_properties")
      .select("number, property_type, service_kind, address, status, price, rent_price, created_at, activated_at")
      .eq("id", pid)
      .maybeSingle(),
    admin.from("crm_matches").select("suggested_at, response").eq("property_id", pid).limit(2000),
    admin.from("crm_showings").select("status, scheduled_at, feedback_category, interest").eq("property_id", pid).limit(2000),
    admin.from("crm_opportunities").select("id").eq("property_id", pid).limit(500),
    admin
      .from("crm_property_price_history")
      .select("field, old_value, new_value, created_at")
      .eq("property_id", pid)
      .order("created_at")
      .limit(50),
    admin.from("crm_open_houses").select("visit_count").eq("property_id", pid),
  ]);
  // activated_at багана 001800-аар нэмэгдэнэ — байхгүй бол created_at-аар.
  let prop = propRes.data as Record<string, unknown> | null;
  if (propRes.error) {
    const fb = await admin
      .from("crm_properties")
      .select("number, property_type, service_kind, address, status, price, rent_price, created_at")
      .eq("id", pid)
      .maybeSingle();
    prop = fb.data as Record<string, unknown> | null;
  }
  if (!prop) return empty;

  const matches = matchRes.data ?? [];
  const showings = (showRes.data ?? []) as { status: string; scheduled_at: string; feedback_category: string | null; interest: string | null }[];
  const fb = new Map<string, number>();
  for (const s of showings) if (s.feedback_category) fb.set(s.feedback_category, (fb.get(s.feedback_category) ?? 0) + 1);
  const oppIds = (oppRes.data ?? []).map((o) => o.id);
  let offers = { count: 0, open: 0 };
  if (oppIds.length) {
    const { data: of } = await admin.from("crm_offers").select("status, parent_offer_id").in("opportunity_id", oppIds).limit(1000);
    const roots = (of ?? []).filter((o) => !o.parent_offer_id);
    offers = { count: roots.length, open: (of ?? []).filter((o) => o.status === "open" || o.status === "countered").length };
  }
  await markOpened(admin, link.id, link.open_count, userAgent);
  const since = (prop.activated_at as string | null | undefined) ?? (prop.created_at as string);
  const isRental = prop.service_kind !== "sale";
  return {
    ...empty,
    property: {
      number: String(prop.number),
      typeLabel: typeLabel(prop.property_type as string | null),
      location: publicLocation(prop.address),
      statusLabel: PROPERTY_STATUS_PUBLIC[String(prop.status)] ?? "—",
      price: prop.price == null ? null : Number(prop.price),
      rentPrice: prop.rent_price == null ? null : Number(prop.rent_price),
      isRental,
      daysOnMarket: since ? Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 86_400_000)) : null,
    },
    funnel: {
      suggested: matches.filter((m) => m.suggested_at).length,
      interested: matches.filter((m) => m.response === "interested").length,
      maybe: matches.filter((m) => m.response === "maybe").length,
      notFit: matches.filter((m) => m.response === "not_fit").length,
    },
    showings: {
      done: showings.filter((s) => s.status === "done").length,
      upcoming: showings.filter((s) => s.status === "scheduled" && Date.parse(s.scheduled_at) > Date.now()).length,
      feedback: [...fb.entries()]
        .map(([k, count]) => ({ label: FEEDBACK_CATEGORY_LABEL[k as FeedbackCategory] ?? "Бусад", count }))
        .sort((a, b) => b.count - a.count),
      interested: showings.filter((s) => s.interest === "interested").length,
    },
    offers,
    visits: (ohRes.data ?? []).reduce((s, r) => s + (r.visit_count ?? 0), 0),
    priceHistory: (histRes.data ?? []).map((h) => ({
      date: h.created_at,
      field: h.field === "rent_price" ? "rent_price" : "price",
      from: h.old_value == null ? null : Number(h.old_value),
      to: h.new_value == null ? null : Number(h.new_value),
    })),
    nextStep: link.note,
  };
}

// ── R9 Нээлттэй үзлэгийн хуудас ──────────────────────────

export type PublicOpenHouse = {
  state: OpenHouseState;
  kind: "open_house" | "permanent";
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  agent: { name: string; phone: string | null; office: string | null };
  property: { number: string; typeLabel: string; location: string; rooms: number | null; area: number | null; price: number | null; rentPrice: number | null; isRental: boolean } | null;
};

export async function getPublicOpenHouse(code: string): Promise<PublicOpenHouse | null> {
  const c = (code ?? "").trim().toUpperCase();
  if (!isPlausibleToken(c)) return null;
  const admin = createAdminClient();
  const { data: oh } = await admin
    .from("crm_open_houses")
    .select("id, office_id, property_id, kind, title, host_id, starts_at, ends_at, revoked_at")
    .eq("code_hash", hashToken(c))
    .maybeSingle();
  if (!oh) return null;
  const s = await officeSettings(admin, oh.office_id);
  const kind = oh.kind === "permanent" ? "permanent" : "open_house";
  const state = openHouseState({ kind, starts_at: oh.starts_at, ends_at: oh.ends_at, revoked_at: oh.revoked_at }, s);
  const [agent, { data: p }] = await Promise.all([
    agentCard(admin, oh.host_id, oh.office_id),
    admin
      .from("crm_properties")
      .select("number, property_type, service_kind, address, rooms, area_m2, price, rent_price")
      .eq("id", oh.property_id)
      .maybeSingle(),
  ]);
  return {
    state,
    kind,
    title: oh.title,
    startsAt: oh.starts_at,
    endsAt: oh.ends_at,
    agent,
    property: p
      ? {
          number: p.number,
          typeLabel: typeLabel(p.property_type),
          location: publicLocation(p.address),
          rooms: p.rooms,
          area: p.area_m2 == null ? null : Number(p.area_m2),
          price: p.price == null ? null : Number(p.price),
          rentPrice: p.rent_price == null ? null : Number(p.rent_price),
          isRental: p.service_kind !== "sale",
        }
      : null,
  };
}

// ── Ажилтны жагсаалт ─────────────────────────────────────

export type MyLinkRow = {
  id: string;
  kind: "collection" | "owner_report";
  state: LinkState;
  title: string | null;
  note: string | null;
  contact_id: string | null;
  contact_name: string | null;
  lead_id: string | null;
  property_id: string | null;
  property_label: string | null;
  expires_at: string;
  created_at: string;
  open_count: number;
  last_opened_at: string | null;
  items: { property_id: string; label: string; response: MatchResponse | null; comment: string | null }[];
};

export async function getMyPublicLinks(limit = 60): Promise<{ rows: MyLinkRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_public_links")
    .select(
      "id, kind, title, note, contact_id, lead_id, property_id, expires_at, revoked_at, created_at, open_count, last_opened_at, " +
        "contact:crm_contacts!crm_public_links_contact_id_fkey(display_name), " +
        "property:crm_properties!crm_public_links_property_id_fkey(number, name), " +
        "items:crm_public_link_items(property_id, response, comment, property:crm_properties!crm_public_link_items_property_id_fkey(number, name))"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getMyPublicLinks:", error.message);
    return { rows: [], unavailable: true };
  }
  type Raw = {
    id: string;
    kind: "collection" | "owner_report";
    title: string | null;
    note: string | null;
    contact_id: string | null;
    lead_id: string | null;
    property_id: string | null;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    open_count: number;
    last_opened_at: string | null;
    contact: { display_name: string } | null;
    property: { number: string; name: string } | null;
    items: { property_id: string; response: MatchResponse | null; comment: string | null; property: { number: string; name: string } | null }[] | null;
  };
  return {
    rows: ((data ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      state: linkState(r),
      title: r.title,
      note: r.note,
      contact_id: r.contact_id,
      contact_name: r.contact?.display_name ?? null,
      lead_id: r.lead_id,
      property_id: r.property_id,
      property_label: r.property ? `${r.property.number} · ${r.property.name}` : null,
      expires_at: r.expires_at,
      created_at: r.created_at,
      open_count: r.open_count,
      last_opened_at: r.last_opened_at,
      items: (r.items ?? []).map((i) => ({
        property_id: i.property_id,
        label: i.property ? `${i.property.number} · ${i.property.name}` : "Үл хөдлөх",
        response: i.response,
        comment: i.comment,
      })),
    })),
    unavailable: false,
  };
}

export type MyOpenHouseRow = {
  id: string;
  kind: "open_house" | "permanent";
  state: OpenHouseState;
  title: string | null;
  property_id: string;
  property_label: string;
  starts_at: string | null;
  ends_at: string | null;
  visit_count: number;
  created_at: string;
};

export async function getMyOpenHouses(limit = 60): Promise<{ rows: MyOpenHouseRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_open_houses")
    .select(
      "id, office_id, kind, title, property_id, starts_at, ends_at, revoked_at, visit_count, created_at, " +
        "property:crm_properties!crm_open_houses_property_id_fkey(number, name)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getMyOpenHouses:", error.message);
    return { rows: [], unavailable: true };
  }
  type Raw = {
    id: string;
    kind: "open_house" | "permanent";
    title: string | null;
    property_id: string;
    starts_at: string | null;
    ends_at: string | null;
    revoked_at: string | null;
    visit_count: number;
    created_at: string;
    property: { number: string; name: string } | null;
  };
  const s = normalizePublicLinkSettings(await getSettingValue("public_links"));
  return {
    rows: ((data ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      state: openHouseState(r, s),
      title: r.title,
      property_id: r.property_id,
      property_label: r.property ? `${r.property.number} · ${r.property.name}` : "Үл хөдлөх",
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      visit_count: r.visit_count,
      created_at: r.created_at,
    })),
    unavailable: false,
  };
}

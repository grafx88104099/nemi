import { cache } from "react";

import { CRM2_MAX_PAGE_SIZE, CRM2_PAGE_SIZE, PROPERTY_STATUS_GROUPS, type PropertyStatusGroup } from "@/lib/crm2/labels";
import {
  CRM2_DOCS_BUCKET,
  CRM2_MEDIA_BUCKET,
  crm2Client,
  isRangeError,
  likeEscape,
  pageRange,
  signedUrlMap,
  type Crm2Supabase,
} from "@/lib/crm2/server";
import { getCrm2Context } from "@/lib/crm2/context";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import type {
  Crm2ActivationCheck,
  Crm2ActivityKind,
  Crm2BrokerageFileRow,
  Crm2BrokerageRow,
  Crm2ContactPhoneRow,
  Crm2PropertyActivityItem,
  Crm2PropertyCategory,
  Crm2PropertyDealItem,
  Crm2PropertyMediaRow,
  Crm2PropertyRow,
  Crm2PropertyStatus,
  Crm2RequestRow,
} from "@/lib/crm2/types";

/**
 * Staff хөрөнгийн уншилт (S01 жагсаалт, S03 карт). Бүгд хэрэглэгчийн client —
 * RLS: ноорог зөвхөн эрхтэнд, хувийн талбар/гэрээ/файл зөвхөн эрхтэнд.
 * crm2_properties → profiles 3 FK тул embed бүрд FK заалт.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Жагсаалт (S01) ─────────────────────────────────────────────────────────

const PROPERTY_LIST_SELECT =
  "id, code, category, property_type, status, status_changed_at, activated_at, project_id, district, " +
  "location_text, area_m2, rooms, floor, building_floors, price, currency, price_period, price_basis, price_total, " +
  "features, listing_agent_id, contract_agent_id, photo_agent_id, brokerage_end_date, last_verified_at, " +
  "created_by, created_at, updated_at, " +
  "project:crm2_projects!crm2_properties_project_id_office_id_fkey(id, name), " +
  "listing_agent:profiles!crm2_properties_listing_agent_id_fkey(full_name)";

export type PropertyListFilters = {
  category?: Crm2PropertyCategory | null;
  /** Харагдац (анхдагч active). `status` өгвөл түүнийг давуу. */
  statusGroup?: PropertyStatusGroup | null;
  status?: Crm2PropertyStatus | null;
  /** Эдгээр төлвийн аль нэг (statusGroup, status-ийг давуу) — жишээ нь шинэ хэлцэл нээж болох төлвүүд. */
  statusIn?: Crm2PropertyStatus[] | null;
  projectId?: string | null;
  district?: string | null;
  /** Чөлөөт байршил (location_text ilike). */
  location?: string | null;
  /** Түлхүүр үг (search_text ilike: код, төсөл, дүүрэг, байршил, төрөл, ангилал, онцлог, тайлбар). */
  q?: string | null;
  /** Энэ агент 3 үүргийн аль нэгэнд. */
  agentId?: string | null;
  /** Бүх онцлогтой (features ⊇). */
  features?: string[] | null;
  /** created (анхдагч) | activated — шинэ нь эхэнд. */
  sort?: "created" | "activated" | null;
  page?: number;
  pageSize?: number;
};

export type PropertyListItem = Pick<
  Crm2PropertyRow,
  | "id"
  | "code"
  | "category"
  | "property_type"
  | "status"
  | "status_changed_at"
  | "activated_at"
  | "project_id"
  | "district"
  | "location_text"
  | "area_m2"
  | "rooms"
  | "floor"
  | "building_floors"
  | "price"
  | "currency"
  | "price_period"
  | "price_basis"
  | "price_total"
  | "features"
  | "listing_agent_id"
  | "contract_agent_id"
  | "photo_agent_id"
  | "brokerage_end_date"
  | "last_verified_at"
  | "created_by"
  | "created_at"
  | "updated_at"
> & {
  project: { id: string; name: string } | null;
  listingAgentName: string | null;
  /** Нүүр зураг (эсвэл эхний зураг)-ийн signed URL. */
  coverUrl: string | null;
};

/**
 * Хуудасласан жагсаалт. `error` = уншиж чадсангүй (DB/RLS/сүлжээ) — хоосон
 * жагсаалтаас ялгаж, «Дахин оролдох» харуулна.
 */
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number; error?: boolean };

type ListRow = Omit<PropertyListItem, "listingAgentName" | "coverUrl"> & {
  listing_agent: { full_name: string | null } | null;
};

/** Staff жагсаалт — шүүлт, хайлт, хуудаслалт; шинэ нь эхэнд. */
export async function listProperties(filters: PropertyListFilters = {}): Promise<Paged<PropertyListItem>> {
  const supabase = await crm2Client();
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? CRM2_PAGE_SIZE), CRM2_MAX_PAGE_SIZE);
  const { page, from, to } = pageRange(filters.page, pageSize);

  let query = supabase.from("crm2_properties").select(PROPERTY_LIST_SELECT, { count: "exact" });

  if (filters.statusIn) query = query.in("status", filters.statusIn.length ? filters.statusIn : ["active"]);
  else if (filters.status) query = query.eq("status", filters.status);
  else {
    const group = filters.statusGroup ?? "active";
    if (group !== "all") query = query.in("status", PROPERTY_STATUS_GROUPS[group]);
  }
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.projectId && UUID_RE.test(filters.projectId)) query = query.eq("project_id", filters.projectId);
  if (filters.district?.trim()) query = query.eq("district", filters.district.trim());
  const loc = filters.location?.trim();
  if (loc) query = query.ilike("location_text", `%${likeEscape(loc)}%`);
  const q = filters.q?.trim().toLowerCase();
  if (q) query = query.ilike("search_text", `%${likeEscape(q)}%`);
  if (filters.agentId && UUID_RE.test(filters.agentId)) {
    const a = filters.agentId;
    query = query.or(`listing_agent_id.eq.${a},contract_agent_id.eq.${a},photo_agent_id.eq.${a}`);
  }
  const feats = (filters.features ?? []).filter((f) => /^[a-z][a-z0-9_]{0,39}$/.test(f));
  if (feats.length) query = query.contains("features", feats);

  if (filters.sort === "activated") {
    query = query.order("activated_at", { ascending: false, nullsFirst: false });
  }
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    // ?page= жагсаалтаас хэтэрсэн (416) — алдаа биш: 1-р хуудсаар нийт тоог авч «энэ хуудсанд алга» гэж харуулна.
    if (isRangeError(error) && page > 1) {
      const first = await listProperties({ ...filters, page: 1 });
      return { items: [], total: first.total, page, pageSize, pageCount: first.pageCount, error: first.error };
    }
    console.error("crm2 listProperties:", error.message);
    return { items: [], total: 0, page, pageSize, pageCount: 0, error: true };
  }
  const rows = (data ?? []) as unknown as ListRow[];
  const covers = await coverUrls(
    supabase,
    rows.map((r) => r.id)
  );
  const items = rows.map(({ listing_agent, ...r }) => ({
    ...r,
    listingAgentName: listing_agent?.full_name ?? null,
    coverUrl: covers[r.id] ?? null,
  }));
  const total = count ?? items.length;
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

/** Хөрөнгө бүрийн нүүр зураг (байхгүй бол эхний зураг) → signed URL. */
async function coverUrls(supabase: Crm2Supabase, propertyIds: string[]): Promise<Record<string, string>> {
  if (propertyIds.length === 0) return {};
  const { data, error } = await supabase
    .from("crm2_property_media")
    .select("property_id, storage_path, is_cover, sort_order")
    .in("property_id", propertyIds)
    .eq("kind", "image")
    .not("storage_path", "is", null)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(600);
  if (error) {
    console.error("crm2 coverUrls:", error.message);
    return {};
  }
  const pick = new Map<string, string>();
  for (const m of data ?? []) if (m.storage_path && !pick.has(m.property_id)) pick.set(m.property_id, m.storage_path);
  const urls = await signedUrlMap(supabase, CRM2_MEDIA_BUCKET, [...pick.values()]);
  const out: Record<string, string> = {};
  for (const [pid, path] of pick) if (urls[path]) out[pid] = urls[path];
  return out;
}

// ── Карт (S03) ─────────────────────────────────────────────────────────────

const PROPERTY_DETAIL_SELECT =
  "*, project:crm2_projects!crm2_properties_project_id_office_id_fkey(id, name), " +
  "listing_agent:profiles!crm2_properties_listing_agent_id_fkey(id, full_name, avatar_url), " +
  "contract_agent:profiles!crm2_properties_contract_agent_id_fkey(id, full_name, avatar_url), " +
  "photo_agent:profiles!crm2_properties_photo_agent_id_fkey(id, full_name, avatar_url)";

const PROPERTY_PRIVATE_SELECT =
  "property_id, owner_contact_id, owner_note, showing_instructions, updated_at, updated_by, " +
  "owner:crm2_contacts!crm2_property_private_owner_contact_id_office_id_fkey(id, code, full_name, status, " +
  "phones:crm2_contact_phones!crm2_contact_phones_contact_id_office_id_fkey(id, phone, phone_norm, label, is_primary))";

const PROPERTY_MEDIA_SELECT =
  "id, office_id, property_id, kind, storage_path, external_url, mime_type, size_bytes, caption, sort_order, is_cover, uploaded_by, created_at";

const BROKERAGE_SELECT =
  "*, owner:crm2_contacts!crm2_brokerage_contracts_owner_contact_id_office_id_fkey(id, code, full_name), " +
  "responsible:profiles!crm2_brokerage_contracts_responsible_agent_id_fkey(id, full_name), " +
  "files:crm2_brokerage_files!crm2_brokerage_files_contract_id_office_id_fkey(id, office_id, contract_id, property_id, " +
  "storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at)";

const PROPERTY_REQUEST_SELECT =
  "id, office_id, kind, target_id, property_id, payload, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note";

export type AgentRef = { id: string; full_name: string | null; avatar_url: string | null } | null;

export type PropertyOwner = {
  id: string;
  code: string;
  full_name: string;
  status: string;
  phones: Pick<Crm2ContactPhoneRow, "id" | "phone" | "phone_norm" | "label" | "is_primary">[];
};

export type PropertyPrivate = {
  owner_contact_id: string | null;
  owner_note: string | null;
  showing_instructions: string | null;
  updated_at: string;
  updated_by: string | null;
  owner: PropertyOwner | null;
};

export type PropertyMediaItem = Crm2PropertyMediaRow & { url: string | null };

export type BrokerageFileItem = Crm2BrokerageFileRow & { url: string | null };

export type BrokerageItem = Crm2BrokerageRow & {
  owner: { id: string; code: string; full_name: string } | null;
  responsible: { id: string; full_name: string | null } | null;
  files: BrokerageFileItem[];
  /** Ноорог засах/илгээх/хаях (ба буцааж авах). */
  canEditDraft: boolean;
  /** Файл нэмэх (ноорогт засварлагч, илгээсэн/батлагдсанд батлагч). */
  canAttach: boolean;
  /** Батлах/татгалзах (pending) — батлагч ба өөрийгөө батлах дүрэм. */
  canDecide: boolean;
  /** Цуцлах (active). */
  canTerminate: boolean;
  /** Сунгах (active/expired, сунгалтын хувилбаргүй). */
  canRenew: boolean;
};

export type PropertyRequestItem = Crm2RequestRow & {
  canDecide: boolean;
  requestedByName: string | null;
  /** deal_transfer-ийн хэлцлийн код (RLS-ээр харагдвал). */
  dealCode: string | null;
};

export type PropertyDetail = {
  property: Crm2PropertyRow & {
    project: { id: string; name: string } | null;
    listing_agent: AgentRef;
    contract_agent: AgentRef;
    photo_agent: AgentRef;
  };
  /** Хувийн талбар — харах эрхгүй бол null. */
  private: PropertyPrivate | null;
  /** Үзүүлэх заавар (дунд түвшин) — эрхгүй бол null. */
  showingInfo: string | null;
  media: PropertyMediaItem[];
  /** Зуучлалын гэрээнүүд (шинэ хувилбар эхэнд) — эрхгүй бол хоосон. */
  brokerage: BrokerageItem[];
  activation: Crm2ActivationCheck | null;
  pendingRequests: PropertyRequestItem[];
  names: { createdBy: string | null; lastVerifiedBy: string | null; updatedBy: string | null };
  can: {
    edit: boolean;
    viewPrivate: boolean;
    viewShowingInfo: boolean;
    /** Төлөвийг шууд өөрчлөх эрхтэй (батлагч). Өөрийгөө батлах дүрмийг RPC шалгана. */
    approveStatus: boolean;
  };
};

async function rpcBool(p: PromiseLike<{ data: boolean | null; error: { message: string } | null }>, label: string) {
  const { data, error } = await p;
  if (error) console.error(`crm2 ${label}:`, error.message);
  return !!data;
}

/** Хөрөнгийн карт — олдохгүй эсвэл харах эрхгүй бол null. */
export const getProperty = cache(async (id: string): Promise<PropertyDetail | null> => {
  if (!UUID_RE.test(id)) return null;
  const supabase = await crm2Client();
  const { data: row, error } = await supabase.from("crm2_properties").select(PROPERTY_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    // DB/PostgREST алдааг «олдсонгүй» гэж харуулахгүй — crm/error.tsx «Дахин оролдох» гарна.
    console.error("crm2 getProperty:", error.message);
    throw new Error("crm2 getProperty: load failed");
  }
  if (!row) return null;
  const property = row as unknown as PropertyDetail["property"];

  const [canEdit, canViewPrivate, canViewShowingInfo, approveStatus, names, ctx] = await Promise.all([
    rpcBool(supabase.rpc("crm2_can_edit_property", { p_property: id }), "can_edit_property"),
    rpcBool(supabase.rpc("crm2_can_view_property_private", { p_property: id }), "can_view_property_private"),
    rpcBool(supabase.rpc("crm2_can_view_showing_info", { p_property: id }), "can_view_showing_info"),
    rpcBool(supabase.rpc("crm2_property_approver", { p_property: id }), "property_approver"),
    getStaffNameMap(),
    getCrm2Context(),
  ]);

  const [priv, showingInfo, media, brokerage, activation, pendingRequests] = await Promise.all([
    canViewPrivate ? loadPrivate(supabase, id) : Promise.resolve(null),
    canViewShowingInfo && !canViewPrivate ? loadShowingInfo(supabase, id) : Promise.resolve(null),
    loadMedia(supabase, id),
    // Гэрээг RLS шүүнэ (хариуцагч, ноорог үүсгэгч, ахлагч, хувийн талбар харагч).
    loadBrokerage(supabase, id, {
      canEditProperty: canEdit,
      me: ctx?.profileId ?? null,
      canWork: !!ctx?.canWork,
      propAgents: [property.listing_agent_id, property.contract_agent_id, property.photo_agent_id],
    }),
    loadActivation(supabase, id),
    loadPropertyRequests(supabase, id, names),
  ]);

  return {
    property,
    private: priv,
    showingInfo: canViewPrivate ? (priv?.showing_instructions ?? null) : showingInfo,
    media,
    brokerage,
    activation,
    pendingRequests,
    names: {
      createdBy: names[property.created_by] ?? null,
      lastVerifiedBy: property.last_verified_by ? (names[property.last_verified_by] ?? null) : null,
      updatedBy: property.updated_by ? (names[property.updated_by] ?? null) : null,
    },
    can: { edit: canEdit, viewPrivate: canViewPrivate, viewShowingInfo: canViewShowingInfo, approveStatus },
  };
});

async function loadPrivate(supabase: Crm2Supabase, id: string): Promise<PropertyPrivate | null> {
  const { data, error } = await supabase
    .from("crm2_property_private")
    .select(PROPERTY_PRIVATE_SELECT)
    .eq("property_id", id)
    .maybeSingle();
  if (error) console.error("crm2 loadPrivate:", error.message);
  if (!data) return null;
  const p = data as unknown as PropertyPrivate;
  if (p.owner?.phones) p.owner.phones.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return p;
}

async function loadShowingInfo(supabase: Crm2Supabase, id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("crm2_property_showing_info", { p_property: id });
  if (error) console.error("crm2 showing_info:", error.message);
  return data ?? null;
}

/** Медиа (зураг эхэнд, нүүр зураг, дарааллаар) + signed URL. */
export async function loadMedia(supabase: Crm2Supabase, propertyId: string): Promise<PropertyMediaItem[]> {
  const { data, error } = await supabase
    .from("crm2_property_media")
    .select(PROPERTY_MEDIA_SELECT)
    .eq("property_id", propertyId)
    .order("kind", { ascending: true })
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) console.error("crm2 loadMedia:", error.message);
  const rows = (data ?? []) as Crm2PropertyMediaRow[];
  const urls = await signedUrlMap(
    supabase,
    CRM2_MEDIA_BUCKET,
    rows.map((m) => m.storage_path)
  );
  return rows.map((m) => ({ ...m, url: m.storage_path ? (urls[m.storage_path] ?? null) : m.external_url }));
}

type BrokerageRaw = Omit<BrokerageItem, "files" | "canEditDraft" | "canAttach" | "canDecide" | "canTerminate" | "canRenew"> & {
  files: Crm2BrokerageFileRow[] | null;
};

async function loadBrokerage(
  supabase: Crm2Supabase,
  propertyId: string,
  opts: { canEditProperty: boolean; me: string | null; canWork: boolean; propAgents: (string | null)[] }
): Promise<BrokerageItem[]> {
  const { data, error } = await supabase
    .from("crm2_brokerage_contracts")
    .select(BROKERAGE_SELECT)
    .eq("property_id", propertyId)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) console.error("crm2 loadBrokerage:", error.message);
  const rows = (data ?? []) as unknown as BrokerageRaw[];
  if (rows.length === 0) return [];

  const { canEditProperty, me, canWork, propAgents } = opts;
  const successors = new Set(rows.filter((r) => r.previous_id && r.status !== "terminated").map((r) => r.previous_id));

  const urls = await signedUrlMap(
    supabase,
    CRM2_DOCS_BUCKET,
    rows.flatMap((r) => (r.files ?? []).map((f) => f.storage_path))
  );

  return Promise.all(
    rows.map(async (r) => {
      const live = r.status === "draft" || r.status === "pending" || r.status === "active";
      const [canEditDraft, canAttach, approver] = await Promise.all([
        r.status === "draft" || r.status === "pending"
          ? rpcBool(supabase.rpc("crm2_can_edit_brokerage_draft", { p_contract: r.id }), "can_edit_brokerage_draft")
          : Promise.resolve(false),
        live ? rpcBool(supabase.rpc("crm2_can_attach_brokerage", { p_contract: r.id }), "can_attach_brokerage") : Promise.resolve(false),
        r.status === "pending" || r.status === "active"
          ? rpcBool(supabase.rpc("crm2_brokerage_approver", { p_responsible: r.responsible_agent_id }), "brokerage_approver")
          : Promise.resolve(false),
      ]);
      let canDecide = false;
      let canTerminate = false;
      if (approver && r.status === "pending") {
        canDecide = await rpcBool(
          supabase.rpc("crm2_self_ok", {
            p_involved: [r.responsible_agent_id, r.submitted_by, r.created_by, ...propAgents].filter((x): x is string => !!x),
          }),
          "self_ok"
        );
      }
      if (approver && r.status === "active") {
        canTerminate = await rpcBool(supabase.rpc("crm2_self_ok", { p_involved: [r.responsible_agent_id] }), "self_ok");
      }
      const canRenew =
        (r.status === "active" || r.status === "expired") &&
        !successors.has(r.id) &&
        (canEditProperty || (r.responsible_agent_id === me && canWork));
      const files = [...(r.files ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((f) => ({ ...f, url: urls[f.storage_path] ?? null }));
      return {
        ...r,
        files,
        canEditDraft: canEditDraft || (r.status === "pending" && r.submitted_by === me),
        canAttach,
        canDecide,
        canTerminate,
        canRenew,
      };
    })
  );
}

async function loadActivation(supabase: Crm2Supabase, id: string): Promise<Crm2ActivationCheck | null> {
  const { data, error } = await supabase.rpc("crm2_property_activation_check", { p_property: id });
  if (error) {
    console.error("crm2 activation_check:", error.message);
    return null;
  }
  return (data ?? null) as unknown as Crm2ActivationCheck | null;
}

async function loadPropertyRequests(
  supabase: Crm2Supabase,
  propertyId: string,
  names: Record<string, string>
): Promise<PropertyRequestItem[]> {
  const { data, error } = await supabase
    .from("crm2_requests")
    .select(PROPERTY_REQUEST_SELECT)
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  if (error) console.error("crm2 property requests:", error.message);
  const rows = (data ?? []) as Crm2RequestRow[];
  const dealIds = rows.filter((r) => r.kind === "deal_transfer").map((r) => r.target_id);
  const deals = dealIds.length
    ? await supabase.from("crm2_deals").select("id, code").in("id", dealIds)
    : { data: [] as { id: string; code: string }[], error: null };
  if (deals.error) console.error("crm2 property request deals:", deals.error.message);
  const dealCode = new Map((deals.data ?? []).map((d) => [d.id, d.code]));
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      canDecide: await rpcBool(supabase.rpc("crm2_can_decide_request", { p_request: r.id }), "can_decide_request"),
      requestedByName: names[r.requested_by] ?? null,
      dealCode: r.kind === "deal_transfer" ? (dealCode.get(r.target_id) ?? null) : null,
    }))
  );
}

/** Хөрөнгийн медиа (засах маягтад) — signed URL-тай. */
export async function listPropertyMedia(propertyId: string): Promise<PropertyMediaItem[]> {
  if (!UUID_RE.test(propertyId)) return [];
  const supabase = await crm2Client();
  return loadMedia(supabase, propertyId);
}

// ── Картын табууд (RPC — харилцагчийн нэрийг эрхгүй бол далдална) ─────────

/** «Хэлцлүүд» таб: нээлттэй эхэнд, сүүлийн үйлдлээр. `error` = уншиж чадсангүй. */
export async function loadPropertyDeals(propertyId: string): Promise<{ rows: Crm2PropertyDealItem[]; error: boolean }> {
  if (!UUID_RE.test(propertyId)) return { rows: [], error: false };
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_property_deals", { p_property: propertyId });
  if (error) console.error("crm2_property_deals:", error.message);
  return { rows: data ?? [], error: !!error };
}

/** loadPropertyDeals-ийн мөрүүд (алдаа гарвал хоосон). */
export async function getPropertyDeals(propertyId: string): Promise<Crm2PropertyDealItem[]> {
  return (await loadPropertyDeals(propertyId)).rows;
}

/**
 * «Дуудлага» / «Үзүүлэлт» таб: бодит (эсвэл товлосон) цагаар буурахаар.
 * Дараагийн хуудас: `before` = өмнөх хуудасны сүүлийн мөрийн sort_at.
 */
export async function loadPropertyActivities(
  propertyId: string,
  opts: { kind?: Crm2ActivityKind | null; before?: string | null; limit?: number } = {}
): Promise<{ rows: Crm2PropertyActivityItem[]; error: boolean }> {
  if (!UUID_RE.test(propertyId)) return { rows: [], error: false };
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_property_activities", {
    p_property: propertyId,
    p_kind: opts.kind ?? null,
    p_before: opts.before ?? null,
    p_limit: opts.limit ?? 50,
  });
  if (error) console.error("crm2_property_activities:", error.message);
  return { rows: data ?? [], error: !!error };
}

/** loadPropertyActivities-ийн мөрүүд (алдаа гарвал хоосон). */
export async function getPropertyActivities(
  propertyId: string,
  opts: { kind?: Crm2ActivityKind | null; before?: string | null; limit?: number } = {}
): Promise<Crm2PropertyActivityItem[]> {
  return (await loadPropertyActivities(propertyId, opts)).rows;
}

/** Идэвхжүүлэх нөхцөл (дутуу талбар, хүчинтэй гэрээ). */
export async function getActivationCheck(propertyId: string): Promise<Crm2ActivationCheck | null> {
  if (!UUID_RE.test(propertyId)) return null;
  const supabase = await crm2Client();
  return loadActivation(supabase, propertyId);
}

/** Засах маягтад: хөрөнгийн мөр + хувийн талбар (эрхтэй бол) + засах эрх. */
export async function getPropertyForEdit(id: string): Promise<{
  property: Crm2PropertyRow & { project: { id: string; name: string } | null };
  private: PropertyPrivate | null;
  canEdit: boolean;
  canViewPrivate: boolean;
} | null> {
  const detail = await getProperty(id);
  if (!detail) return null;
  return {
    property: detail.property,
    private: detail.private,
    canEdit: detail.can.edit,
    canViewPrivate: detail.can.viewPrivate,
  };
}

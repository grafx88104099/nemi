import { buildChecklist, checklistSettings, nextStep, type ChecklistInput, type NextStep } from "@/lib/crm2/checklist";
import { ubToday } from "@/lib/crm2/datetime";
import { crm2Client } from "@/lib/crm2/server";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import {
  CHECKLIST_PROPERTY_COLUMNS,
  checklistProperty,
  pickChecklistContract,
  publicTextRisksOf,
  toChecklistContract,
  type ChecklistContractRow,
  type ChecklistPropertyRow,
} from "@/lib/crm2/queries/checklist";
import type { Crm2BrokerageStatus, Crm2PropertyStatus } from "@/lib/crm2/types";

/**
 * «Миний дутуу хөрөнгө» (P10) ба ширээний гүйцэтгэлийн хүснэгт. Хэрэглэгчийн client (RLS) — 4 багц уншилт:
 *   1) хөрөнгө (+ төсөл, зургийн төрөл), 2) хувийн мөр (эзэн, owner_pending), 3) гэрээ (+ файлын төрөл),
 *   4) листлэгч агентын нийтийн бүртгэл. Нэр/баг нь хуудас даяар кэшлэгдсэн crm2_staff_directory-оос.
 * Шалгах дүрэм — lib/crm2/checklist (картынхтай ижил). Эзний утас, нэр энд огт уншигдахгүй.
 */

export type IncompleteScope = "me" | "team" | "office";

export type IncompleteItem = {
  id: string;
  code: string;
  status: Crm2PropertyStatus;
  /** Төсөл · дүүрэг · байршил (эзний мэдээлэлгүй). */
  title: string;
  percent: number;
  next: NextStep;
  ownerPending: boolean;
  /** 14+ хоног хоосон ноорог («Архивлах» санал). */
  staleEmpty: boolean;
  listingAgentId: string | null;
  listingAgentName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ширээний гүйцэтгэлийн хүснэгтийн мөрийн засвар — нийтийн талбарууд (эзний нэр, утасгүй). */
  fields: IncompleteFields;
  /** Эзний төлөв: холбогдсон | owner_pending | алга | харах эрхгүй. Утас, нэр ОРОХГҮЙ. */
  owner: { state: "linked" | "pending" | "none" | "hidden"; contactId: string | null; source: string | null };
  imageCount: number;
};

export type IncompleteFields = Pick<
  ChecklistPropertyRow,
  "category" | "district" | "area_m2" | "rooms" | "price" | "price_total" | "currency" | "price_period"
> & { price_basis: string | null };

export type TeamFillStat = { agentId: string; name: string | null; count: number; avgPercent: number };

export type IncompleteList = {
  scope: IncompleteScope;
  items: IncompleteItem[];
  counts: { total: number; ownerPending: number; staleEmpty: number };
  /** Агент бүрийн дундаж гүйцэтгэл (баг/оффис харагдацад). */
  teamStats: TeamFillStat[];
  /** Уншиж чадсангүй. */
  error?: boolean;
};

/** Хоосон ноорогийг «хуучирсан» гэж үзэх хоног. */
export const STALE_EMPTY_DAYS = 14;
const OPEN_STATUSES: Crm2PropertyStatus[] = ["draft", "active", "suspended", "contract_ended"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PropertyRow = ChecklistPropertyRow & {
  id: string;
  price_basis: string | null;
  code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  project: { name: string } | null;
  media: { kind: string }[] | null;
};

type PrivateRow = {
  property_id: string;
  owner_contact_id: string | null;
  owner_pending: unknown;
  showing_instructions: string | null;
  owner: { id: string; source: string | null; name_unverified: boolean } | null;
};

type ContractRow = ChecklistContractRow & {
  id: string;
  property_id: string;
  status: Crm2BrokerageStatus;
  version: number;
  created_at: string;
};

const PROPERTY_SELECT =
  `id, code, created_by, created_at, updated_at, price_basis, ${CHECKLIST_PROPERTY_COLUMNS}, ` +
  "project:crm2_projects!crm2_properties_project_id_office_id_fkey(name), " +
  "media:crm2_property_media!crm2_property_media_property_id_office_id_fkey(kind)";

const PRIVATE_SELECT =
  "property_id, owner_contact_id, owner_pending, showing_instructions, " +
  "owner:crm2_contacts!crm2_property_private_owner_contact_id_office_id_fkey(id, source, name_unverified)";

const CONTRACT_SELECT =
  "id, property_id, status, version, created_at, start_date, end_date, approved_at, registered_at, stamp_confirmed, " +
  "owner_contact_id, " +
  "owner:crm2_contacts!crm2_brokerage_contracts_owner_contact_id_office_id_fkey(source, name_unverified), " +
  "files:crm2_brokerage_files!crm2_brokerage_files_contract_id_office_id_fkey(kind, mime_type)";

function titleOf(p: PropertyRow): string {
  return [p.project?.name, p.district, p.location_text].filter((x) => x && x.trim()).join(" · ") || p.code;
}

/** Хоосон, хуучирсан ноорог (цэвэр). */
export function isStaleEmptyDraft(
  p: { status: string; created_at: string; area_m2: number | null; price: number | null; district: string | null; project_id: string | null },
  imageCount: number,
  hasOwner: boolean,
  now = Date.now()
): boolean {
  if (p.status !== "draft") return false;
  if (now - Date.parse(p.created_at) < STALE_EMPTY_DAYS * 86_400_000) return false;
  return imageCount === 0 && !hasOwner && p.area_m2 == null && p.price == null && !p.district && !p.project_id;
}

/** Агент бүрийн тоо, дундаж хувь (цэвэр). */
export function teamFillStats(items: readonly IncompleteItem[]): TeamFillStat[] {
  const by = new Map<string, { name: string | null; n: number; sum: number }>();
  for (const it of items) {
    if (!it.listingAgentId) continue;
    const s = by.get(it.listingAgentId) ?? { name: it.listingAgentName, n: 0, sum: 0 };
    s.n += 1;
    s.sum += it.percent;
    by.set(it.listingAgentId, s);
  }
  return [...by.entries()]
    .map(([agentId, s]) => ({ agentId, name: s.name, count: s.n, avgPercent: Math.round(s.sum / s.n) }))
    .sort((a, b) => a.avgPercent - b.avgPercent || b.count - a.count);
}

/**
 * Дутуу хөрөнгийн жагсаалт. scope: me (миний — листлэгч/үүсгэгч/гэрээний агент), team (ахлагч/менежер —
 * миний багийн агентууд), office (менежер). Эрхгүй харагдац хүсвэл 'me' болно. «Бүрэн» хөрөнгө орохгүй.
 */
export async function listMyIncomplete(opts: { scope?: IncompleteScope; limit?: number } = {}): Promise<IncompleteList> {
  const empty = (scope: IncompleteScope, error = false): IncompleteList => ({
    scope,
    items: [],
    counts: { total: 0, ownerPending: 0, staleEmpty: 0 },
    teamStats: [],
    ...(error ? { error: true } : {}),
  });
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) return empty("me");
  let scope: IncompleteScope = opts.scope ?? "me";
  if (scope === "office" && !ctx.isManager) scope = ctx.isTeamLead ? "team" : "me";
  if (scope === "team" && !(ctx.isTeamLead || ctx.isManager)) scope = "me";
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 300);

  const [supabase, settings, staff] = await Promise.all([crm2Client(), getCrm2Settings(), getStaffDirectory()]);
  const names = new Map(staff.map((s) => [s.profile_id, s.name]));

  // 1) Хөрөнгө
  let q = supabase.from("crm2_properties").select(PROPERTY_SELECT).in("status", OPEN_STATUSES);
  const me = ctx.profileId;
  if (scope === "me") {
    q = q.or(`listing_agent_id.eq.${me},created_by.eq.${me},contract_agent_id.eq.${me}`);
  } else if (scope === "team") {
    const team = staff.filter((s) => ctx.teamId && s.team_id === ctx.teamId).map((s) => s.profile_id);
    const ids = [...new Set([me, ...team])].filter((x) => UUID_RE.test(x));
    q = q.in("listing_agent_id", ids);
  }
  const props = await q.order("updated_at", { ascending: false }).limit(limit);
  if (props.error) {
    console.error("crm2 listMyIncomplete:", props.error.message);
    return empty(scope, true);
  }
  const rows = (props.data ?? []) as unknown as PropertyRow[];
  if (rows.length === 0) return empty(scope);
  const ids = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.listing_agent_id).filter((x): x is string => !!x && UUID_RE.test(x)))];

  // 2–4) Хувийн мөр, гэрээ, агентын нийтийн бүртгэл — зэрэг.
  const [priv, contracts, agents] = await Promise.all([
    supabase.from("crm2_property_private").select(PRIVATE_SELECT).in("property_id", ids),
    supabase
      .from("crm2_brokerage_contracts")
      .select(CONTRACT_SELECT)
      .in("property_id", ids)
      .in("status", ["draft", "active"])
      .order("version", { ascending: false })
      .order("created_at", { ascending: false }),
    agentIds.length
      ? supabase.from("agents").select("profile_id").in("profile_id", agentIds).eq("status", "active")
      : Promise.resolve({ data: [] as { profile_id: string | null }[], error: null }),
  ]);
  if (priv.error) console.error("crm2 listMyIncomplete private:", priv.error.message);
  if (contracts.error) console.error("crm2 listMyIncomplete contracts:", contracts.error.message);
  if (agents.error) console.error("crm2 listMyIncomplete agents:", agents.error.message);

  const privBy = new Map(((priv.data ?? []) as unknown as PrivateRow[]).map((p) => [p.property_id, p]));
  const contractsBy = new Map<string, ContractRow[]>();
  for (const c of (contracts.data ?? []) as unknown as ContractRow[]) {
    const list = contractsBy.get(c.property_id) ?? [];
    list.push(c);
    contractsBy.set(c.property_id, list);
  }
  const publicAgents = new Set((agents.data ?? []).map((a) => a.profile_id).filter(Boolean));
  const cs = checklistSettings(settings);
  const today = ubToday();
  const now = Date.now();

  const all: IncompleteItem[] = [];
  for (const p of rows) {
    const pr = privBy.get(p.id);
    const imageCount = (p.media ?? []).filter((m) => m.kind === "image").length;
    // Хувийн мөр RLS-ээр ирээгүй = харах эрхгүй.
    const owner: ChecklistInput["owner"] = !pr
      ? "hidden"
      : pr.owner
        ? { id: pr.owner.id, nameUnverified: !!pr.owner.name_unverified, source: pr.owner.source ?? null }
        : null;
    const ownerInfo = owner && owner !== "hidden" ? owner : null;
    const input: ChecklistInput = {
      property: checklistProperty(p),
      owner,
      ownerPending: !!pr?.owner_pending,
      showingInstructions: pr ? (pr.showing_instructions ?? null) : "hidden",
      contract: toChecklistContract(pickChecklistContract(contractsBy.get(p.id) ?? []), ownerInfo),
      imageCount,
      listingAgentPublic: !!p.listing_agent_id && publicAgents.has(p.listing_agent_id),
      settings: cs,
      publicTextRisks: publicTextRisksOf(p),
      today,
    };
    const next = nextStep(input);
    if (next.group === null) continue; // «Бүрэн»
    all.push({
      id: p.id,
      code: p.code,
      status: p.status,
      title: titleOf(p),
      percent: buildChecklist(input).percent,
      next,
      ownerPending: input.ownerPending,
      staleEmpty: isStaleEmptyDraft(p, imageCount, !!pr?.owner_contact_id || !!pr?.owner_pending, now),
      listingAgentId: p.listing_agent_id,
      listingAgentName: p.listing_agent_id ? (names.get(p.listing_agent_id) ?? null) : null,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      fields: {
        category: p.category,
        district: p.district,
        area_m2: p.area_m2,
        rooms: p.rooms,
        price: p.price,
        price_total: p.price_total,
        currency: p.currency,
        price_period: p.price_period,
        price_basis: p.price_basis ?? null,
      },
      owner: {
        state: !pr ? "hidden" : pr.owner_contact_id ? "linked" : pr.owner_pending ? "pending" : "none",
        contactId: pr?.owner_contact_id ?? null,
        source: pr?.owner?.source ?? null,
      },
      imageCount,
    });
  }
  // Эзэн хүлээгдэж буй нь эхэнд, дараа нь бага хувьтай нь.
  all.sort((a, b) => Number(b.ownerPending) - Number(a.ownerPending) || a.percent - b.percent || b.updatedAt.localeCompare(a.updatedAt));
  return {
    scope,
    items: all,
    counts: {
      total: all.length,
      ownerPending: all.filter((i) => i.ownerPending).length,
      staleEmpty: all.filter((i) => i.staleEmpty).length,
    },
    teamStats: scope === "me" ? [] : teamFillStats(all),
  };
}

/**
 * Өдрийн нэгтгэсэн сануулгын push-ийн бичвэр — ЗӨВХӨН тоо (crm2_digest_log.counts), хөрөнгийн код,
 * эзний нэр, утас огт орохгүй. Цэвэр (cron route, тест).
 */
export function digestPushBody(counts: unknown): string {
  const c = (counts && typeof counts === "object" ? counts : {}) as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(c[k]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  // contract — гэрээгүй; contract_file — ноорог гэрээ бүртгэгдээгүй (20261125000100: «approve» байхгүй).
  const parts = [
    n("owner") ? `${n("owner")} эзэн` : null,
    n("contract") ? `${n("contract")} гэрээ` : null,
    n("contract_file") ? `${n("contract_file")} гэрээ бүртгэгдээгүй` : null,
  ].filter(Boolean);
  return n("properties") ? `${n("properties")} хөрөнгө дутуу${parts.length ? `: ${parts.join(", ")}` : ""}` : "Дутуу бүртгэлээ шалгана уу";
}

/**
 * Push-ийн гарчиг ба холбоос — апп доторх мэдэгдэлтэй ижил: үргэлж өнөөдрийн дутуу бүртгэл (гэрээ батлах
 * алхам байхгүй тул хуучин counts.approve-ийг үл тооно). Цэвэр.
 */
export function digestPushTarget(counts: unknown): { title: string; url: string } {
  void counts;
  return { title: "Өнөөдрийн дутуу бүртгэл", url: "/agent/crm/staff/incomplete" };
}

/**
 * Энэ хэрэглэгчид өдрийн нэгтгэлийг push-аар явуулах эсэх (crm2_incomplete_digest): хувийн сонголт
 * байвал түүгээр, эс бөгөөс оффисын матрицын анхдагчаар; аль нь ч үгүй бол явуулна (төхөөрөмжөө
 * бүртгүүлсэн хэрэглэгч). Цэвэр.
 */
export function digestPushAllowed(prefChannels: readonly string[] | null | undefined, matrixChannels: readonly string[] | null | undefined): boolean {
  if (Array.isArray(prefChannels)) return prefChannels.includes("push");
  if (Array.isArray(matrixChannels)) return matrixChannels.includes("push");
  return true;
}

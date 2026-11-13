import { PROPERTY_CATEGORIES, PROPERTY_STATUS_GROUPS, type PropertyStatusGroup } from "@/lib/crm2/labels";
import type { PropertyListFilters } from "@/lib/crm2/queries/properties";
import type { Crm2PropertyCategory, Crm2PropertyStatus } from "@/lib/crm2/types";

/**
 * S01 Staff жагсаалтын URL параметр ↔ шүүлтүүр (цэвэр модуль — сервер хуудас,
 * клиент шүүлтүүр, тест). Буруу утгыг чимээгүй хасна (холбоос гараар засагдсан г.м.).
 *
 *   ?view=archive|draft  (анхдагч — идэвхтэй)
 *   ?category=rent|lease|managed_rent|sale
 *   ?status=<харагдацын доторх төлөв>|all  (идэвхтэй харагдацын анхдагч — «Идэвхтэй»; all — бүлгийн бүх төлөв)
 *   ?project=<uuid>  ?district=<дүүрэг>  ?loc=<байршлын бичвэр>  ?q=<түлхүүр үг>
 *   ?sort=activated  ?page=2
 */

export type StaffView = Exclude<PropertyStatusGroup, "all">;

export const STAFF_VIEWS: readonly StaffView[] = ["active", "archive", "draft"];

export type StaffSort = "created" | "activated";

export type StaffListParams = {
  view: StaffView;
  category: Crm2PropertyCategory | null;
  status: Crm2PropertyStatus | null;
  project: string | null;
  district: string | null;
  loc: string | null;
  q: string | null;
  sort: StaffSort;
  page: number;
};

/** «Цэвэрлэх»-д хамаарах параметрүүд (харагдацыг хадгална). */
export const STAFF_FILTER_KEYS = ["category", "status", "project", "district", "loc", "q", "sort"] as const;

/** Нэмэлт шүүлтүүр (утсан дээр хураагдсан хэсэгт) — тоолуурт. */
const ADVANCED_KEYS = ["status", "project", "district", "loc", "sort"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

function text(v: string | string[] | undefined, max: number): string | null {
  const t = one(v).replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

/** Харагдацын анхдагч төлөв (?status байхгүй үед): идэвхтэй харагдац — зөвхөн «Идэвхтэй». */
export const STAFF_DEFAULT_STATUS: Partial<Record<StaffView, Crm2PropertyStatus>> = { active: "active" };

/** ?status=all — харагдацын бүх төлөв (анхдагчийг цуцална). */
export const STAFF_STATUS_ALL = "all";

/** Харагдацын анхдагч төлөв (байхгүй бол null — бүх төлөв). */
export function defaultStatusForView(view: StaffView): Crm2PropertyStatus | null {
  return STAFF_DEFAULT_STATUS[view] ?? null;
}

/** Харагдацад хамаарах төлвүүд (төлвийн шүүлтүүрийн сонголт). */
export function statusOptionsForView(view: StaffView): Crm2PropertyStatus[] {
  return PROPERTY_STATUS_GROUPS[view];
}

export function parseStaffListParams(sp: RawSearchParams | null | undefined): StaffListParams {
  const src = sp ?? {};
  const viewRaw = one(src.view);
  const view: StaffView = (STAFF_VIEWS as readonly string[]).includes(viewRaw) ? (viewRaw as StaffView) : "active";

  const catRaw = one(src.category);
  const category = (PROPERTY_CATEGORIES as readonly string[]).includes(catRaw) ? (catRaw as Crm2PropertyCategory) : null;

  // Төлөв нь сонгосон харагдацынх байх ёстой (Архив харагдацад «Идэвхтэй» төлөв гарахгүй).
  // Өгөөгүй (эсвэл буруу) бол харагдацын анхдагч; «all» бол бүлгийн бүх төлөв.
  const statusRaw = one(src.status);
  const groupStatuses = statusOptionsForView(view) as string[];
  const status =
    statusRaw === STAFF_STATUS_ALL
      ? null
      : groupStatuses.length > 1 && groupStatuses.includes(statusRaw)
        ? (statusRaw as Crm2PropertyStatus)
        : defaultStatusForView(view);

  const projectRaw = one(src.project);
  const project = UUID_RE.test(projectRaw) ? projectRaw.toLowerCase() : null;

  const pageNum = Math.floor(Number(one(src.page)));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, 10_000) : 1;

  return {
    view,
    category,
    status,
    project,
    district: text(src.district, 60),
    loc: text(src.loc, 200),
    q: text(src.q, 120),
    sort: one(src.sort) === "activated" ? "activated" : "created",
    page,
  };
}

/** Параметрийг listProperties()-ийн шүүлтүүр болгоно. */
export function toPropertyListFilters(p: StaffListParams, pageSize?: number): PropertyListFilters {
  return {
    statusGroup: p.view,
    status: p.status,
    category: p.category,
    projectId: p.project,
    district: p.district,
    location: p.loc,
    q: p.q,
    sort: p.sort,
    page: p.page,
    ...(pageSize ? { pageSize } : {}),
  };
}

/** Төлөв харагдацын анхдагчаас өөр эсэх (анхдагчийг шүүлтүүр гэж тоолохгүй). */
function statusChanged(p: StaffListParams): boolean {
  return p.status !== defaultStatusForView(p.view);
}

/** Харагдацаас бусад шүүлтүүр сонгогдсон эсэх. */
export function hasStaffFilters(p: StaffListParams): boolean {
  return !!(p.category || statusChanged(p) || p.project || p.district || p.loc || p.q || p.sort !== "created");
}

/** Хураагдсан хэсгийн идэвхтэй шүүлтүүрийн тоо (утсан дээрх «Шүүлтүүр (n)»). */
export function advancedFilterCount(p: StaffListParams): number {
  return ADVANCED_KEYS.filter((k) => (k === "sort" ? p.sort !== "created" : k === "status" ? statusChanged(p) : !!p[k])).length;
}

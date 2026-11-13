import type { Crm2Context } from "@/lib/crm2/types";

/**
 * CRM v2 холбоосууд. Агент (/agent/crm) ба оффис (/office/crm) панель ижил
 * сегменттэй тул хуваалцах компонент `panel`-аа авч href-ээ эндээс угсарна.
 * Цэвэр модуль — клиент компонентоос ч импортлоно.
 */

export type Crm2Panel = "agent" | "office";

export const CRM2_PANELS = ["agent", "office"] as const satisfies readonly Crm2Panel[];

export function panelBase(panel: Crm2Panel): "/agent/crm" | "/office/crm" {
  return panel === "office" ? "/office/crm" : "/agent/crm";
}

/** Замаас панелийг таах (/office/... → office, бусад → agent). */
export function panelFromPathname(pathname: string | null | undefined): Crm2Panel {
  return (pathname ?? "").startsWith("/office") ? "office" : "agent";
}

/** Хөрөнгийн картын табууд (?tab=...). */
export const PROPERTY_TABS = ["info", "agreement", "calls", "showings", "deals", "history"] as const;
export type PropertyTab = (typeof PROPERTY_TABS)[number];

export const PROPERTY_TAB_LABEL: Record<PropertyTab, string> = {
  info: "Үндсэн мэдээлэл",
  agreement: "Зуучлалын гэрээ",
  calls: "Дуудлага",
  showings: "Үзүүлэлт",
  deals: "Хэлцлүүд",
  history: "Өөрчлөлтийн түүх",
};

export function isPropertyTab(v: string | null | undefined): v is PropertyTab {
  return !!v && (PROPERTY_TABS as readonly string[]).includes(v);
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** Нэг панелийн бүх CRM холбоос. */
export function crm2Paths(panel: Crm2Panel) {
  const base = panelBase(panel);
  return {
    base,
    staff: (query?: Query) => withQuery(`${base}/staff`, query),
    staffNew: () => `${base}/staff/new`,
    property: (id: string, tab?: PropertyTab, query?: Query) =>
      withQuery(`${base}/staff/${id}`, { ...(tab && tab !== "info" ? { tab } : {}), ...query }),
    propertyEdit: (id: string) => `${base}/staff/${id}/edit`,
    deal: (propertyId: string, dealId: string) => `${base}/staff/${propertyId}/deals/${dealId}`,
    contacts: (query?: Query) => withQuery(`${base}/contacts`, query),
    contact: (id: string, query?: Query) => withQuery(`${base}/contacts/${id}`, query),
    myWork: (query?: Query) => withQuery(`${base}/my-work`, query),
    waitlist: () => `${base}/waitlist`,
    finance: () => `${base}/finance`,
    reports: () => `${base}/reports`,
    settings: () => `${base}/settings`,
    calendar: () => `${base}/calendar`,
    /** Батлах хүлээгдэж буй гэрээ, хүсэлт (crm2_my_context.can_approve). */
    approvals: () => `${base}/approvals`,
  };
}

export type Crm2Paths = ReturnType<typeof crm2Paths>;

/** Хоёр панелийн суурь — revalidate-д. */
export const CRM2_BASES = CRM2_PANELS.map(panelBase);

// ── Цэс ────────────────────────────────────────────────────────────────────

export type Crm2MenuKey = "staff" | "contacts" | "myWork" | "waitlist" | "finance" | "reports" | "settings";

export type Crm2MenuItem = { key: Crm2MenuKey; label: string; href: string };

export const CRM2_MENU_LABEL: Record<Crm2MenuKey, string> = {
  staff: "Staff",
  contacts: "Харилцагчид",
  myWork: "Миний ажил",
  waitlist: "Хүлээлгийн үйлчлүүлэгч",
  finance: "Санхүү",
  reports: "Тайлан",
  settings: "Тохиргоо",
};

/**
 * Үндсэн цэс (зурагны дарааллаар). Санхүү, Тайлан, Тохиргоо — эрхээр:
 * санхүү = санхүүгийн эрх эсвэл менежер; тайлан = ахлагч, менежер, санхүү;
 * тохиргоо = оффисын панелд тохиргоо удирдах эрхтэн, агентын панелд хувийн тохиргоо (бүгд).
 */
export function crm2MenuItems(panel: Crm2Panel, ctx: Crm2Context | null): Crm2MenuItem[] {
  const p = crm2Paths(panel);
  if (!ctx?.isMember) return [];
  const show: Record<Crm2MenuKey, boolean> = {
    staff: true,
    contacts: true,
    myWork: true,
    waitlist: true,
    finance: ctx.hasFinance || ctx.isManager,
    reports: ctx.isTeamLead || ctx.isManager || ctx.hasFinance,
    settings: panel === "agent" ? true : ctx.canManageSettings || ctx.isManager,
  };
  const href: Record<Crm2MenuKey, string> = {
    staff: p.staff(),
    contacts: p.contacts(),
    myWork: p.myWork(),
    waitlist: p.waitlist(),
    finance: p.finance(),
    reports: p.reports(),
    settings: p.settings(),
  };
  return (Object.keys(CRM2_MENU_LABEL) as Crm2MenuKey[])
    .filter((k) => show[k])
    .map((key) => ({ key, label: CRM2_MENU_LABEL[key], href: href[key] }));
}

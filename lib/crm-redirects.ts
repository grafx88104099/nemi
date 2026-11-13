/**
 * Хуучин CRM-ийн устгасан хуудсуудын чиглүүлэлт (next.config.ts → redirects()).
 * Хадгалагдсан мэдэгдлийн холбоос, хавчуурга шинэ CRM-ийн ойролцоо хэсэг рүү очно.
 * Эхний таарсан дүрэм үйлчилнэ — тодорхой дүрмийг ерөнхийн өмнө бичнэ. Дахин
 * ашигласан сегментийг (contacts/:id, finance, reports, calendar, settings/staff,
 * teams) энд оруулахгүй. Бүгд түр (307).
 */

type Redirect = { source: string; destination: string; permanent: false };

const r = (source: string, destination: string): Redirect => ({ source, destination, permanent: false });

/** Хоёр панельд ижил сегментийн дүрмүүд. */
function shared(base: "/agent/crm" | "/office/crm"): Redirect[] {
  return [
    r(`${base}/leads/:path*`, `${base}/contacts`),
    r(`${base}/listings`, `${base}/staff`),
    r(`${base}/properties/:path*`, `${base}/staff`),
    r(`${base}/transactions/:path*`, `${base}/staff`),
    r(`${base}/pool`, `${base}/staff`),
    r(`${base}/commissions/:path*`, `${base}/finance`),
    r(`${base}/week/:path*`, `${base}/calendar`),
  ];
}

export const CRM_REDIRECTS: Redirect[] = [
  // Хуучин лидийн хуудас (CRM-ээс өмнөх).
  r("/agent/leads/:path*", "/agent/crm/contacts"),

  // Агентын панель — тодорхой дүрэм эхэнд.
  r("/agent/crm/worklists/vitals", "/agent/crm/reports"),
  r("/agent/crm/worklists/leaderboard", "/agent/crm/reports"),
  r("/agent/crm/worklists/:path*", "/agent/crm/my-work"),
  r("/agent/crm/pipeline/:path*", "/agent/crm/staff"),
  r("/agent/crm/links", "/agent/crm/staff"),
  r("/agent/crm/team/:planId((?!monitor$).*)", "/agent/crm/team/monitor"),
  ...shared("/agent/crm"),

  // Оффисын панель.
  r("/office/crm/contacts/merge", "/office/crm/contacts"),
  r("/office/crm/pipeline", "/office/crm/staff"),
  r("/office/crm/deals/:path*", "/office/crm/staff"),
  r("/office/crm/disputes", "/office/crm/staff"),
  r("/office/crm/rentals/:path*", "/office/crm/finance"),
  r("/office/crm/aml/:path*", "/office/crm/finance"),
  r("/office/crm/quality/:path*", "/office/crm/reports"),
  r("/office/crm/vitals", "/office/crm/reports"),
  r("/office/crm/settings/:section(pipelines|scoring|commissions|zones|rules|notifications|lookups|budget)", "/office/crm/settings"),
  ...shared("/office/crm"),

  // Хуучин нийтийн токен хуудас (идэвхтэй холбоос алга).
  r("/c/:token", "/"),
  r("/o/:token", "/"),
  r("/q/:code", "/"),
];

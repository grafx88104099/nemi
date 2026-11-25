/**
 * Алдаа / 404 хуудсын «буцах» холбоос: агент, оффисын панелийн хаягаас нийтийн нүүр (/) руу биш,
 * тухайн панелийн нүүр рүү. Суулгасан апп (start_url /agent/crm) хөтчийн «буцах»-гүй тул нийтийн
 * сайт руу гарвал CRM руу шууд буцах зам байхгүй болдог. Цэвэр функц (client/server аль алинд).
 */
export type PanelHome = { href: string; label: string };

export function panelHomeFor(pathname: string | null | undefined): PanelHome | null {
  const p = pathname ?? "";
  if (p === "/agent" || p.startsWith("/agent/")) return { href: "/agent/crm", label: "CRM руу буцах" };
  if (p === "/office" || p.startsWith("/office/")) return { href: "/office/crm", label: "Оффисын CRM руу буцах" };
  return null;
}

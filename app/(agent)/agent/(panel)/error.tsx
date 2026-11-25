"use client"; // Алдааны хил Client Component байх ёстой.

import { panelHomeFor } from "@/lib/panel-home";
import { CrmError } from "@/components/crm2/shell/CrmError";

/**
 * Агентын панелийн (чат, зар, профайл …) хуудасны алдаа — Topbar хэвээр, «Дахин оролдох» ба CRM руу
 * буцах холбоос. Root app/error.tsx нь панелийн толгойгүй, нийтийн нүүр рүү заадаг байсан (суулгасан
 * апп-д «буцах» байхгүй). CRM-ийн хуудсыг crm/error.tsx барина.
 */
export default function AgentPanelError(props: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return <CrmError {...props} home={panelHomeFor("/agent")} />;
}

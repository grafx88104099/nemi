"use client"; // Алдааны хил Client Component байх ёстой.

import { panelHomeFor } from "@/lib/panel-home";
import { CrmError } from "@/components/crm2/shell/CrmError";

/**
 * Оффисын панелийн (ажил, агент, зар …) хуудасны алдаа — панелийн толгой хэвээр, «Дахин оролдох» ба
 * оффисын CRM руу буцах холбоос (нийтийн нүүр рүү биш). CRM-ийн хуудсыг crm/error.tsx барина.
 */
export default function OfficePanelError(props: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return <CrmError {...props} home={panelHomeFor("/office")} />;
}

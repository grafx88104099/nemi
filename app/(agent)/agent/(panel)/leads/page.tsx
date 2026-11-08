import { redirect } from "next/navigation";

/**
 * Хуучин «Лид (CRM)» хуудас — албан бүртгэл CRM руу шилжсэн
 * (PRO-001 v2.1 §6.1). Хуучин холбоос, хавчуурга шинэ хуудас руу очно.
 */
export default function LegacyLeadsRedirect() {
  redirect("/agent/crm/leads");
}

import { redirect } from "next/navigation";

/** CRM-ийн эхний дэлгэц — Staff жагсаалт. */
export default function AgentCrmIndexPage() {
  redirect("/agent/crm/staff");
}

import { redirect } from "next/navigation";

import { findMigratedLeadId } from "@/lib/queries-crm-leads";

/**
 * Хуучин лидийн карт — CRM руу шилжүүлсэн бол шинэ сэжимийн карт руу,
 * үгүй бол сэжимийн жагсаалт руу чиглүүлнэ.
 */
export default async function LegacyLeadRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const migrated = await findMigratedLeadId(id);
  redirect(migrated ? `/agent/crm/leads/${migrated}` : "/agent/crm/leads");
}

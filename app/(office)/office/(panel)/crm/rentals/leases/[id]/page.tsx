import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getArrearsEscalations, getLease } from "@/lib/queries-crm-rentals";
import { LeaseDetailShell } from "@/components/crm/LeaseDetailShell";

export const metadata = { title: "Түрээсийн гэрээ — CRM" };

/** Гэрээний карт: гинж (F-504), нэхэмжлэх/төлбөр, барьцаа/суутгал, үзлэг, хоцролт (§4.1). */
export default async function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const [lease, arrears] = await Promise.all([getLease(id), getArrearsEscalations(id)]);
  if (!lease) notFound();

  return (
    <div className="p-8">
      <LeaseDetailShell lease={lease} arrears={arrears} roles={ctx.roles} />
    </div>
  );
}

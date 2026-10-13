import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getAmlCase } from "@/lib/queries-crm-aml";
import { AmlCaseDetailShell } from "@/components/crm/AmlCaseShell";

export const metadata = { title: "МУТСТ кейс — CRM" };

/** Кейсийн хавтас — үзэлт бүр definer RPC-ээр аудитад (ToR §7.6.5). */
export default async function AmlCasePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!ctx.roles.some((r) => r === "aml_officer" || r === "ceo")) redirect("/office/crm");

  const { id } = await params;
  const detail = await getAmlCase(id);
  if (!detail) notFound();

  return (
    <div className="p-8">
      <AmlCaseDetailShell detail={detail} roles={ctx.roles} />
    </div>
  );
}

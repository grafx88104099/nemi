import { redirect } from "next/navigation";

/**
 * Агентын холбоос (/agent/crm/week/<огноо>/review) оффисын панелд ирвэл —
 * тухайн долоо хоногийн Баасан гарагийн дүн шинжилгээний тойм руу.
 */
export default async function OfficeWeekReviewRedirect({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  if (/^\d{4}-\d{2}-\d{2}$/.test(planId)) redirect(`/office/crm/week?week=${planId}&tab=friday`);
  redirect(`/office/crm/week/${planId}`);
}

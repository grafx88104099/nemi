import { QuickAddScreen } from "@/components/crm2/staff/quick/QuickAddScreen";
import { StaffFormScreen } from "@/components/crm2/staff/form/StaffFormScreen";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { sharedToFullForm, staffNewScreen } from "@/lib/crm2/feature-flags";

export const metadata = { title: "Шинэ хөрөнгө — Staff" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * S02 Staff хөрөнгө нэмэх (агентын панель). Шуурхай бүртгэл (staff.quick_add, хуваалцсан зар) эсвэл
 * өөрчлөгдөөгүй бүрэн форм (?full=1). Дэлгэцүүд components/crm2/staff/{quick,form}-д.
 */
export default async function AgentStaffNewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [ctx, settings] = await Promise.all([getCrm2Context(), getCrm2Settings()]);
  if (ctx?.isMember && staffNewScreen(settings, ctx.profileId, sp, ctx.canWork) === "quick") {
    return <QuickAddScreen panel="agent" share={one(sp.share)} draft={one(sp.draft)} />;
  }
  return <StaffFormScreen panel="agent" sharedNotice={sharedToFullForm(sp)} />;
}

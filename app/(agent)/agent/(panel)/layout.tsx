import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { Topbar } from "@/components/layout/Topbar";
import { AgentMobileChrome } from "@/components/crm/mobile/AgentMobileChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/agent/login?next=/agent");

  // CRM ажилтанд: гар утасны доод цэс, Ctrl+K хайлт, PWA (UX-6, R4, R29).
  const crm = await getCrmStaffContext();

  return (
    <>
      <Topbar />
      <main className="flex-1 bg-bg">{children}</main>
      {crm ? <AgentMobileChrome roles={crm.roles} /> : null}
    </>
  );
}

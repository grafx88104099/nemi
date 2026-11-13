import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { Topbar } from "@/components/layout/Topbar";
import { ServiceWorkerRegister } from "@/components/crm2/shell/ServiceWorkerRegister";

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

  // CRM ажилтанд: service worker (push мэдэгдэл, нүүр дэлгэцэд суулгах). CRM цэс нь /agent/crm layout-д.
  const crm = await getCrmStaffContext();

  return (
    <>
      <Topbar />
      <main className="flex-1 bg-bg">{children}</main>
      {crm ? <ServiceWorkerRegister /> : null}
    </>
  );
}

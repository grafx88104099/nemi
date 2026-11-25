import type { Viewport } from "next";
import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/supabase/user";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getMyTeamChatId } from "@/lib/queries-team-chat";
import { Topbar } from "@/components/layout/Topbar";
import { ServiceWorkerRegister } from "@/components/crm2/shell/ServiceWorkerRegister";
import { AgentNavProvider } from "@/components/dashboard/DashboardNav";

/**
 * Утсанд суулгасан апп (manifest start_url /agent/crm) энэ layout-д нээгддэг. viewportFit "cover" нь
 * iOS-д env(safe-area-inset-*)-ийг идэвхжүүлнэ: Topbar (дээд), энэ wrapper (зүүн/баруун), CRM-ийн доод
 * хурдан цэс, sheet, хадгалах мөр (доод) зай авна. Шинэ fixed элемент нэмбэл inset-ээ өөрөө тооцно.
 */
export const viewport: Viewport = { viewportFit: "cover" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/agent/login?next=/agent");

  // Topbar ба цэсийн уншилт (AgentPanelNav) зэрэгцэн явна — өмнө нь Topbar энэ гинжийг хүлээдэг байв.
  return (
    <div className="flex min-h-full flex-1 flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <Topbar />
      <main className="flex-1 bg-bg">
        <AgentPanelNav>{children}</AgentPanelNav>
      </main>
    </div>
  );
}

/**
 * CRM ажилтанд: service worker (push мэдэгдэл, нүүр дэлгэцэд суулгах). CRM цэс нь /agent/crm layout-д.
 * Багийн гишүүнд «Багийн чат» цэс (агентын дээд цэс ба CRM-ийн цэс нэг уншилтыг хуваалцана — cache).
 */
async function AgentPanelNav({ children }: { children: React.ReactNode }) {
  const crm = await getCrmStaffContext();
  const teamChatId = await getMyTeamChatId(crm?.teamId ?? null);
  return (
    <>
      <AgentNavProvider crm={!!crm} teamChatId={teamChatId}>
        {children}
      </AgentNavProvider>
      {crm ? <ServiceWorkerRegister /> : null}
    </>
  );
}

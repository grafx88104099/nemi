import { getCrm2Context } from "@/lib/crm2/context";
import type { Crm2Panel } from "@/lib/crm2/paths";
import type { CrmStaffContext } from "@/lib/queries-crm-core";
import { cn } from "@/lib/utils";

import { CrmNav } from "./CrmNav";
import { crmNavItems, fallbackCrm2Context } from "./menu";

/**
 * CRM-ийн бүрхүүл (хоёр панель): дээд талд эрхээр шүүсэн хэвтээ цэс, доор хуудас.
 * Эрхийг crm2_my_context()-оос; уншиж чадаагүй бол crm_staff-ийн дүрээр хамгийн бага цэс.
 */
export async function CrmShell({
  panel,
  staff,
  canOpenTeam,
  children,
}: {
  panel: Crm2Panel;
  staff: CrmStaffContext;
  /** «Миний баг»: агентад ахлагч (багтай), оффист баг удирдах / явц харах эрхтэн. */
  canOpenTeam: boolean;
  children: React.ReactNode;
}) {
  const ctx2 = await getCrm2Context();
  const ctx = ctx2?.isMember ? ctx2 : fallbackCrm2Context(staff);
  const { primary, secondary } = crmNavItems(panel, ctx, { canOpenTeam, canOpenRequests: !!ctx2?.isMember });

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="border-b border-line bg-surface">
        <div className={cn("min-w-0 px-2 sm:px-4", panel === "agent" ? "mx-auto max-w-7xl" : "md:px-6")}>
          <CrmNav primary={primary} secondary={secondary} />
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

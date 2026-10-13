import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { CrmNav } from "@/components/crm/CrmNav";

/**
 * CRM guard (DESIGN §4.1): идэвхтэй crm_staff мөргүй хэрэглэгчийг /office руу
 * буцаана; дүрийн жагсаалтыг хоёрдогч цэсэнд дамжуулна. aml/settings хуудсууд
 * өөрийн дүрийн шалгалтыг серверт давхар хийнэ.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-line bg-surface px-8">
        <CrmNav roles={ctx.roles} basePath="/office/crm" />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

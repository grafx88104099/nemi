import { getBranches, getStaffList, getTeams } from "@/lib/queries-crm-core";
import { getAssigneeOptions } from "@/lib/queries-tasks";
import { BackLink } from "@/components/ui/back-link";
import { requireSettingsAccess } from "../_lib/guard";
import { ubDateIso } from "@/lib/crm/week";
import { StaffShell } from "./StaffShell";

export const metadata = { title: "Ажилтан, дүр — CRM тохиргоо" };

export default async function StaffSettingsPage() {
  const ctx = await requireSettingsAccess();
  const [staff, branches, teams, candidates] = await Promise.all([
    getStaffList(),
    getBranches(),
    getTeams(),
    getAssigneeOptions(),
  ]);

  return (
    <div className="p-4 sm:p-8">
      <BackLink href="/office/crm/settings" label="Тохиргоо руу буцах" />
      <h1 className="text-2xl font-extrabold text-ink">Агент, хэрэглэгчийн эрх</h1>
      <p className="text-sm text-muted">
        CRM-ийн дүрийн оноолт (нэг хүн олон дүртэй байж болно); дүрийн өөрчлөлт бүр аудитад бүртгэгдэнэ.
        «Панелийн админ» — CRM-ээс гадуурх оффисын тохиргоог засах эрхтэйг тэмдэглэнэ.
      </p>
      <StaffShell
        staff={staff}
        branches={branches}
        teams={teams}
        candidates={candidates}
        canEdit={ctx.roles.includes("sysadmin") || ctx.roles.includes("sales_director")}
        canManageLeave={ctx.roles.includes("sales_director")}
        today={ubDateIso()}
      />
    </div>
  );
}

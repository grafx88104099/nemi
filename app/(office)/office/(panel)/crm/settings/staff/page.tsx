import { getBranches, getStaffList, getTeams } from "@/lib/queries-crm-core";
import { getAssigneeOptions } from "@/lib/queries-tasks";
import { getHandoverActs } from "@/lib/queries-crm-reports";
import { HandoverActShell } from "@/components/crm/HandoverActShell";
import { requireSettingsAccess } from "../_lib/guard";
import { StaffShell } from "./StaffShell";

export const metadata = { title: "Ажилтан, дүр — CRM тохиргоо" };

export default async function StaffSettingsPage() {
  const ctx = await requireSettingsAccess();
  const [staff, branches, teams, candidates, acts] = await Promise.all([
    getStaffList(),
    getBranches(),
    getTeams(),
    getAssigneeOptions(),
    getHandoverActs(),
  ]);

  // Д-11 (P-10): offboarding эхэлсэн ч акт нь хараахан үүсээгүй ажилтнууд +
  // шилжүүлэн авах идэвхтэй ажилтны сонголт.
  const withActs = new Set(acts.map((a) => a.staff_id));
  const offboardingStaff = staff
    .filter((s) => s.offboarding && s.is_active && !withActs.has(s.id))
    .map((s) => ({ staffId: s.id, name: s.full_name ?? s.email ?? "?" }));
  const agentOptions = staff
    .filter((s) => s.is_active && !s.offboarding)
    .map((s) => ({ profileId: s.profile_id, name: s.full_name ?? s.email ?? "?" }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Ажилтан, дүр</h1>
      <p className="text-sm text-muted">
        CRM-ийн 10 дүрийн оноолт (нэг хүн олон дүртэй байж болно); дүрийн өөрчлөлт бүр аудитад бүртгэгдэнэ (ACC-02).
        «Панелийн админ» — CRM-ээс гадуурх оффисын тохиргоог засах эрхтэйг тэмдэглэнэ (§1.1 хаалт).
      </p>
      <StaffShell
        staff={staff}
        branches={branches}
        teams={teams}
        candidates={candidates}
        canEdit={ctx.roles.includes("sysadmin") || ctx.roles.includes("sales_director")}
      />

      <div className="mt-8">
        <h2 className="text-lg font-bold text-ink">Хүлээлцэх акт (Д-11, P-10)</h2>
        <p className="text-sm text-muted">
          Гарах ажилтны нээлттэй бичлэгийн багц — шилжүүлэлт бүр түүх+аудиттай; дутуу
          шилжүүлэлттэй актыг батлахгүй, батлагдаагүй бол идэвхгүй болгохыг систем хориглоно.
        </p>
        <div className="mt-4">
          <HandoverActShell
            acts={acts}
            offboardingStaff={offboardingStaff}
            agentOptions={agentOptions}
            roles={ctx.roles}
          />
        </div>
      </div>
    </div>
  );
}

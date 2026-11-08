import { getBranches, getStaffList, getTeams } from "@/lib/queries-crm-core";
import { getAssigneeOptions } from "@/lib/queries-tasks";
import { getHandoverActs } from "@/lib/queries-crm-reports";
import { HandoverActShell } from "@/components/crm/HandoverActShell";
import { requireSettingsAccess } from "../_lib/guard";
import { toIsoDate } from "@/lib/crm/calendar";
import { StaffShell } from "./StaffShell";

/** УБ-ын өнөөдрийн огноо (чөлөөний төлөвт). */
function ubToday(): string {
  return toIsoDate(new Date());
}

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

  // Гарах урсгал эхэлсэн ч акт нь хараахан үүсээгүй ажилтнууд +
  // шилжүүлэн авах идэвхтэй ажилтны сонголт.
  const withActs = new Set(acts.map((a) => a.staff_id));
  const offboardingStaff = staff
    .filter((s) => s.offboarding && s.is_active && !withActs.has(s.id))
    .map((s) => ({ staffId: s.id, name: s.full_name ?? s.email ?? "?" }));
  const agentOptions = staff
    .filter((s) => s.is_active && !s.offboarding)
    .map((s) => ({ profileId: s.profile_id, name: s.full_name ?? s.email ?? "?" }));

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Ажилтан, дүр</h1>
      <p className="text-sm text-muted">
        CRM-ийн дүрийн оноолт (нэг хүн олон дүртэй байж болно); дүрийн өөрчлөлт бүр аудитад бүртгэгдэнэ.
        «Панелийн админ» — CRM-ээс гадуурх оффисын тохиргоог засах эрхтэйг тэмдэглэнэ. Чөлөө авсан ажилтны сэжмийг
        орлон ажиллагчид түр хүлээлцэнэ.
      </p>
      <StaffShell
        staff={staff}
        branches={branches}
        teams={teams}
        candidates={candidates}
        canEdit={ctx.roles.includes("sysadmin") || ctx.roles.includes("sales_director")}
        canManageLeave={ctx.roles.includes("sales_director")}
        today={ubToday()}
      />

      <div className="mt-8">
        <h2 className="text-lg font-bold text-ink">Хүлээлцэх акт</h2>
        <p className="text-sm text-muted">
          Гарах ажилтны нээлттэй сэжим, боломж, үл хөдлөхийн багц — шилжүүлэлт бүр түүхтэй; дутуу шилжүүлэлттэй актыг
          батлахгүй, батлагдаагүй бол идэвхгүй болгох, нэвтрэлт хаах, устгахыг систем хориглоно.
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

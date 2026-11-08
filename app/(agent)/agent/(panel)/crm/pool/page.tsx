import Link from "next/link";
import { redirect } from "next/navigation";

import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import {
  getDispute,
  getDisputes,
  getMyAcceptPending,
  getPoolClaims,
  getPoolLeads,
  isTeamLeadOfDisputeParty,
} from "@/lib/queries-crm-ownership";
import { CrmNav } from "@/components/crm/CrmNav";
import { AcceptList, DuplicateCheck, PoolClaimQueue, PoolLeadList } from "@/components/crm/ClaimCard";
import { DisputeList, DisputePanel } from "@/components/crm/DisputePanel";
import { canDecidePoolClaim } from "@/lib/validation/crm-ownership";
import { cn } from "@/lib/utils";
import type { CrmRole } from "@/lib/constants-crm";

export const metadata = { title: "Эзэмшил, эргэлтийн сан — CRM" };

type SearchParams = Promise<{ tab?: string; id?: string }>;

const BASE = "/agent/crm";

/**
 * Агентын эзэмшлийн хэсэг (§6.26, §6.27): хүлээн авах сэжим, харилцагч
 * шалгах (масктай давхардал → маргаан), эргэлтийн сан (зөвшөөрлөөр авах),
 * миний маргаан. Багийн ахлагч сангийн хүсэлт, багийн маргааныг эндээс шийднэ.
 */
export default async function AgentPoolPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  const sp = await searchParams;
  const canDecide = canDecidePoolClaim(ctx.roles);

  const tabs = [
    { value: "accept", label: "Хүлээн авах" },
    { value: "check", label: "Харилцагч шалгах" },
    { value: "pool", label: "Эргэлтийн сан" },
    ...(canDecide ? [{ value: "claims", label: "Сангийн хүсэлт" }] : []),
    { value: "disputes", label: "Маргаан" },
  ];
  const tab = tabs.some((t) => t.value === sp.tab) ? (sp.tab as string) : sp.id ? "disputes" : "accept";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath={BASE} />
      </div>
      <h1 className="text-2xl font-extrabold text-ink">Эзэмшил ба эргэлтийн сан</h1>
      <p className="mt-1 text-sm text-muted">
        Эзэмшил нь хамгийн түрүүнд хийсэн хүчинтэй бүртгэл ба бодит үйл ажиллагааны нотолгоонд тулгуурлана.
      </p>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Хэсгүүд">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`${BASE}/pool?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
              tab === t.value ? "border-brand-500 text-brand-700" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "accept" ? <AcceptTab profileId={ctx.profileId} /> : null}
        {tab === "check" ? <DuplicateCheck basePath={BASE} /> : null}
        {tab === "pool" ? <PoolTab /> : null}
        {tab === "claims" && canDecide ? <ClaimsTab me={ctx.profileId} /> : null}
        {tab === "disputes" ? (
          <DisputesTab
            me={ctx.profileId}
            roles={ctx.roles}
            teamId={ctx.teamId}
            selectedId={sp.id ?? null}
          />
        ) : null}
      </div>
    </div>
  );
}

async function AcceptTab({ profileId }: { profileId: string }) {
  const rows = await getMyAcceptPending(profileId);
  return <AcceptList rows={rows} basePath={BASE} />;
}

async function PoolTab() {
  const rows = await getPoolLeads();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Санд буцаасан сэжмийг шууд авахгүй — хүсэлт илгээж, Багийн ахлагч эсвэл Борлуулалт хариуцсан захирал
        зөвшөөрсний дараа танд оноогдоно. Сэжмийг ажиллаж байгаа нь эзэмшил биш.
      </p>
      <PoolLeadList rows={rows} canClaim />
    </div>
  );
}

async function ClaimsTab({ me }: { me: string }) {
  const [claims, leads] = await Promise.all([getPoolClaims({ status: "requested" }), getPoolLeads()]);
  return <PoolClaimQueue claims={claims} leads={leads} canDecide me={me} />;
}

async function DisputesTab({
  me,
  roles,
  teamId,
  selectedId,
}: {
  me: string;
  roles: CrmRole[];
  teamId: string | null;
  selectedId: string | null;
}) {
  const [rows, detail, setting] = await Promise.all([
    getDisputes(),
    selectedId ? getDispute(selectedId, me) : Promise.resolve(null),
    getSettingValue<{ appeal_days?: number }>("lead_dispute"),
  ]);
  const appealDays = Number(setting?.appeal_days) > 0 ? Number(setting?.appeal_days) : 5;
  const tl = detail ? await isTeamLeadOfDisputeParty(teamId, detail.claimant_id, detail.respondent_id) : false;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <DisputeList rows={rows} me={me} selectedId={selectedId} hrefBase={`${BASE}/pool?tab=disputes&id=`} />
      <div>
        {detail ? (
          <DisputePanel
            dispute={detail}
            me={me}
            roles={roles}
            isTeamLeadOfParty={tl && roles.includes("team_lead")}
            appealDays={appealDays}
            leadHref={detail.respondent_id === me || tl ? `${BASE}/leads/${detail.lead_id}` : null}
          />
        ) : selectedId ? (
          <p className="text-sm text-muted">Маргаан олдсонгүй эсвэл танд харах эрх алга.</p>
        ) : (
          <p className="hidden text-sm text-muted lg:block">Жагсаалтаас маргаан сонгоно уу.</p>
        )}
      </div>
    </div>
  );
}

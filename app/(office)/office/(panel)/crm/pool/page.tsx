import Link from "next/link";
import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getPoolClaims, getPoolLeads } from "@/lib/queries-crm-ownership";
import { DuplicateCheck, PoolClaimQueue, PoolLeadList } from "@/components/crm/ClaimCard";
import { canDecidePoolClaim } from "@/lib/validation/crm-ownership";
import { cn } from "@/lib/utils";

export const metadata = { title: "Эргэлтийн сан — CRM" };

type SearchParams = Promise<{ tab?: string; id?: string }>;

const BASE = "/office/crm";

/**
 * Оффисын эргэлтийн сан (§6.27, R3): санд буцаасан сэжим, агентуудын авах
 * хүсэлтийн шийдвэр, харилцагч шалгах. Маргааны холбоосыг маргааны хуудас
 * руу шилжүүлнэ (агентын панелийн холбоос оффист ирэхэд).
 */
export default async function OfficePoolPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const sp = await searchParams;
  if (sp.tab === "disputes") redirect(sp.id ? `${BASE}/disputes?id=${sp.id}` : `${BASE}/disputes`);
  if (sp.tab === "accept") redirect(`${BASE}/leads`);

  const canDecide = canDecidePoolClaim(ctx.roles);
  const canClaim = ctx.roles.includes("agent");
  const tabs = [
    { value: "pool", label: "Эргэлтийн сан" },
    { value: "claims", label: "Авах хүсэлт" },
    { value: "check", label: "Харилцагч шалгах" },
  ];
  const tab = tabs.some((t) => t.value === sp.tab) ? (sp.tab as string) : "pool";

  const [leads, claims] = await Promise.all([
    tab === "check" ? Promise.resolve([]) : getPoolLeads(),
    tab === "claims" ? getPoolClaims() : Promise.resolve([]),
  ]);
  const pendingFirst = [...claims].sort((a, b) =>
    a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "requested" ? -1 : 1
  );

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Эргэлтийн сан</h1>
      <p className="mt-1 text-sm text-muted">
        Хянан үзэж санд буцаасан сэжим. Агент сангаас зөвхөн Багийн ахлагч эсвэл Борлуулалт хариуцсан захирлын
        зөвшөөрлөөр авна; зөвшөөрөгдмөгц эхний холболтын хугацаа шинээр тоологдоно.
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
        <Link
          href={`${BASE}/disputes`}
          className="ml-auto whitespace-nowrap px-3 py-2 text-sm font-semibold text-brand-700 hover:underline"
        >
          Маргаан, хүсэлтүүд
        </Link>
      </nav>

      <div className="mt-5 max-w-4xl">
        {tab === "pool" ? <PoolLeadList rows={leads} canClaim={canClaim} /> : null}
        {tab === "claims" ? (
          <PoolClaimQueue claims={pendingFirst} leads={leads} canDecide={canDecide} me={ctx.profileId} />
        ) : null}
        {tab === "check" ? <DuplicateCheck basePath={BASE} /> : null}
      </div>
    </div>
  );
}

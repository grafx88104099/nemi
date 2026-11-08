import Link from "next/link";
import { redirect } from "next/navigation";

import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import {
  getCoiDeclarations,
  getDataRequests,
  getDispute,
  getDisputes,
  getExportRequests,
  getOwnerCandidates,
  isTeamLeadOfDisputeParty,
} from "@/lib/queries-crm-ownership";
import {
  DataRequestForm,
  DataRequestQueue,
  DisputeList,
  DisputePanel,
  ExportRequestForm,
  ExportRequestQueue,
} from "@/components/crm/DisputePanel";
import { CoiPanel } from "@/components/crm/OwnershipPanel";
import { ACTIVE_DISPUTE_STATUSES } from "@/lib/validation/crm-ownership";
import { cn } from "@/lib/utils";

export const metadata = { title: "Маргаан, хүсэлтүүд — CRM" };

type SearchParams = Promise<{ tab?: string; id?: string; all?: string }>;

const BASE = "/office/crm";

/**
 * Удирдлагын хяналтын хайрцаг (§5, §6.26, §6.32, §7): сэжимийн эзэмшлийн
 * маргаан (хянах, шийдэх, CEO-д шилжүүлэх, давж заалдах), экспортын хүсэлт,
 * хувь хүний мэдээллийн хүсэлт, ашиг сонирхлын мэдүүлэг.
 */
export default async function DisputesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const sp = await searchParams;
  const isMgr = ctx.roles.some((r) => r === "sales_director" || r === "ops_qc" || r === "ceo");
  const isOps = ctx.roles.includes("ops_qc");

  const tabs = [
    { value: "disputes", label: "Эзэмшлийн маргаан" },
    { value: "exports", label: "Экспортын хүсэлт" },
    ...(isMgr ? [{ value: "privacy", label: "Хувийн мэдээллийн хүсэлт" }] : []),
    { value: "coi", label: "Ашиг сонирхлын мэдүүлэг" },
  ];
  const tab = tabs.some((t) => t.value === sp.tab) ? (sp.tab as string) : "disputes";

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Маргаан, хүсэлтүүд</h1>
      <p className="mt-1 text-sm text-muted">
        Сэжимийн эзэмшлийн маргааныг Багийн ахлагч, Үйл ажиллагаа-ЧМТ хянаж, Борлуулалт хариуцсан захирал эхний
        шатанд шийднэ. Өөрийн чиглүүлсэн, үүрэг, хувийг нь баталсан эсвэл хамаарал бүхий маргааныг систем
        шийдвэрлүүлэхгүй.
      </p>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Хэсгүүд">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`${BASE}/disputes?tab=${t.value}`}
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
          href={`${BASE}/pool`}
          className="ml-auto whitespace-nowrap px-3 py-2 text-sm font-semibold text-brand-700 hover:underline"
        >
          Эргэлтийн сан
        </Link>
      </nav>

      <div className="mt-5">
        {tab === "disputes" ? (
          <DisputesTab ctx={ctx} selectedId={sp.id ?? null} showAll={sp.all === "1"} />
        ) : null}
        {tab === "exports" ? (
          <ExportsTab me={ctx.profileId} canDecide={isOps || ctx.roles.includes("sales_director")} isMgr={isMgr} />
        ) : null}
        {tab === "privacy" && isMgr ? <PrivacyTab canDecide={isOps} /> : null}
        {tab === "coi" ? <CoiTab ctx={ctx} showAll={isMgr} /> : null}
      </div>
    </div>
  );
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getCrmStaffContext>>>;

async function DisputesTab({ ctx, selectedId, showAll }: { ctx: Ctx; selectedId: string | null; showAll: boolean }) {
  const [rows, detail, setting] = await Promise.all([
    getDisputes(showAll ? {} : { statuses: ACTIVE_DISPUTE_STATUSES }),
    selectedId ? getDispute(selectedId, ctx.profileId) : Promise.resolve(null),
    getSettingValue<{ appeal_days?: number }>("lead_dispute"),
  ]);
  const appealDays = Number(setting?.appeal_days) > 0 ? Number(setting?.appeal_days) : 5;
  const tl = detail ? await isTeamLeadOfDisputeParty(ctx.teamId, detail.claimant_id, detail.respondent_id) : false;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-2">
        <div className="flex gap-3 text-sm">
          <Link
            href={`${BASE}/disputes?tab=disputes`}
            className={showAll ? "text-muted hover:text-ink" : "font-semibold text-brand-700"}
          >
            Шийдвэрлэх
          </Link>
          <Link
            href={`${BASE}/disputes?tab=disputes&all=1`}
            className={showAll ? "font-semibold text-brand-700" : "text-muted hover:text-ink"}
          >
            Бүгд
          </Link>
        </div>
        <DisputeList
          rows={rows}
          me={ctx.profileId}
          selectedId={selectedId}
          hrefBase={`${BASE}/disputes?tab=disputes${showAll ? "&all=1" : ""}&id=`}
        />
      </div>
      <div>
        {detail ? (
          <DisputePanel
            dispute={detail}
            me={ctx.profileId}
            roles={ctx.roles}
            isTeamLeadOfParty={tl && ctx.roles.includes("team_lead")}
            appealDays={appealDays}
            leadHref={`${BASE}/leads/${detail.lead_id}`}
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

async function ExportsTab({ me, canDecide, isMgr }: { me: string; canDecide: boolean; isMgr: boolean }) {
  const rows = await getExportRequests(isMgr ? {} : { mine: me });
  const sorted = [...rows].sort((a, b) =>
    a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "requested" ? -1 : 1
  );
  return (
    <div className="max-w-4xl space-y-3">
      <p className="text-sm text-muted">
        Агент зөвшөөрөлгүйгээр мэдээлэл татаж авах, гадагш дамжуулахгүй. Зөвшөөрсөн хүсэлт тохиргооны хугацаанд,
        заасан мөрийн тоогоор нэг удаа хүчинтэй; өөрийн хүсэлтийг өөрөө шийдэхгүй.
      </p>
      <ExportRequestForm />
      <ExportRequestQueue rows={sorted} canDecide={canDecide} me={me} />
    </div>
  );
}

async function PrivacyTab({ canDecide }: { canDecide: boolean }) {
  const rows = await getDataRequests();
  return (
    <div className="max-w-4xl space-y-3">
      <p className="text-sm text-muted">
        Харилцагчийн хүсэлтээр мэдээллийг нь танилцуулах, засах, нэргүйжүүлэх. Нээлттэй ажил, хүчинтэй гэрээ, МУТСТ
        кейс эсвэл хадгалах хугацаа дуусаагүй бол систем нэргүйжүүлэхгүй. Шийдвэрийг Үйл ажиллагаа-ЧМТ гаргана.
      </p>
      <DataRequestForm />
      <DataRequestQueue rows={rows} canDecide={canDecide} />
    </div>
  );
}

async function CoiTab({ ctx, showAll }: { ctx: Ctx; showAll: boolean }) {
  const [rows, agents] = await Promise.all([
    getCoiDeclarations(showAll ? {} : { profileId: ctx.profileId }),
    getOwnerCandidates(ctx.officeId),
  ]);
  return (
    <div className="max-w-4xl space-y-3">
      <p className="text-sm text-muted">
        Харилцагч эсвэл ажилтантай хамааралтай бол мэдүүлнэ (PMC-SAL-COI-001). Мэдүүлсэн хамаарал бүхий эзэмшлийн
        маргааныг тухайн ажилтан шийдвэрлэхгүй.
      </p>
      <CoiPanel rows={rows} me={ctx.profileId} agents={agents} showOwner={showAll} />
    </div>
  );
}

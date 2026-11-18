import { Clock3 } from "lucide-react";

import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getWaitlist } from "@/lib/crm2/queries/waitlist";
import { Crm2Empty, FilterProvider, NoAccessState, type FilterParams } from "@/components/crm2/ui";

import { hasWaitlistFilters, parseWaitlistParams } from "./list-params";
import { WaitlistCard } from "./WaitlistCard";
import { WaitlistFilters } from "./WaitlistFilters";

/**
 * T10 Хүлээлгийн үйлчлүүлэгч (хоёр панелийн хуваалцах дэлгэц): идэвхтэй
 * шаардлагатай ч нээлттэй хэлцэлгүй харилцагчид. Хэн жагсаалтад байхыг,
 * эрэмбийг (тохирол олонтой нь эхэнд, дараа нь эртнээс хүлээсэн нь) ба
 * харагдах эрхийг DB (crm2_waitlist) шийднэ — энд зөвхөн харуулж, үйлдэл өгнө.
 * Хэлцэл эхлүүлмэгц тэр хүн жагсаалтаас гарна; хэлцэл цуцлагдвал буцаж орно.
 */

/** DB-ийн анхдагч хязгаар (crm2_waitlist p_limit). */
const LIST_LIMIT = 200;

/** Серверийн одоогийн цаг (хүлээсэн хоног, сануулгын бүлэгт; render-ээс тусад нь). */
function requestNow(): number {
  return Date.now();
}

export async function WaitlistScreen({ panel, searchParams }: { panel: Crm2Panel; searchParams: FilterParams }) {
  const paths = crm2Paths(panel);
  const [ctx, settings] = await Promise.all([getCrm2Context(), getCrm2Settings()]);

  if (!ctx?.isMember) {
    return (
      <PageFrame>
        <Header />
        <NoAccessState className="mt-4" description="CRM-ийн эрхтэй ажилтанд харагдана." />
      </PageFrame>
    );
  }

  const params = parseWaitlistParams(searchParams);
  const rows = await getWaitlist({ onlyMine: params.onlyMine, withMatches: params.withMatches, limit: LIST_LIMIT });
  const lookup = {
    categoryLabels: settings["property.category_labels"],
    types: settings["property.types"],
    features: settings["property.features"],
  };
  const withMatches = rows.filter((r) => r.exactCount + r.nearCount > 0).length;
  const filtered = hasWaitlistFilters(params);
  const now = requestNow();

  return (
    <PageFrame>
      <Header />

      <FilterProvider params={searchParams}>
        <div className="mt-4">
          <WaitlistFilters />
        </div>

        {rows.length === 0 ? (
          filtered ? (
            <Crm2Empty className="mt-4" title="" filtered onClear={{ label: "Шүүлтүүр цэвэрлэх", href: paths.waitlist() }} />
          ) : (
            <Crm2Empty
              className="mt-4"
              icon={Clock3}
              title="Хүлээж байгаа үйлчлүүлэгч алга"
              description="Харилцагчийн карт дээр шаардлагыг нь бүртгэхэд — нээлттэй хэлцэлгүй бол — тэр хүн энд өөрөө харагдана."
              action={{ label: "Харилцагчид", href: paths.contacts() }}
            />
          )
        ) : (
          <>
            <p className="mt-4 text-sm text-muted" aria-live="polite">
              <span className="font-semibold tabular-nums text-ink">{rows.length}</span> хүн хүлээж байна
              {/* «Тохирохгүй» шүүлтэд тохирлын тоо үргэлж 0 — дэмий мөр харуулахгүй. */}
              {params.withMatches === false ? null : (
                <span>
                  <span className="tabular-nums"> · {withMatches}</span> хүнд тохирох хөрөнгө байна
                </span>
              )}
            </p>
            {rows.length >= LIST_LIMIT ? (
              <p className="mt-1 text-xs text-subtle">
                Тохирол олонтой, эртнээс хүлээсэн {LIST_LIMIT} хүн харагдаж байна. Шүүлтүүрээр нарийсгана уу.
              </p>
            ) : null}
            <ul className="mt-2 grid grid-cols-1 gap-3">
              {rows.map((row) => (
                <WaitlistCard key={row.requirementId} row={row} panel={panel} lookup={lookup} now={now} />
              ))}
            </ul>
          </>
        )}
      </FilterProvider>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

function Header() {
  return (
    <div className="min-w-0">
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Хүлээлгийн үйлчлүүлэгч</h1>
      <p className="text-sm text-muted">
        Шаардлагаа хэлсэн ч хэлцэл яваагүй харилцагчид — тэдэнд тохирох Staff хөрөнгийг хамт харуулна. Хэлцэл эхлүүлэхэд
        жагсаалтаас гарна.
      </p>
    </div>
  );
}

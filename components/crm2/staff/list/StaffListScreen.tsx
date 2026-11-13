import Link from "next/link";
import { Building2, Plus, Sparkles, X } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Crm2Empty, FilterPager, FilterProvider, LoadErrorState, NoAccessState, type FilterParams } from "@/components/crm2/ui";
import { parseOfferParams } from "@/components/crm2/staff/card/logic";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { categoryLabel, PROPERTY_CATEGORIES, PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getOfferContact } from "@/lib/crm2/queries/card-tabs";
import { getStaffNameMap, listProjects } from "@/lib/crm2/queries/lookups";
import { listProperties } from "@/lib/crm2/queries/properties";

import {
  advancedFilterCount,
  hasStaffFilters,
  parseStaffListParams,
  statusOptionsForView,
  toPropertyListFilters,
  type StaffView,
} from "./list-params";
import { StaffListFilters } from "./StaffListFilters";
import { StaffPropertyCard } from "./StaffPropertyCard";

const EMPTY_TEXT: Record<StaffView, { title: string; description: string }> = {
  active: {
    title: "Одоогийн Staff хөрөнгө алга",
    description: "Шинэ хөрөнгө бүртгээд зуучлалын гэрээг нь батлуулахад энд харагдана.",
  },
  archive: {
    title: "Архивт хөрөнгө алга",
    description: "Гэрээ нь дууссан эсвэл архивласан хөрөнгө түүхтэйгээ энд үлдэнэ.",
  },
  draft: {
    title: "Ноорог алга",
    description: "Зуучлалын гэрээ нь батлагдаагүй, таны харах эрхтэй ноорог энд харагдана.",
  },
};

/**
 * S01 — Staff хөрөнгийн жагсаалт (хоёр панелийн хуваалцах дэлгэц). Шинэ нь эхэнд;
 * харагдац, 4 ангилал, төлөв, төсөл, дүүрэг/байршил, түлхүүр үгийн шүүлт URL-д.
 * Өгөгдөл хэрэглэгчийн эрхээр (RLS) — ноорог зөвхөн эрхтэнд харагдана.
 */
export async function StaffListScreen({ panel, searchParams }: { panel: Crm2Panel; searchParams: FilterParams }) {
  const p = crm2Paths(panel);
  const [ctx, settings] = await Promise.all([getCrm2Context(), getCrm2Settings()]);

  if (!ctx?.isMember) {
    return (
      <PageFrame>
        <Header />
        <NoAccessState
          className="mt-4"
          title="CRM-ийн эрх тохируулаагүй байна"
          description="Таны CRM-ийн бүртгэл энэ оффист идэвхгүй байна. Оффисын админд хандана уу."
        />
      </PageFrame>
    );
  }

  const params = parseStaffListParams(searchParams);
  // «Санал болгох» горим (цуцлагдсан хэлцлийн дараа эсвэл харилцагчийн картаас): зөвхөн шинэ
  // хэлцэл нээж болох төлөвтэй хөрөнгө (deal.open_property_statuses) — бусад нь дуудлагаар хэлцэл нээхгүй.
  const offer = parseOfferParams(searchParams);
  const openStatuses = settings["deal.open_property_statuses"];
  const listFilters = offer.contactId
    ? { ...toPropertyListFilters(params), status: null, statusIn: openStatuses }
    : toPropertyListFilters(params);
  const [result, projects, names, offerContact] = await Promise.all([
    listProperties(listFilters),
    params.project ? listProjects() : Promise.resolve([]),
    getStaffNameMap(),
    offer.contactId ? getOfferContact(offer.contactId) : Promise.resolve(null),
  ]);

  const categoryLabels = settings["property.category_labels"];
  const categories = PROPERTY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, categoryLabels) }));
  const projectLabel = params.project ? (projects.find((x) => x.id === params.project)?.name ?? "Сонгосон төсөл") : null;
  const filtered = hasStaffFilters(params);
  const empty = EMPTY_TEXT[params.view];
  // Санал болгох горим: картын холбоос, цэвэрлэх холбоонд дамжуулна.
  const offerQuery = offer.contactId ? { offer_for: offer.contactId, origin: offer.originDealId } : undefined;
  const offerWho = offerContact ? `${offerContact.code} ${offerContact.full_name}` : "Харилцагч";
  const openStatusText = openStatuses.map((s) => PROPERTY_STATUS_LABEL[s] ?? s).join(", ") || PROPERTY_STATUS_LABEL.active;
  const viewQuery = params.view !== "active" ? { view: params.view } : undefined;
  const clearHref = p.staff({ ...viewQuery, ...offerQuery });
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return (
    <PageFrame>
      <Header action={ctx.canWork ? { href: p.staffNew() } : null} />

      {offerQuery ? (
        <div className="mt-4 flex items-start justify-between gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
          <p className="flex min-w-0 items-start gap-1.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span>
              {offer.originDealId ? (
                <>
                  Цуцлагдсан хэлцлийн дараа <span className="font-semibold">{offerWho}</span>-д санал болгох өөр хөрөнгөө сонгоно уу
                </>
              ) : (
                <>
                  <span className="font-semibold">{offerWho}</span>-д зориулж хөрөнгө сонгоно уу
                </>
              )}{" "}
              — картаас нь дуудлага бүртгэнэ. Зөвхөн шинэ хэлцэл нээж болох ({openStatusText}) хөрөнгө харагдана.
            </span>
          </p>
          <Link
            href={p.staff(viewQuery)}
            aria-label="Санал болгохыг болих"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-100 sm:size-9"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      <FilterProvider params={searchParams}>
        <div className="mt-4">
          <StaffListFilters
            view={params.view}
            categories={categories}
            statuses={statusOptionsForView(params.view)}
            districts={settings["property.districts"]}
            projectLabel={projectLabel}
            advancedCount={advancedFilterCount(params)}
            offerMode={!!offerQuery}
          />
        </div>

        {result.error ? (
          <LoadErrorState className="mt-4" retryHref={currentHref(p.staff(), searchParams)} />
        ) : result.items.length === 0 && result.total > 0 ? (
          <Crm2Empty
            className="mt-4"
            title="Энэ хуудсанд хөрөнгө алга"
            description="Хуудасны дугаар жагсаалтаас хэтэрсэн байна."
            action={{ label: "Эхний хуудас руу", href: firstPageHref(p.staff(), searchParams) }}
          />
        ) : result.items.length === 0 ? (
          filtered ? (
            <Crm2Empty className="mt-4" title="" filtered onClear={{ label: "Шүүлтүүр цэвэрлэх", href: clearHref }} />
          ) : offerQuery ? (
            <Crm2Empty
              className="mt-4"
              icon={Building2}
              title="Санал болгох хөрөнгө алга"
              description={`Шинэ хэлцэл нээж болох (${openStatusText}) Staff хөрөнгө алга байна.`}
            />
          ) : (
            <Crm2Empty
              className="mt-4"
              icon={Building2}
              title={empty.title}
              description={empty.description}
              action={ctx.canWork && params.view === "active" ? { label: "Шинэ хөрөнгө нэмэх", href: p.staffNew() } : undefined}
            />
          )
        ) : (
          <>
            <p className="mt-4 text-sm text-muted" aria-live="polite">
              <span className="font-semibold tabular-nums text-ink">{result.total}</span> хөрөнгө
              {result.pageCount > 1 ? (
                <span className="tabular-nums">
                  {" "}
                  · {from}–{to}
                </span>
              ) : null}
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((item) => (
                <li key={item.id} className="min-w-0">
                  <StaffPropertyCard
                    item={item}
                    href={p.property(item.id, undefined, offerQuery)}
                    categoryLabels={categoryLabels}
                    typeLabels={settings["property.types"]}
                    names={names}
                  />
                </li>
              ))}
            </ul>
            <FilterPager page={result.page} pageCount={result.pageCount} className="mt-2" />
          </>
        )}
      </FilterProvider>
    </PageFrame>
  );
}

/** Одоогийн холбоос (бүх параметртэй) — «Дахин оролдох». */
function currentHref(base: string, sp: FilterParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Одоогийн шүүлтүүртэй, хуудасгүй холбоос. */
function firstPageHref(base: string, sp: FilterParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

function Header({ action }: { action?: { href: string } | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Staff</h1>
        <p className="text-sm text-muted">Компанитай зуучлалын гэрээтэй хөрөнгийн сан</p>
      </div>
      {action ? (
        <ButtonLink href={action.href} size="md" className="shrink-0">
          <Plus className="size-4" aria-hidden />
          Шинэ хөрөнгө нэмэх
        </ButtonLink>
      ) : null}
    </div>
  );
}

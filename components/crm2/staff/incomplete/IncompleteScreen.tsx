import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Crm2Empty, LoadErrorState, NoAccessState } from "@/components/crm2/ui";
import { ImportListingsButton } from "@/components/crm2/staff/import/ImportListingsButton";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { listOpenDuplicateFlags } from "@/lib/crm2/queries/duplicates";
import { listMyIncomplete } from "@/lib/crm2/queries/incomplete";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import { getStaffEntryMetrics } from "@/lib/crm2/queries/metrics";
import { fileLimits } from "@/lib/crm2/settings";
import { cn } from "@/lib/utils";

import { CompletionTable } from "./CompletionTable";
import { DeviceSections } from "./DeviceSections";
import { DuplicateFlagsQueue } from "./DuplicateFlagsQueue";
import { IncompleteList } from "./IncompleteList";
import { MetricsPanel, TeamFillPanel } from "./ManagerPanels";
import { SCOPE_LABEL, averagePercent, parseScope, scopeOptions } from "./incomplete-model";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * «Миний дутуу хөрөнгө» (P10) — хоёр панелийн хуваалцах дэлгэц.
 * Утсанд (375px-ээс): дутуу хөрөнгийн жагсаалт (%, дараагийн алхам, эзэн хүлээгдэж буй), «Илгээгдсэн —
 * анхаарах», хуулагдаагүй файл. Ширээнд (≥1024px): гүйцэтгэлийн хүснэгт (мөр дотор засвар, гэрээний
 * drawer, зураг чирэх), багийн гүйцэтгэл, давхардлын дараалал, менежерийн хэмжүүр.
 * Өгөгдөл хэрэглэгчийн эрхээр (RLS); эзний утас, нэр энэ хуудсанд огт уншигдахгүй.
 */
export async function IncompleteScreen({ panel, searchParams }: { panel: Crm2Panel; searchParams: SearchParams }) {
  const p = crm2Paths(panel);
  const [ctx, settings] = await Promise.all([getCrm2Context(), getCrm2Settings()]);

  if (!ctx?.isMember) {
    return (
      <PageFrame>
        <Title />
        <NoAccessState
          className="mt-4"
          title="CRM-ийн эрх тохируулаагүй байна"
          description="Таны CRM-ийн бүртгэл энэ оффист идэвхгүй байна. Оффисын админд хандана уу."
        />
      </PageFrame>
    );
  }

  const scope = parseScope(searchParams.scope, ctx);
  const options = scopeOptions(ctx);
  const lead = ctx.isTeamLead || ctx.isManager;
  const manager = ctx.isManager || ctx.canManageSettings;
  const pilotIds = settings["staff.quick_add_pilot"] ?? [];

  const [list, staff, flags, metricsAll, metricsPilot] = await Promise.all([
    listMyIncomplete({ scope, limit: 200 }),
    getStaffDirectory(),
    lead ? listOpenDuplicateFlags() : Promise.resolve([]),
    manager ? getStaffEntryMetrics({ days: 14 }) : Promise.resolve(null),
    manager && pilotIds.length ? getStaffEntryMetrics({ days: 14, profileIds: pilotIds }) : Promise.resolve(null),
  ]);

  const showAgent = list.scope !== "me";
  const staleCount = list.counts.staleEmpty;

  return (
    <PageFrame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title />
        {ctx.canWork ? (
          <div className="flex shrink-0 items-center gap-2">
            <ImportListingsButton panel={panel} autoOpenFromQuery />
            <ButtonLink href={p.staffNew()} size="md" aria-label="Хөрөнгө нэмэх">
              <Plus className="size-4" aria-hidden />
              Хөрөнгө
            </ButtonLink>
          </div>
        ) : null}
      </div>

      {options.length > 1 ? (
        <nav aria-label="Харагдац" className="mt-4">
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
            {options.map((o) => (
              <Link
                key={o}
                href={p.staffIncomplete(o === "me" ? undefined : { scope: o })}
                aria-current={list.scope === o ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-16 items-center justify-center rounded-lg px-4 text-sm font-semibold",
                  list.scope === o ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {SCOPE_LABEL[o]}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      {ctx.canWork && ctx.profileId ? (
        <div className="mt-4">
          <DeviceSections panel={panel} profileId={ctx.profileId} />
        </div>
      ) : null}

      {list.error ? (
        <LoadErrorState className="mt-4" retryHref={p.staffIncomplete(list.scope === "me" ? undefined : { scope: list.scope })} />
      ) : list.items.length === 0 ? (
        <Crm2Empty
          className="mt-4"
          icon={CheckCircle2}
          title="Дутуу хөрөнгө алга"
          description="Бүх хөрөнгийн бүртгэл, гэрээ, нийтлэлд бэлэн байдал бүрэн байна."
          action={ctx.canWork ? { label: "Шинэ хөрөнгө нэмэх", href: p.staffNew() } : undefined}
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            <span className="font-semibold tabular-nums text-ink">{list.counts.total}</span> дутуу хөрөнгө
            {list.counts.ownerPending ? <> · {list.counts.ownerPending} эзэн шалгах</> : null}
            {staleCount ? <> · {staleCount} хоосон ноорог (14+ хоног)</> : null}
          </p>

          {/* Утас, таблет */}
          <div className="mt-2 lg:hidden">
            <IncompleteList items={list.items} panel={panel} showAgent={showAgent} />
          </div>

          {/* Ширээ ≥1024px */}
          <div className="mt-2 hidden space-y-4 lg:block">
            {staleCount ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">
                «14+ хоног хоосон ноорог» ({staleCount}) — мөрийн төгсгөлд «Архивлах». Агентад шууд архивлах эрхгүй бол батлах
                хүсэлт илгээгдэнэ.
              </p>
            ) : null}
            {ctx.officeId ? (
              <CompletionTable
                items={list.items}
                panel={panel}
                profileId={ctx.profileId}
                officeId={ctx.officeId}
                sources={settings["contact.sources"]}
                districts={settings["property.districts"]}
                limits={fileLimits(settings)}
                showAgent={showAgent}
                contract={{ officeId: ctx.officeId, settings, staff }}
              />
            ) : null}
          </div>
        </>
      )}

      <div className="mt-6 hidden space-y-4 lg:block">
        <TeamFillPanel stats={list.teamStats} average={showAgent ? averagePercent(list.items) : null} />
        <DuplicateFlagsQueue flags={flags} panel={panel} />
        {metricsAll ? <MetricsPanel all={metricsAll} pilot={metricsPilot} /> : null}
      </div>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

function Title() {
  return (
    <div className="min-w-0">
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Миний дутуу хөрөнгө</h1>
      <p className="text-sm text-muted">Бүртгэл, гэрээ, нийтлэхэд дутуу зүйлтэй хөрөнгө</p>
    </div>
  );
}

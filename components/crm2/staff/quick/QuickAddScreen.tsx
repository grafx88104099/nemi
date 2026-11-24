import { Suspense } from "react";

import { BackLink } from "@/components/ui/back-link";
import { NoAccessState } from "@/components/crm2/ui";
import { aiListingParseAvailable } from "@/lib/crm2/actions/parse";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { CATEGORY_HINT_DEFAULT } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import { fileLimits } from "@/lib/crm2/settings";

import { FullFormLink, QuickAddForm, type QuickSettings } from "./QuickAddForm";

/**
 * Шуурхай бүртгэл (P8) — утсанд зориулсан нэг дэлгэц (хоёр панелийн хуваалцах). Эрхийг серверт шалгана
 * (ажлын эрх, оффис). Тохиргооны зөвхөн хэрэгтэй хэсгийг клиентэд дамжуулна. Хуучин бүрэн форм
 * «Бүрэн форм» холбоосоор ижил ноорогоор үргэлж нээлттэй.
 */
export async function QuickAddScreen({
  panel,
  share,
  draft,
}: {
  panel: Crm2Panel;
  /** ?share=<id> | 'nosw' | 'error' */
  share: string | null;
  /** ?draft=<clientKey> */
  draft: string | null;
}) {
  const p = crm2Paths(panel);
  const [ctx, settings, directory, aiAvailable] = await Promise.all([
    getCrm2Context(),
    getCrm2Settings(),
    getStaffDirectory(),
    aiListingParseAvailable().catch(() => false),
  ]);

  if (!ctx?.isMember || !ctx.canWork || !ctx.officeId) {
    return (
      <Frame>
        <BackLink href={p.staff()} label="Staff руу буцах" />
        <NoAccessState title="Хөрөнгө бүртгэх эрхгүй" description="Staff-д хөрөнгө нэмэх нь ажлын эрхтэй ажилтанд нээлттэй." />
      </Frame>
    );
  }

  // Үүргийн агентыг зөвхөн ажлын эрхтэй (roles.work) ажилтнаас сонгоно.
  const workRoles = new Set(settings["roles.work"]);
  const staff = directory.filter((s) => (s.roles ?? []).some((r) => workRoles.has(r)));
  const myTeam = directory.find((s) => s.profile_id === ctx.profileId)?.team_id ?? ctx.teamId ?? null;

  const quickSettings: QuickSettings = {
    districts: settings["property.districts"],
    types: settings["property.types"],
    categoryLabels: settings["property.category_labels"],
    categoryHints: { ...CATEGORY_HINT_DEFAULT, ...(settings["property.category_hints"] ?? {}) },
    featureKeys: Object.keys(settings["property.features"]),
    sources: settings["contact.sources"],
    limits: fileLimits(settings),
  };

  return (
    <Frame>
      <BackLink href={p.staff()} label="Staff руу буцах" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Шуурхай бүртгэл</h1>
        <Suspense fallback={null}>
          <FullFormLink panel={panel} />
        </Suspense>
      </div>
      <p className="mb-3 text-sm text-muted">
        Эхлээд үндсэн зүйлээ бүртгэ — бусдыг картаас гүйцээнэ. Бүгд утсан дээр автоматаар хадгалагдана.
      </p>
      <QuickAddForm
        panel={panel}
        officeId={ctx.officeId}
        me={ctx.profileId}
        teamIds={myTeam ? [myTeam] : []}
        staff={staff}
        settings={quickSettings}
        aiAvailable={aiAvailable}
        share={share}
        draft={draft}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

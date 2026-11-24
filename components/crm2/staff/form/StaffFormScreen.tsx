import Link from "next/link";
import { CircleCheck, FileSignature } from "lucide-react";

import { BackLink } from "@/components/ui/back-link";
import { CodeChip, NoAccessState, NotFoundState, PropertyStatusBadge } from "@/components/crm2/ui";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { quickAddEnabled } from "@/lib/crm2/feature-flags";
import { fileLimits } from "@/lib/crm2/settings";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import { buildCardChecklist } from "@/lib/crm2/queries/checklist";
import { getProperty } from "@/lib/crm2/queries/properties";
import { ChecklistSummary } from "@/components/crm2/staff/card/ChecklistSheet";

import { MediaManager } from "./MediaManager";
import { QuickAddLink, StaffForm } from "./StaffForm";

/**
 * S02 — Staff хөрөнгө нэмэх (propertyId-гүй) ба засах дэлгэц (хоёр панелийн
 * хуваалцах). Эрхийг серверт шалгана: нэмэх = ажлын эрх (roles.work), засах =
 * crm2_can_edit_property; хувийн талбар = харах + засах эрх.
 */
export async function StaffFormScreen({
  panel,
  propertyId,
  created = false,
  sharedNotice = false,
}: {
  panel: Crm2Panel;
  propertyId?: string;
  /** Шинээр үүсгэсний дараах анхны нээлт (?created=1). */
  created?: boolean;
  /** Хуваалцсан зараар нээгдсэн (шуурхай бүртгэлгүй хэрэглэгч) — гараар бөглөх зөвлөгөө. */
  sharedNotice?: boolean;
}) {
  const p = crm2Paths(panel);
  const [ctx, settings, directory] = await Promise.all([getCrm2Context(), getCrm2Settings(), getStaffDirectory()]);
  // Үүргийн агент, гэрээний хариуцагчийг зөвхөн ажлын эрхтэй (roles.work) ажилтнаас сонгоно.
  const workRoles = new Set(settings["roles.work"]);
  const staff = directory.filter((s) => (s.roles ?? []).some((r) => workRoles.has(r)));

  if (!ctx?.isMember) {
    return (
      <Frame>
        <BackLink href={p.staff()} label="Staff руу буцах" />
        <NoAccessState title="CRM-ийн эрх тохируулаагүй байна" description="Оффисын админд хандана уу." />
      </Frame>
    );
  }

  const canReassign = ctx.isManager || ctx.isTeamLead;
  const responsibleCtx = { profileId: ctx.profileId, isManager: ctx.isManager, isTeamLead: ctx.isTeamLead, teamId: ctx.teamId };

  // ── Шинэ ──────────────────────────────────────────────────────────────────
  if (!propertyId) {
    if (!ctx.canWork || !ctx.officeId) {
      return (
        <Frame>
          <BackLink href={p.staff()} label="Staff руу буцах" />
          <NoAccessState title="Хөрөнгө бүртгэх эрхгүй" description="Staff-д хөрөнгө нэмэх нь ажлын эрхтэй ажилтанд нээлттэй." />
        </Frame>
      );
    }
    return (
      <Frame>
        <BackLink href={p.staff()} label="Staff руу буцах" />
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Шинэ хөрөнгө</h1>
            {/* Шуурхай бүртгэл — ижил ноорогоор (feature flag асаалттай үед). */}
            {quickAddEnabled(settings, ctx.profileId) ? <QuickAddLink panel={panel} /> : null}
          </div>
          <p className="text-sm text-muted">
            Хадгалахад ноорог болж бүртгэгдэнэ; бөглөсөн бүхэн утсан дээр автоматаар хадгалагдана. Зуучлалын гэрээ батлагдмагц
            Staff-ийн идэвхтэй санд орно.
          </p>
          {sharedNotice ? (
            <p role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
              Хуваалцсан зарыг энэ формд автоматаар оруулахгүй. Зарын мэдээллийг гараар бөглөж, зургийг «Галерей» товчоор нэмнэ үү.
            </p>
          ) : null}
        </div>
        <StaffForm
          mode="create"
          panel={panel}
          officeId={ctx.officeId}
          me={ctx.profileId}
          settings={settings}
          staff={staff}
          canReassign={canReassign}
          responsibleCtx={responsibleCtx}
        />
      </Frame>
    );
  }

  // ── Засах ─────────────────────────────────────────────────────────────────
  const detail = await getProperty(propertyId);
  if (!detail) {
    return (
      <Frame>
        <NotFoundState title="Хөрөнгө олдсонгүй" backHref={p.staff()} backLabel="Staff руу буцах" />
      </Frame>
    );
  }
  const prop = detail.property;
  const cardHref = p.property(prop.id);

  if (!detail.can.edit) {
    return (
      <Frame>
        <BackLink href={cardHref} label="Карт руу буцах" />
        <NoAccessState
          title="Засах эрхгүй"
          description="Хөрөнгийг үүрэгт агентууд, тэдний багийн ахлагч эсвэл менежер засна."
        />
      </Frame>
    );
  }

  const { checklist, next } = buildCardChecklist(detail, settings);

  return (
    <Frame>
      <BackLink href={cardHref} label="Карт руу буцах" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Хөрөнгө засах</h1>
        <CodeChip code={prop.code} className="text-sm" />
        <PropertyStatusBadge status={prop.status} />
      </div>

      <div className="space-y-4">
        {created ? (
          <div role="status" className="flex flex-wrap items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">{prop.code} ноорог бүртгэгдлээ.</span> Медиагаа доор нэмж, дутуу зүйлсийг шалгах жагсаалтаас гүйцээнэ.{" "}
              <Link href={cardHref} className="font-semibold text-emerald-800 underline">
                Хөрөнгийн карт
              </Link>
            </p>
          </div>
        ) : null}

        {/* Шалгах жагсаалт (хуучин «идэвхжүүлэх нөхцөл»-ийн оронд) — дарахад картын жагсаалт нээгдэнэ. */}
        <ChecklistSummary checklist={checklist} next={next} href={p.property(prop.id, "info", { sheet: "checklist" })} />

        <StaffForm
          key={prop.id}
          mode="edit"
          panel={panel}
          officeId={prop.office_id}
          me={ctx.profileId}
          settings={settings}
          staff={staff}
          canReassign={canReassign}
          responsibleCtx={responsibleCtx}
          property={prop}
          private={detail.private}
          canEditPrivate={detail.can.viewPrivate}
        />

        <MediaManager
          propertyId={prop.id}
          officeId={prop.office_id}
          items={detail.media}
          limits={fileLimits(settings)}
          imagesRequired={settings["property.activation_required"].includes("images")}
          profileId={ctx.profileId}
        />

        {/* Зуучлалын гэрээ энд засагдахгүй — картын «Гэрээ» доод цонх (урьдчилан бөглөсөн, 2 алхам). */}
        <Link
          href={p.property(prop.id, "info", { sheet: "contract" })}
          className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand-700 hover:border-line-strong sm:px-4"
        >
          <FileSignature className="size-4 shrink-0" aria-hidden />
          Гэрээг картын «Гэрээ» хэсгээс засна
        </Link>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

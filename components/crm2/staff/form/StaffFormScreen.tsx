import Link from "next/link";
import { CircleCheck } from "lucide-react";

import { BackLink } from "@/components/ui/back-link";
import { CodeChip, NoAccessState, NotFoundState, PropertyStatusBadge } from "@/components/crm2/ui";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { fileLimits } from "@/lib/crm2/settings";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import { getProperty } from "@/lib/crm2/queries/properties";
import { brokerageResponsibleAllowed } from "@/components/crm2/deals/types";

import { ActivationPanel } from "./ActivationPanel";
import { BrokerageEditSection } from "./BrokerageEditSection";
import { MediaManager } from "./MediaManager";
import { StaffForm } from "./StaffForm";

/**
 * S02 — Staff хөрөнгө нэмэх (propertyId-гүй) ба засах дэлгэц (хоёр панелийн
 * хуваалцах). Эрхийг серверт шалгана: нэмэх = ажлын эрх (roles.work), засах =
 * crm2_can_edit_property; хувийн талбар = харах + засах эрх.
 */
export async function StaffFormScreen({
  panel,
  propertyId,
  created = false,
}: {
  panel: Crm2Panel;
  propertyId?: string;
  /** Шинээр үүсгэсний дараах анхны нээлт (?created=1). */
  created?: boolean;
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
        <div className="mb-4">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Шинэ хөрөнгө</h1>
          <p className="text-sm text-muted">
            Хадгалахад ноорог болж бүртгэгдэнэ. Зуучлалын гэрээ батлагдмагц Staff-ийн идэвхтэй санд орно.
          </p>
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

  const allowResponsible = brokerageResponsibleAllowed(responsibleCtx, [prop.listing_agent_id, prop.contract_agent_id, prop.photo_agent_id]);
  const responsibleStaff = staff.filter((s) => allowResponsible({ id: s.profile_id, teamId: s.team_id }));

  const owner = detail.private?.owner
    ? {
        id: detail.private.owner.id,
        name: detail.private.owner.full_name,
        code: detail.private.owner.code,
        phone: detail.private.owner.phones[0]?.phone ?? null,
      }
    : null;

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
              <span className="font-semibold">{prop.code} ноорог бүртгэгдлээ.</span> Медиа, гэрээгээ доор нэмж эсвэл засаж болно.{" "}
              <Link href={cardHref} className="font-semibold text-emerald-800 underline">
                Хөрөнгийн карт
              </Link>
            </p>
          </div>
        ) : null}

        <ActivationPanel status={prop.status} activation={detail.activation} />

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
        />

        {detail.can.viewPrivate || detail.brokerage.length ? (
          <BrokerageEditSection
            propertyId={prop.id}
            officeId={prop.office_id}
            contracts={detail.brokerage}
            propertyOwner={owner}
            staff={staff}
            responsibleStaff={responsibleStaff}
            me={ctx.profileId}
            settings={settings}
            agreementHref={p.property(prop.id, "agreement")}
          />
        ) : null}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

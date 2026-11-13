"use client";

import * as React from "react";
import { ArrowRightLeft, Ban, CalendarPlus, ListChecks, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CallDialog, type CallPrefill } from "@/components/crm2/staff/card/call/CallDialog";
import type { Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2DealStage, Crm2PropertyStatus } from "@/lib/crm2/types";

import { CancelDealDialog } from "./CancelDealDialog";
import { ShowingScheduleDialog } from "./ShowingScheduleDialog";
import { StageDialog } from "./StageDialog";
import { TransferDealDialog } from "./TransferDealDialog";
import type { DealUiSettings, StaffOption } from "./types";

/**
 * Хэлцлийн хуудасны үйлдлүүд: давтан дуудлага, үзүүлэлт товлох, шат өөрчлөх,
 * шилжүүлэх (эсвэл өөртөө авах хүсэлт), цуцлах. Харуулах эсэхийг эрхээр.
 */
export function DealToolbar({
  panel,
  propertyId,
  propertyCode,
  propertyStatus,
  deal,
  contact,
  canEdit,
  canWork,
  hasPendingTransfer,
  me,
  staff,
  agentOptions,
  settings,
  hasScheduledShowing,
  hasShownShowing,
  offerHref,
  requirements,
  currentRequirementId,
}: {
  panel: Crm2Panel;
  propertyId: string;
  propertyCode: string;
  propertyStatus: Crm2PropertyStatus;
  deal: { id: string; code: string; stage: Crm2DealStage; agent_id: string; isOpen: boolean };
  /** Харах эрхтэй үед л (давтан дуудлага, үзүүлэлтэд нэр, дугаар). */
  contact: CallPrefill["contact"] | null;
  canEdit: boolean;
  canWork: boolean;
  hasPendingTransfer: boolean;
  me: string | null;
  staff: StaffOption[];
  agentOptions: StaffOption[] | null;
  settings: DealUiSettings;
  hasScheduledShowing: boolean;
  hasShownShowing: boolean;
  offerHref: string | null;
  requirements: { value: string; label: string }[];
  currentRequirementId: string | null;
}) {
  const [open, setOpen] = React.useState<null | "call" | "showing" | "stage" | "transfer" | "take" | "cancel">(null);
  const close = () => setOpen(null);

  if (!deal.isOpen) return null;
  const canTake = !canEdit && canWork && !!me && deal.agent_id !== me && !hasPendingTransfer;
  if (!canEdit && !canTake) return null;
  const meOption = staff.filter((s) => s.id === me);
  const meName = meOption[0]?.name ?? null;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && contact ? (
        <Button type="button" onClick={() => setOpen("call")} className="grow sm:grow-0">
          <Phone className="size-4" aria-hidden /> Дуудлага бүртгэх
        </Button>
      ) : null}
      {canEdit ? (
        <>
          <Button type="button" variant="outline" onClick={() => setOpen("showing")}>
            <CalendarPlus className="size-4" aria-hidden /> Үзүүлэлт товлох
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen("stage")}>
            <ListChecks className="size-4" aria-hidden /> Шат өөрчлөх
          </Button>
          {!hasPendingTransfer ? (
            <Button type="button" variant="ghost" onClick={() => setOpen("transfer")}>
              <ArrowRightLeft className="size-4" aria-hidden /> Шилжүүлэх
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="text-rose-700" onClick={() => setOpen("cancel")}>
            <Ban className="size-4" aria-hidden /> Цуцлах
          </Button>
        </>
      ) : null}
      {canTake && meOption.length ? (
        <Button type="button" variant="outline" onClick={() => setOpen("take")}>
          <ArrowRightLeft className="size-4" aria-hidden /> Надад шилжүүлэх хүсэлт
        </Button>
      ) : null}

      {contact ? (
        <CallDialog
          open={open === "call"}
          onClose={close}
          panel={panel}
          propertyId={propertyId}
          propertyCode={propertyCode}
          propertyStatus={propertyStatus}
          me={me}
          staff={staff}
          agentOptions={agentOptions}
          settings={settings}
          prefill={{ contact, origin: null, deal: { id: deal.id, code: deal.code, stage: deal.stage } }}
          lockContact
        />
      ) : null}
      <ShowingScheduleDialog
        open={open === "showing"}
        onClose={close}
        deals={[
          {
            id: deal.id,
            code: deal.code,
            stage: deal.stage,
            contactName: contact?.full_name ?? "Харилцагч",
            contactPhone: contact?.phones[0]?.phone ?? null,
            agentId: deal.agent_id,
          },
        ]}
        agentOptions={agentOptions}
        me={me}
        meName={meName}
      />
      <StageDialog
        open={open === "stage"}
        onClose={close}
        dealId={deal.id}
        current={deal.stage}
        hasScheduledShowing={hasScheduledShowing}
        hasShownShowing={hasShownShowing}
      />
      <TransferDealDialog
        open={open === "transfer"}
        onClose={close}
        dealId={deal.id}
        currentAgentId={deal.agent_id}
        staff={staff}
        me={me}
      />
      <TransferDealDialog
        open={open === "take"}
        onClose={close}
        dealId={deal.id}
        currentAgentId={deal.agent_id}
        staff={meOption}
        me={me}
      />
      <CancelDealDialog
        open={open === "cancel"}
        onClose={close}
        dealId={deal.id}
        dealCode={deal.code}
        reasons={settings.cancelReasons}
        offerHref={offerHref}
        requirements={requirements}
        currentRequirementId={currentRequirementId}
      />
    </div>
  );
}

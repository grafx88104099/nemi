"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { DEAL_STAGE_LABEL } from "@/lib/crm2/labels";
import type { Crm2DealStage } from "@/lib/crm2/types";

import { ShowingScheduleForm } from "./ShowingScheduleForm";
import { dealTaskAssignee, type StaffOption } from "./types";

export type ScheduleDealOption = {
  id: string;
  code: string;
  stage?: Crm2DealStage | null;
  contactName: string;
  contactPhone?: string | null;
  agentName?: string | null;
  /** Хэлцлийн хариуцагч — анхны гүйцэтгэгч ба дараагийн ажлын хариуцагч. */
  agentId?: string | null;
};

/**
 * S05 цонх. Нэг хэлцэл өгвөл шууд маягт; хэд хэдэн өгвөл (хөрөнгийн картын
 * «Үзүүлэлт» таб) эхлээд хэлцлээ сонгоно.
 */
export function ShowingScheduleDialog({
  open,
  onClose,
  deals,
  agentOptions,
  me,
  meName,
  sourceActivityId,
}: {
  open: boolean;
  onClose: () => void;
  deals: ScheduleDealOption[];
  /** Гүйцэтгэгч сонгогч (менежер/ахлагч); бусдад null — гүйцэтгэгч нь өөрөө. */
  agentOptions: StaffOption[] | null;
  me: string | null;
  meName?: string | null;
  sourceActivityId?: string | null;
}) {
  if (!open) return null;
  return (
    <Inner onClose={onClose} deals={deals} agentOptions={agentOptions} me={me} meName={meName} sourceActivityId={sourceActivityId} />
  );
}

function Inner({
  onClose,
  deals,
  agentOptions,
  me,
  meName,
  sourceActivityId,
}: {
  onClose: () => void;
  deals: ScheduleDealOption[];
  agentOptions: StaffOption[] | null;
  me: string | null;
  meName?: string | null;
  sourceActivityId?: string | null;
}) {
  const router = useRouter();
  const ids = React.useId();
  const [dealId, setDealId] = React.useState(deals.length === 1 ? deals[0].id : "");
  const deal = deals.find((d) => d.id === dealId) ?? null;

  return (
    <Modal open onClose={onClose} title="Үзүүлэх цаг товлох" closeOnBackdrop={false}>
      <div className="space-y-4 p-4">
        {deals.length > 1 ? (
          <Field label="Хэлцэл" htmlFor={`${ids}-deal`} hint="Үзүүлэлт тухайн харилцагчийн хэлцэлд бүртгэгдэнэ.">
            <Select id={`${ids}-deal`} value={dealId} onChange={(e) => setDealId(e.target.value)} required>
              <option value="">Хэлцэл сонгоно уу</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.contactName}
                  {d.stage ? ` · ${DEAL_STAGE_LABEL[d.stage]}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {deals.length === 0 ? (
          <p className="text-sm text-muted">
            Үзүүлэлт товлох нээлттэй хэлцэл алга. Эхлээд «Дуудлага бүртгэх»-ээр харилцагчтай хэлцэл нээнэ үү.
          </p>
        ) : deal ? (
          <ShowingScheduleForm
            key={deal.id}
            dealId={deal.id}
            dealCode={deal.code}
            contactName={deal.contactName}
            contactPhone={deal.contactPhone}
            agentOptions={agentOptions}
            me={me}
            meName={meName}
            sourceActivityId={sourceActivityId}
            defaultAgentId={deal.agentId ?? null}
            taskAssigneeId={deal.agentId ? dealTaskAssignee(deal.agentId, me, agentOptions) : null}
            onCancel={onClose}
            onDone={({ taskError }) => {
              toast.success("Үзүүлэх цаг товлогдлоо", {
                description: "Төлөв: Товлосон. Бодитоор үзүүлсний дараа үр дүнг бүртгэнэ.",
              });
              if (taskError) toast.error(`Дараагийн ажлыг хадгалж чадсангүй: ${taskError}`);
              router.refresh();
              onClose();
            }}
          />
        ) : null}
      </div>
    </Modal>
  );
}

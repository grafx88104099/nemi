"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Pencil, Phone, Repeat, Sparkles, TriangleAlert, X } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import type { DealUiSettings, StaffOption } from "@/components/crm2/deals/types";
import { markPropertyVerified } from "@/lib/crm2/actions/properties";
import { PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2PropertyStatus } from "@/lib/crm2/types";

import { CallDialog, type CallPrefill } from "./call/CallDialog";
import { Note } from "./parts";
import { StatusChangeDialog } from "./StatusChangeDialog";
import { propertyStatusOptions } from "./logic";

/**
 * Хөрөнгийн картын үйлдлүүд (эрхээр): дуудлага бүртгэх (S04), засах, төлөв
 * өөрчлөх (батлагч — шууд, засварлагч — хүсэлт), эзэнтэй тулгасан гэж тэмдэглэх.
 * «Өөр Staff санал болгох» холбоосоор ирсэн бол харилцагчийг урьдчилан бөглөнө.
 */
export function CardToolbar({
  panel,
  propertyId,
  propertyCode,
  status,
  canEdit,
  canApproveStatus,
  canWork,
  me,
  staff,
  agentOptions,
  settings,
  offer,
}: {
  panel: Crm2Panel;
  propertyId: string;
  propertyCode: string;
  status: Crm2PropertyStatus;
  canEdit: boolean;
  canApproveStatus: boolean;
  canWork: boolean;
  me: string | null;
  staff: StaffOption[];
  agentOptions: StaffOption[] | null;
  settings: DealUiSettings;
  offer: CallPrefill | null;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const [callOpen, setCallOpen] = React.useState(false);
  const [callPrefill, setCallPrefill] = React.useState<CallPrefill | null>(null);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [verifyNote, setVerifyNote] = React.useState("");
  const statusOptions = propertyStatusOptions(status);
  // Төлөв нь шинэ хэлцэл нээхгүй (ноорог, архив, зарагдсан г.м.) — дуудлага зөвхөн байгаа нээлттэй хэлцэлд.
  const openForNew = settings.openPropertyStatuses.includes(status);

  function openCall(prefill: CallPrefill | null) {
    setCallPrefill(prefill);
    setCallOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canWork ? (
          <Button type="button" onClick={() => openCall(null)} className="grow sm:grow-0">
            <Phone className="size-4" aria-hidden /> Дуудлага бүртгэх
          </Button>
        ) : null}
        {canEdit ? (
          <ButtonLink href={paths.propertyEdit(propertyId)} variant="outline" size="md">
            <Pencil className="size-4" aria-hidden /> Засах
          </ButtonLink>
        ) : null}
        {(canEdit || canApproveStatus) && statusOptions.length ? (
          <Button type="button" variant="outline" onClick={() => setStatusOpen(true)}>
            <Repeat className="size-4" aria-hidden /> Төлөв өөрчлөх
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setVerifyNote("");
              setVerifyOpen(true);
            }}
          >
            <BadgeCheck className="size-4" aria-hidden /> Эзэнтэй тулгасан
          </Button>
        ) : null}
      </div>
      {canWork && !openForNew ? (
        <Note icon={TriangleAlert} tone="amber">
          Хөрөнгө «{PROPERTY_STATUS_LABEL[status]}» төлөвтэй — шинэ хэлцэл нээгдэхгүй, зөвхөн байгаа нээлттэй хэлцэлд дуудлага нэмнэ.
        </Note>
      ) : null}

      {offer ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Sparkles className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="font-semibold">{offer.contact.full_name}</span>
            <CodeChip code={offer.contact.code} />
            {offer.origin ? (
              <>
                <span>-д энэ хөрөнгийг санал болгож байна</span>
                <span className="text-xs text-brand-800">(цуцлагдсан {offer.origin.code} хэлцлийн дараа)</span>
              </>
            ) : (
              <span>-тэй энэ хөрөнгийн талаар дуудлага бүртгэнэ</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {canWork ? (
              <Button type="button" size="touch" onClick={() => openCall(offer)}>
                <Phone className="size-4" aria-hidden /> Дуудлага бүртгэх
              </Button>
            ) : null}
            <Link
              href={paths.property(propertyId)}
              aria-label="Саналыг хаах"
              className="flex size-11 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-100 sm:size-9"
            >
              <X className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}

      <CallDialog
        open={callOpen}
        onClose={() => setCallOpen(false)}
        panel={panel}
        propertyId={propertyId}
        propertyCode={propertyCode}
        propertyStatus={status}
        me={me}
        staff={staff}
        agentOptions={agentOptions}
        settings={settings}
        prefill={callPrefill}
      />
      <StatusChangeDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        propertyId={propertyId}
        current={status}
        approver={canApproveStatus}
      />
      <ConfirmDialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Эзэнтэй мэдээлэл тулгасан"
        description="Үнэ, боломж, нөхцөлийг эзэнтэй шалгаж баталгаажуулсан огноог өнөөдрөөр тэмдэглэнэ."
        confirmLabel="Тэмдэглэх"
        onConfirm={async () => {
          const res = await markPropertyVerified(propertyId, verifyNote);
          if (!res.ok) return res.error;
          toast.success("Эзэнтэй тулгасан огноо шинэчлэгдлээ");
          router.refresh();
          return null;
        }}
      >
        <Field label="Тэмдэглэл (заавал биш)" htmlFor="crm2-verify-note">
          <textarea
            id="crm2-verify-note"
            value={verifyNote}
            onChange={(e) => setVerifyNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Жишээ: үнэ хэвээр, 12-р сараас боломжтой"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

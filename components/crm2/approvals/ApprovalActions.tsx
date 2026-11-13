"use client";

import * as React from "react";
import { Check, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog, ReasonDialog } from "@/components/crm2/ui";
import { approveBrokerage, rejectBrokerage } from "@/lib/crm2/actions/brokerage";
import { cancelRequest, decideRequest } from "@/lib/crm2/actions/requests";
import { approvedToast, storedCallsNotice } from "@/lib/crm2/approvals-view";
import { missingItemLabel } from "@/lib/crm2/labels";

/**
 * Батлах дэлгэцийн товчнууд: зуучлалын гэрээ батлах/татгалзах, хүсэлт шийдвэрлэх,
 * өөрийн хүсэлтийг цуцлах. Эрхийг сервер (RPC) эцэслэн шалгана.
 */

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Тэмдэглэл (заавал биш)" htmlFor={id} hint={`${value.length}/2000`}>
      <textarea
        id={id}
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={TEXTAREA}
      />
    </Field>
  );
}

/** Илгээсэн зуучлалын гэрээг батлах / татгалзах. */
export function BrokerageDecision({
  contractId,
  number,
  propertyCode,
  updatedAt,
}: {
  contractId: string;
  number: string;
  propertyCode: string | null;
  updatedAt: string;
}) {
  const ids = React.useId();
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const what = [number, propertyCode].filter(Boolean).join(" · ");

  return (
    <>
      <Button
        type="button"
        size="touch"
        onClick={() => {
          setNote("");
          setApproveOpen(true);
        }}
      >
        <Check className="size-4" aria-hidden />
        Батлах
      </Button>
      <Button type="button" variant="outline" size="touch" onClick={() => setRejectOpen(true)}>
        <X className="size-4" aria-hidden />
        Татгалзах
      </Button>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Гэрээ батлах — ${what}`}
        description="Батлагдсан гэрээний агуулгыг дахин засахгүй. Хөрөнгө ноорог бөгөөд бүх нөхцөл бүрдсэн бол автоматаар идэвхжинэ."
        confirmLabel="Батлах"
        onConfirm={async () => {
          const r = await approveBrokerage({ contract_id: contractId, note, expected_updated_at: updatedAt });
          if (!r.ok) return r.error;
          const res = r.data;
          if (res.property_status === "active") toast.success("Гэрээ батлагдлаа. Хөрөнгө идэвхтэй боллоо.");
          else if (res.activate_on_start) toast.success("Гэрээ батлагдлаа. Эхлэх өдөр нь хөрөнгө идэвхжинэ.");
          else if (res.property_missing?.length) {
            toast.info("Гэрээ батлагдлаа. Хөрөнгө идэвхжээгүй — дутуу мэдээлэлтэй.", {
              description: res.property_missing.map(missingItemLabel).join(", "),
              durationMs: 10000,
            });
          } else toast.success("Гэрээ батлагдлаа.");
          return null;
        }}
      >
        <NoteField id={`${ids}-note`} value={note} onChange={setNote} />
      </ConfirmDialog>

      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Гэрээнээс татгалзах — ${what}`}
        description="Гэрээ ноорог руу буцаж, агент засаад дахин илгээнэ."
        label="Татгалзсан шалтгаан"
        confirmLabel="Татгалзах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const r = await rejectBrokerage(contractId, text);
          if (!r.ok) return r.error;
          toast.success("Гэрээнээс татгалзаж, агентад буцаалаа");
          return null;
        }}
      />
    </>
  );
}

/** Агентын хүсэлт (төлөв, шилжүүлэх) батлах / татгалзах. */
export function RequestDecision({ requestId, label, calls }: { requestId: string; label: string; calls?: number }) {
  const ids = React.useId();
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  return (
    <>
      <Button
        type="button"
        size="touch"
        onClick={() => {
          setNote("");
          setApproveOpen(true);
        }}
      >
        <Check className="size-4" aria-hidden />
        Батлах
      </Button>
      <Button type="button" variant="outline" size="touch" onClick={() => setRejectOpen(true)}>
        <X className="size-4" aria-hidden />
        Татгалзах
      </Button>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Хүсэлт батлах — ${label}`}
        description={storedCallsNotice("approve", calls) ?? "Батлахад өөрчлөлт шууд хэрэгжиж, хүсэлт гаргагчид мэдэгдэл очно."}
        confirmLabel="Батлах"
        onConfirm={async () => {
          const r = await decideRequest({ request_id: requestId, approve: true, note });
          if (!r.ok) return r.error;
          approvedToast(r.data.skipped, toast);
          return null;
        }}
      >
        <NoteField id={`${ids}-note`} value={note} onChange={setNote} />
      </ConfirmDialog>

      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Хүсэлтээс татгалзах — ${label}`}
        description={storedCallsNotice("reject", calls) ?? undefined}
        label="Татгалзсан шалтгаан"
        confirmLabel="Татгалзах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const r = await decideRequest({ request_id: requestId, approve: false, note: text });
          if (!r.ok) return r.error;
          toast.success("Хүсэлтээс татгалзлаа");
          return null;
        }}
      />
    </>
  );
}

/** Өөрийн хүлээгдэж буй хүсэлтийг цуцлах. */
export function CancelRequestButton({ requestId, label, calls }: { requestId: string; label: string; calls?: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="touch" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" aria-hidden />
        Хүсэлт цуцлах
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Хүсэлтээ цуцлах уу?"
        description={
          storedCallsNotice("cancel", calls, label) ?? `«${label}» хүсэлтийг буцаан татна. Шаардлагатай бол дараа нь дахин гаргаж болно.`
        }
        confirmLabel="Цуцлах"
        cancelLabel="Үгүй"
        tone="danger"
        onConfirm={async () => {
          const r = await cancelRequest(requestId);
          if (!r.ok) return r.error;
          toast.success("Хүсэлтийг цуцаллаа.");
          return null;
        }}
      />
    </>
  );
}

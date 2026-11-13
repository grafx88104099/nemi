"use client";

import * as React from "react";
import { Archive, ArrowRightLeft, Pencil, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog, ReasonDialog } from "@/components/crm2/ui";
import { transferContact, updateContact } from "@/lib/crm2/actions/contacts";
import type { Crm2RecordStatus } from "@/lib/crm2/types";

import { FormError, Textarea } from "./form-bits";

/**
 * Харилцагчийн картын үйлдлүүд: нэр/тэмдэглэл засах, архивлах/сэргээх, хариуцагч
 * шилжүүлэх (crm2_transfer_contact — батлагч/хоёр агентын ахлагч бол шууд, бусад нь хүсэлт).
 */

export function ContactActions({
  contactId,
  fullName,
  note,
  status,
  canEdit,
  canTransfer,
  transferOptions,
  openDeals,
}: {
  contactId: string;
  fullName: string;
  note: string | null;
  status: Crm2RecordStatus;
  canEdit: boolean;
  canTransfer: boolean;
  /** Шинэ хариуцагчийн сонголт (засах эрхгүй бол зөвхөн «Би»). */
  transferOptions: { value: string; label: string }[];
  openDeals: number;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const archived = status !== "active";

  if (!canEdit && !canTransfer) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Button type="button" variant="outline" size="touch" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" aria-hidden />
          Засах
        </Button>
      ) : null}
      {canTransfer && transferOptions.length > 0 ? (
        <Button type="button" variant="outline" size="touch" onClick={() => setTransferOpen(true)}>
          <ArrowRightLeft className="size-4" aria-hidden />
          Шилжүүлэх
        </Button>
      ) : null}
      {canEdit ? (
        <Button type="button" variant="ghost" size="touch" onClick={() => setArchiveOpen(true)}>
          {archived ? <RotateCcw className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          {archived ? "Сэргээх" : "Архивлах"}
        </Button>
      ) : null}

      <EditContactDialog open={editOpen} onClose={() => setEditOpen(false)} contactId={contactId} fullName={fullName} note={note} />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={archived ? "Харилцагчийг сэргээх үү?" : "Харилцагчийг архивлах уу?"}
        description={
          archived
            ? "Харилцагч идэвхтэй жагсаалтад буцаж орно."
            : "Архивласан харилцагч идэвхтэй жагсаалтад харагдахгүй. Хэлцэл, түүх нь хадгалагдана; дараа нь сэргээж болно."
        }
        confirmLabel={archived ? "Сэргээх" : "Архивлах"}
        onConfirm={async () => {
          const r = await updateContact({ contact_id: contactId, status: archived ? "active" : "archived" });
          if (!r.ok) return r.error;
          toast.success(archived ? "Харилцагчийг сэргээлээ" : "Харилцагчийг архивлалаа");
          return null;
        }}
      />

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        contactId={contactId}
        options={transferOptions}
        openDeals={openDeals}
      />
    </div>
  );
}

function EditContactDialog({
  open,
  onClose,
  contactId,
  fullName,
  note,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  fullName: string;
  note: string | null;
}) {
  const ids = React.useId();
  const [name, setName] = React.useState(fullName);
  const [text, setText] = React.useState(note ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(fullName);
      setText(note ?? "");
      setError(null);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Нэр оруулна уу.");
    startTransition(async () => {
      const r = await updateContact({ contact_id: contactId, full_name: name, note: text });
      if (!r.ok) return setError(r.error);
      toast.success("Хадгаллаа");
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title="Харилцагч засах"
      closeOnBackdrop={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" form={`${ids}-form`} disabled={pending}>
            {pending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      }
    >
      <form id={`${ids}-form`} onSubmit={save} className="space-y-3 p-4">
        <Field label="Нэр" htmlFor={`${ids}-name`}>
          <Input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required />
        </Field>
        <Field label="Тэмдэглэл" htmlFor={`${ids}-note`}>
          <Textarea id={`${ids}-note`} rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

function TransferDialog({
  open,
  onClose,
  contactId,
  options,
  openDeals,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  options: { value: string; label: string }[];
  openDeals: number;
}) {
  const ids = React.useId();
  const [to, setTo] = React.useState("");
  const [withDeals, setWithDeals] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTo(options.length === 1 ? options[0].value : "");
      setWithDeals(false);
    }
  }

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Харилцагч шилжүүлэх"
      description="Таны эрхээр шууд шилжинэ, эсвэл батлагчид хүсэлт очно. Нээлттэй ажил шинэ хариуцагч руу дагаж шилжинэ."
      label="Шилжүүлэх шалтгаан"
      confirmLabel="Шилжүүлэх"
      onSubmit={async ({ text }) => {
        if (!to) return "Шинэ хариуцагчийг сонгоно уу.";
        const r = await transferContact({ contact_id: contactId, to_agent_id: to, reason: text, with_deals: withDeals });
        if (!r.ok) return r.error;
        if (r.data === "pending") toast.info("Шилжүүлэх хүсэлт илгээлээ — батлагч шийдвэрлэнэ.");
        else toast.success("Харилцагч шилжлээ");
        return null;
      }}
    >
      <AgentSelect id={`${ids}-to`} value={to} onChange={setTo} options={options} />
      {openDeals > 0 ? (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={withDeals}
            onChange={(e) => setWithDeals(e.target.checked)}
            className="mt-0.5 size-4 rounded border-line"
          />
          <span>
            Нээлттэй {openDeals} хэлцлийг хамт шилжүүлэх
            <span className="block text-xs text-muted">Сонгохгүй бол хэлцлүүд одоогийн агентууд дээрээ үлдэнэ.</span>
          </span>
        </label>
      ) : null}
    </ReasonDialog>
  );
}

function AgentSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label="Шинэ хариуцагч" htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.length > 1 ? <option value="">Сонгоно уу</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

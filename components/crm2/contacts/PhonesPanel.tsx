"use client";

import * as React from "react";
import { Pencil, Phone, Plus, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui";
import { addContactPhone, deleteContactPhone, setPrimaryPhone, updateContactPhone } from "@/lib/crm2/actions/contacts";
import { formatPhone, isValidPhone, telHref } from "@/lib/crm2/phone";

import { FormError, PhoneLabelList } from "./form-bits";

/**
 * Харилцагчийн дугаарууд: залгах холбоос, үндсэн дугаар, нэмэх/засах/устгах.
 * Дугаар заавал бол сүүлийн дугаарыг устгахгүй (DB ч хориглоно). Ижил дугаартай
 * өөр харилцагчтай автоматаар нэгтгэхгүй.
 */

export type PhoneItem = { id: string; phone: string; label: string | null; is_primary: boolean };

export function PhonesPanel({
  contactId,
  phones,
  canEdit,
  requirePhone,
}: {
  contactId: string;
  phones: PhoneItem[];
  canEdit: boolean;
  requirePhone: boolean;
}) {
  const ids = React.useId();
  const [phone, setPhone] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [makePrimary, setMakePrimary] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<PhoneItem | null>(null);
  const [deleting, setDeleting] = React.useState<PhoneItem | null>(null);
  const [pending, startTransition] = React.useTransition();
  const lastLocked = requirePhone && phones.length <= 1;

  function add(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!isValidPhone(phone)) return setAddError("Утасны дугаар буруу байна.");
    startTransition(async () => {
      const r = await addContactPhone({ contact_id: contactId, phone, label, is_primary: makePrimary || phones.length === 0 });
      if (!r.ok) return setAddError(r.error);
      toast.success("Дугаар нэмэгдлээ");
      setPhone("");
      setLabel("");
      setMakePrimary(false);
      setAdding(false);
    });
  }

  function primary(p: PhoneItem) {
    startTransition(async () => {
      const r = await setPrimaryPhone(contactId, p.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(`${formatPhone(p.phone)} үндсэн дугаар боллоо`);
    });
  }

  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Phone className="size-4 text-brand-600" aria-hidden />
            Дугаарууд
          </h2>
          {canEdit && !adding ? (
            <Button type="button" variant="ghost" size="touch" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              Нэмэх
            </Button>
          ) : null}
        </div>

        {phones.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Дугаар бүртгээгүй.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {phones.map((p) => {
              const tel = telHref(p.phone);
              return (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tel ? (
                        <a href={tel} className="font-semibold tabular-nums text-ink hover:text-brand-700 hover:underline">
                          {formatPhone(p.phone)}
                        </a>
                      ) : (
                        <span className="font-semibold tabular-nums text-ink">{p.phone}</span>
                      )}
                      {p.is_primary ? <Badge tone="brand">Үндсэн</Badge> : null}
                    </div>
                    {p.label ? <p className="truncate text-xs text-muted">{p.label}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center">
                      {!p.is_primary ? (
                        <button
                          type="button"
                          onClick={() => primary(p)}
                          disabled={pending}
                          aria-label={`${formatPhone(p.phone)} үндсэн болгох`}
                          title="Үндсэн болгох"
                          className="inline-flex size-11 items-center justify-center rounded-lg text-muted sm:size-9 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                        >
                          <Star className="size-4" aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        disabled={pending}
                        aria-label={`${formatPhone(p.phone)} засах`}
                        title="Засах"
                        className="inline-flex size-11 items-center justify-center rounded-lg text-muted sm:size-9 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(p)}
                        disabled={pending || lastLocked}
                        aria-label={`${formatPhone(p.phone)} устгах`}
                        title={lastLocked ? "Сүүлийн дугаарыг устгахгүй — эхлээд шинэ дугаар нэмнэ үү" : "Устгах"}
                        className="inline-flex size-11 items-center justify-center rounded-lg text-muted sm:size-9 hover:bg-surface-2 hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && lastLocked && phones.length === 1 ? (
          <p className="mt-1 text-xs text-muted">Дугаар заавал тул сүүлийн дугаарыг устгахгүй — солих бол эхлээд шинийг нэмнэ.</p>
        ) : null}

        {canEdit && adding ? (
          <form onSubmit={add} className="mt-3 space-y-2 rounded-xl border border-dashed border-line p-3">
            <PhoneLabelList id={`${ids}-labels`} />
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9911 2233"
              aria-label="Шинэ дугаар"
              maxLength={40}
              autoFocus
            />
            <Input
              value={label}
              list={`${ids}-labels`}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Шошго (заавал биш)"
              aria-label="Шошго"
              maxLength={40}
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={makePrimary}
                onChange={(e) => setMakePrimary(e.target.checked)}
                className="size-4 rounded border-line"
              />
              Үндсэн дугаар болгох
            </label>
            <FormError message={addError} />
            <div className="flex gap-2">
              <Button type="submit" size="touch" disabled={pending || !phone.trim()}>
                {pending ? "Хадгалж байна…" : "Нэмэх"}
              </Button>
              <Button
                type="button"
                size="touch"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
                disabled={pending}
              >
                Болих
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>

      <EditPhoneDialog item={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Дугаар устгах уу?"
        description={deleting ? `${formatPhone(deleting.phone)} дугаарыг энэ харилцагчаас хасна. Өөрчлөлт түүхэнд хадгалагдана.` : ""}
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await deleteContactPhone(deleting.id);
          if (!r.ok) return r.error;
          toast.success("Дугаар устгагдлаа");
          return null;
        }}
      />
    </Card>
  );
}

function EditPhoneDialog({ item, onClose }: { item: PhoneItem | null; onClose: () => void }) {
  const ids = React.useId();
  const [phone, setPhone] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [prev, setPrev] = React.useState<PhoneItem | null>(null);
  if (item !== prev) {
    setPrev(item);
    if (item) {
      setPhone(item.phone);
      setLabel(item.label ?? "");
      setError(null);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!isValidPhone(phone)) return setError("Утасны дугаар буруу байна.");
    startTransition(async () => {
      const r = await updateContactPhone({ phone_id: item.id, phone, label });
      if (!r.ok) return setError(r.error);
      toast.success("Дугаар шинэчлэгдлээ");
      onClose();
    });
  }

  return (
    <Modal
      open={!!item}
      onClose={() => !pending && onClose()}
      title="Дугаар засах"
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
        <PhoneLabelList id={`${ids}-labels`} />
        <Field label="Дугаар" htmlFor={`${ids}-phone`}>
          <Input
            id={`${ids}-phone`}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
        </Field>
        <Field label="Шошго (заавал биш)" htmlFor={`${ids}-label`}>
          <Input id={`${ids}-label`} value={label} list={`${ids}-labels`} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        </Field>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

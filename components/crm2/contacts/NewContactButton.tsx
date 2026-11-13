"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { MaskedName } from "@/components/crm2/ui";
import { createContact, findContactsByPhone } from "@/lib/crm2/actions/contacts";
import { CONTACT_MAX_PHONES, SEPARATE_PERSON_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone, isFullPhone, normalizePhone } from "@/lib/crm2/phone";
import type { Crm2ContactDuplicate } from "@/lib/crm2/types";

import { FormError, PhoneLabelList, Textarea } from "./form-bits";

/**
 * «Шинэ харилцагч» (crm2_create_contact — цорын ганц үүсгэх зам). Ижил дугаартай
 * харилцагч байвал үүсгэхгүй: далд нэртэй жагсаалт харуулж, «өөр хүн» гэдгийг
 * хэрэглэгч тодорхой баталсны дараа л allow_duplicate-аар дахин илгээнэ.
 */

type PhoneDraft = { phone: string; label: string };
type PhoneHint = { phone: string; matches: { code: string; name: string; canOpen: boolean; contactId: string; responsible: string }[] };

export function NewContactButton({
  panel,
  meId,
  agentOptions,
  requirePhone,
  className,
}: {
  panel: Crm2Panel;
  meId: string;
  /** Өөр агентад бүртгэх эрхтэй (менежер, ахлагч) бол сонголт; эс бөгөөс хоосон. */
  agentOptions: { value: string; label: string }[];
  requirePhone: boolean;
  className?: string;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const ids = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phones, setPhones] = React.useState<PhoneDraft[]>([{ phone: "", label: "" }]);
  const [note, setNote] = React.useState("");
  const [agentId, setAgentId] = React.useState(meId);
  const [error, setError] = React.useState<string | null>(null);
  const [duplicates, setDuplicates] = React.useState<Crm2ContactDuplicate[] | null>(null);
  const [confirmSeparate, setConfirmSeparate] = React.useState(false);
  const [hints, setHints] = React.useState<Record<number, PhoneHint>>({});
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setName("");
    setPhones([{ phone: "", label: "" }]);
    setNote("");
    setAgentId(meId);
    setError(null);
    setDuplicates(null);
    setConfirmSeparate(false);
    setHints({});
  }

  function changePhones(next: PhoneDraft[]) {
    setPhones(next);
    // Дугаар өөрчлөгдвөл өмнөх давхардлын баталгаа хүчингүй.
    setDuplicates(null);
    setConfirmSeparate(false);
  }

  async function checkPhone(index: number, phone: string) {
    if (!isFullPhone(phone)) {
      setHints((h) => {
        const next = { ...h };
        delete next[index];
        return next;
      });
      return;
    }
    const r = await findContactsByPhone(phone);
    if (!r.ok) return;
    setHints((h) => ({
      ...h,
      [index]: {
        phone,
        matches: r.data.map((m) => ({
          code: m.code,
          name: m.display_name,
          canOpen: m.can_open,
          contactId: m.contact_id,
          responsible: m.responsible_agent_name,
        })),
      },
    }));
  }

  const filled = phones.filter((p) => p.phone.trim());
  const validPhones = filled.filter((p) => normalizePhone(p.phone) !== "");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Нэр оруулна уу.");
    if (filled.length !== validPhones.length) return setError("Утасны дугаар буруу байна. Шалгана уу.");
    if (requirePhone && validPhones.length === 0) return setError("Дор хаяж нэг утасны дугаар оруулна уу.");
    if (duplicates && !confirmSeparate) return setError("Ижил дугаартай харилцагч байна — өөр хүн эсэхийг баталгаажуулна уу.");
    startTransition(async () => {
      const r = await createContact({
        full_name: name,
        phones: validPhones.map((p) => ({ phone: p.phone, label: p.label })),
        note,
        agent_id: agentId && agentId !== meId ? agentId : null,
        allow_duplicate: !!duplicates && confirmSeparate,
      });
      if (!r.ok) return setError(r.error);
      if (!r.data.contact_id) {
        setDuplicates(r.data.duplicates);
        setConfirmSeparate(false);
        return;
      }
      toast.success(`${r.data.code ?? "Харилцагч"} бүртгэгдлээ`);
      setOpen(false);
      reset();
      router.push(paths.contact(r.data.contact_id));
    });
  }

  return (
    <>
      <Button
        type="button"
        size="touch"
        className={className}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" aria-hidden />
        Шинэ харилцагч
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Шинэ харилцагч"
        closeOnBackdrop={!pending}
        footer={
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button type="submit" form={`${ids}-form`} disabled={pending || (!!duplicates && !confirmSeparate)}>
              {pending ? "Түр хүлээнэ үү…" : duplicates ? SEPARATE_PERSON_LABEL : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <form id={`${ids}-form`} onSubmit={submit} className="space-y-4 p-4">
          <Field label="Нэр" htmlFor={`${ids}-name`}>
            <Input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoComplete="off" required />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">
              Утасны дугаар{requirePhone ? "" : " (заавал биш)"}
            </legend>
            <PhoneLabelList id={`${ids}-labels`} />
            {phones.map((p, i) => {
              const hint = hints[i];
              const showHint = hint && hint.phone === p.phone && hint.matches.length > 0;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={p.phone}
                      onChange={(e) => changePhones(phones.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                      onBlur={(e) => void checkPhone(i, e.target.value)}
                      placeholder="9911 2233"
                      aria-label={`${i + 1}-р дугаар`}
                      maxLength={40}
                      className="min-w-0 flex-[3]"
                    />
                    <Input
                      value={p.label}
                      list={`${ids}-labels`}
                      onChange={(e) => changePhones(phones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="Шошго"
                      aria-label={`${i + 1}-р дугаарын шошго`}
                      maxLength={40}
                      className="min-w-0 flex-[2]"
                    />
                    {phones.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Дугаар хасах"
                        onClick={() => changePhones(phones.filter((_, j) => j !== i))}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  {showHint ? (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>
                        {formatPhone(p.phone)} дугаартай харилцагч бүртгэлтэй:{" "}
                        {hint.matches.map((m, k) => (
                          <span key={m.contactId}>
                            {k > 0 ? ", " : ""}
                            {m.code} {m.canOpen ? m.name : <MaskedName name={m.name} visible={false} />} (хариуцагч {m.responsible})
                          </span>
                        ))}
                      </span>
                    </p>
                  ) : null}
                </div>
              );
            })}
            {phones.length < CONTACT_MAX_PHONES ? (
              <Button type="button" variant="ghost" size="touch" onClick={() => changePhones([...phones, { phone: "", label: "" }])}>
                <Plus className="size-4" aria-hidden />
                Дугаар нэмэх
              </Button>
            ) : null}
          </fieldset>

          {agentOptions.length > 0 ? (
            <Field label="Хариуцах агент" htmlFor={`${ids}-agent`}>
              <Select id={`${ids}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`}>
            <Textarea id={`${ids}-note`} rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {duplicates ? (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                <AlertTriangle className="size-4" aria-hidden />
                Ижил дугаартай харилцагч байна
              </p>
              <ul className="space-y-1 text-sm">
                {duplicates.map((d) => (
                  <li key={d.contact_id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-ink">{d.code}</span>
                    {d.can_open ? (
                      <Link href={paths.contact(d.contact_id)} className="font-medium text-brand-700 hover:underline">
                        {d.display_name}
                      </Link>
                    ) : (
                      <MaskedName name={d.display_name} visible={false} />
                    )}
                    <span className="text-muted">· хариуцагч {d.responsible_agent_name}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800">
                Нэг хүн бол шинээр бүртгэхгүй — байгаа картыг ашиглана уу. Систем хоёр картыг автоматаар нэгтгэхгүй.
              </p>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={confirmSeparate}
                  onChange={(e) => setConfirmSeparate(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-line"
                />
                Энэ бол өөр хүн — тусдаа харилцагч болгон бүртгэнэ.
              </label>
            </div>
          ) : null}

          <FormError message={error} />
        </form>
      </Modal>
    </>
  );
}

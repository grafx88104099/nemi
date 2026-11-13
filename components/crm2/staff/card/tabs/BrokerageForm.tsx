"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { StaffOption } from "@/components/crm2/deals/types";
import { createBrokerageDraft, updateBrokerageDraft } from "@/lib/crm2/actions/brokerage";
import { COMMISSION_TYPES, COMMISSION_TYPE_LABEL, CURRENCIES, CURRENCY_LABEL } from "@/lib/crm2/labels";
import type { Crm2CommissionType } from "@/lib/crm2/types";

import { OwnerPicker, type OwnerValue } from "./OwnerPicker";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export type BrokerageFormValues = {
  id: string;
  number: string;
  owner: OwnerValue | null;
  start_date: string | null;
  end_date: string | null;
  terms: string | null;
  commission_type: Crm2CommissionType | null;
  commission_value: number | null;
  commission_currency: string;
  commission_note: string | null;
  responsible_agent_id: string;
  responsible_name: string | null;
};

/**
 * Зуучлалын гэрээний ноорог үүсгэх / засах (зөвхөн ноорог — илгээсний дараа DB түгжинэ).
 * Файлыг гэрээ хадгалсны дараа картын «Файл нэмэх»-ээр хавсаргана.
 */
export function BrokerageForm({
  open,
  onClose,
  propertyId,
  initial,
  defaultOwner,
  staff,
  requireOwner,
  requireFile,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  /** Засах үед; null бол шинэ ноорог. */
  initial: BrokerageFormValues | null;
  defaultOwner: OwnerValue | null;
  staff: StaffOption[];
  requireOwner: boolean;
  requireFile: boolean;
}) {
  if (!open) return null;
  return (
    <Inner
      onClose={onClose}
      propertyId={propertyId}
      initial={initial}
      defaultOwner={defaultOwner}
      staff={staff}
      requireOwner={requireOwner}
      requireFile={requireFile}
    />
  );
}

function Inner({
  onClose,
  propertyId,
  initial,
  defaultOwner,
  staff,
  requireOwner,
  requireFile,
}: {
  onClose: () => void;
  propertyId: string;
  initial: BrokerageFormValues | null;
  defaultOwner: OwnerValue | null;
  staff: StaffOption[];
  requireOwner: boolean;
  requireFile: boolean;
}) {
  const router = useRouter();
  const ids = React.useId();
  const [number, setNumber] = React.useState(initial?.number ?? "");
  const [owner, setOwner] = React.useState<OwnerValue | null>(initial ? initial.owner : defaultOwner);
  const [start, setStart] = React.useState(initial?.start_date ?? "");
  const [end, setEnd] = React.useState(initial?.end_date ?? "");
  const [terms, setTerms] = React.useState(initial?.terms ?? "");
  const [ctype, setCtype] = React.useState<Crm2CommissionType | "">(initial?.commission_type ?? "");
  const [cvalue, setCvalue] = React.useState(initial?.commission_value != null ? String(initial.commission_value) : "");
  const [ccur, setCcur] = React.useState(initial?.commission_currency ?? "MNT");
  const [cnote, setCnote] = React.useState(initial?.commission_note ?? "");
  const [resp, setResp] = React.useState(initial?.responsible_agent_id ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const respOptions =
    initial && initial.responsible_agent_id && !staff.some((s) => s.id === initial.responsible_agent_id)
      ? [{ id: initial.responsible_agent_id, name: initial.responsible_name ?? "Одоогийн хариуцагч", teamId: null }, ...staff]
      : staff;
  const required = ["эхлэх, дуусах огноо", "шимтгэл", ...(requireOwner ? ["эзэн"] : []), ...(requireFile ? ["дор хаяж нэг файл"] : [])];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (start && end && end < start) {
      setError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.");
      return;
    }
    setPending(true);
    setError(null);
    const fields = {
      number,
      owner_contact_id: owner?.id ?? null,
      start_date: start,
      end_date: end,
      terms,
      commission_type: ctype,
      commission_value: cvalue,
      commission_currency: ctype === "fixed" ? (ccur as (typeof CURRENCIES)[number]) : undefined,
      commission_note: cnote,
      responsible_agent_id: resp,
    };
    try {
      const res = initial
        ? await updateBrokerageDraft({ contract_id: initial.id, ...fields })
        : await createBrokerageDraft({ property_id: propertyId, ...fields });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(initial ? "Гэрээ хадгалагдлаа" : "Гэрээний ноорог үүслээ", {
        description: initial ? undefined : "Одоо гэрээний файлаа хавсаргаад батлуулахаар илгээнэ.",
      });
      router.refresh();
      onClose();
    } catch (err) {
      console.error("BrokerageForm:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title={initial ? `Гэрээ засах · ${initial.number}` : "Зуучлалын гэрээ нэмэх"} closeOnBackdrop={false}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          Батлуулахаар илгээхэд заавал: {required.join(", ")}. Илгээсний дараа агуулгыг засахгүй.
        </p>
        <Field label="Гэрээний дугаар" htmlFor={`${ids}-no`} hint={initial ? undefined : "Хоосон бол дугаар автоматаар олгоно."}>
          <Input id={`${ids}-no`} value={number} onChange={(e) => setNumber(e.target.value)} maxLength={60} />
        </Field>
        <Field label={requireOwner ? "Эзэн" : "Эзэн (заавал биш)"} htmlFor={`${ids}-owner`}>
          <OwnerPicker id={`${ids}-owner`} value={owner} onChange={setOwner} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Эхлэх огноо" htmlFor={`${ids}-start`}>
            <Input id={`${ids}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Дуусах огноо" htmlFor={`${ids}-end`}>
            <Input id={`${ids}-end`} type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Шимтгэлийн төрөл" htmlFor={`${ids}-ctype`}>
            <Select id={`${ids}-ctype`} value={ctype} onChange={(e) => setCtype(e.target.value as Crm2CommissionType | "")}>
              <option value="">Сонгоно уу</option>
              {COMMISSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COMMISSION_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={ctype === "percent" ? "Шимтгэл (%)" : "Шимтгэл"} htmlFor={`${ids}-cval`}>
            <Input
              id={`${ids}-cval`}
              inputMode="decimal"
              value={cvalue}
              onChange={(e) => setCvalue(e.target.value)}
              placeholder={ctype === "percent" ? "3" : "1,500,000"}
            />
          </Field>
          {ctype === "fixed" ? (
            <Field label="Шимтгэлийн валют" htmlFor={`${ids}-ccur`}>
              <Select id={`${ids}-ccur`} value={ccur} onChange={(e) => setCcur(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className={ctype === "fixed" ? "" : "sm:col-span-2"}>
            <Field label="Шимтгэлийн тайлбар" htmlFor={`${ids}-cnote`}>
              <Input id={`${ids}-cnote`} value={cnote} onChange={(e) => setCnote(e.target.value)} maxLength={2000} />
            </Field>
          </div>
        </div>
        <Field label="Нөхцөл" htmlFor={`${ids}-terms`}>
          <textarea id={`${ids}-terms`} value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} maxLength={8000} className={TEXTAREA} />
        </Field>
        <Field
          label="Хариуцсан агент"
          htmlFor={`${ids}-resp`}
          hint={initial ? undefined : "Сонгоогүй бол гэрээ хийсэн агент (байхгүй бол листлэгч, эсвэл та)."}
        >
          <Select id={`${ids}-resp`} value={resp} onChange={(e) => setResp(e.target.value)}>
            {initial ? null : <option value="">Автоматаар</option>}
            {respOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Хадгалж байна…" : initial ? "Хадгалах" : "Ноорог үүсгэх"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

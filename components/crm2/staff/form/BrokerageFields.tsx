"use client";

import * as React from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COMMISSION_TYPE_LABEL, COMMISSION_TYPES, CURRENCIES, CURRENCY_LABEL } from "@/lib/crm2/labels";
import { DOC_ACCEPT, fmtFileSize } from "@/lib/crm2/files";
import type { Crm2Currency, Crm2StaffMember } from "@/lib/crm2/types";

import { AgentSelect } from "./AgentSelect";
import { ChoiceChips, FormField, Textarea } from "./fields";
import type { BrokerageFormState, OwnerRef } from "./form-model";
import { FilePickButton } from "./MediaTile";
import { OwnerPicker } from "./OwnerPicker";

/**
 * Зуучлалын гэрээний талбарууд (шинэ хөрөнгө ба ноорог гэрээ засах): дугаар,
 * огноо, шимтгэл, нөхцөл, хариуцсан агент, эзэн. Илгээх/батлах шалгалт DB-д.
 */
export function BrokerageFields({
  idPrefix,
  value,
  onChange,
  owner,
  onOwnerChange,
  ownerNote,
  requireOwner,
  staff,
  responsibleStaff,
  me,
  errors,
  disabled,
}: {
  idPrefix: string;
  value: BrokerageFormState;
  onChange: (next: BrokerageFormState) => void;
  owner: OwnerRef | null;
  onOwnerChange: (owner: OwnerRef | null) => void;
  /** Эзний доорх тайлбар (жишээ: «Хөрөнгийн эзэнтэй ижил»). */
  ownerNote?: React.ReactNode;
  requireOwner: boolean;
  staff: Crm2StaffMember[];
  /** Хариуцагч болгож болох ажилтан (өгөөгүй бол staff). Одоогийн хариуцагч үргэлж жагсаалтад үлдэнэ. */
  responsibleStaff?: Crm2StaffMember[];
  me: string | null;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const set = <K extends keyof BrokerageFormState>(k: K, v: BrokerageFormState[K]) => onChange({ ...value, [k]: v });
  const id = (k: string) => `${idPrefix}-${k}`;
  const percent = value.commission_type === "percent";
  const pickable = responsibleStaff ?? staff;
  const current = value.responsible_agent_id;
  const responsibleOptions =
    current && !pickable.some((s) => s.profile_id === current)
      ? [...staff.filter((s) => s.profile_id === current), ...pickable]
      : pickable;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Гэрээний дугаар" htmlFor={id("number")} hint="Хоосон бол дараагийн дугаарыг автоматаар олгоно." error={errors.number}>
          <Input
            id={id("number")}
            value={value.number}
            maxLength={60}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => set("number", e.target.value)}
          />
        </FormField>
        <FormField
          label="Хариуцсан агент"
          htmlFor={id("responsible")}
          hint="Сонгоогүй бол гэрээ хийсэн агент хариуцна."
          error={errors.responsible_agent_id}
        >
          <AgentSelect
            id={id("responsible")}
            value={value.responsible_agent_id}
            onChange={(v) => set("responsible_agent_id", v)}
            staff={responsibleOptions}
            me={me}
            disabled={disabled}
            emptyLabel="— Гэрээ хийсэн агент —"
          />
        </FormField>
        <FormField label="Эхлэх огноо" htmlFor={id("start")} error={errors.start_date}>
          <Input
            id={id("start")}
            type="date"
            value={value.start_date}
            disabled={disabled}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </FormField>
        <FormField label="Дуусах огноо" htmlFor={id("end")} error={errors.end_date} hint="Дуусахаас өмнө хариуцагчид сануулна.">
          <Input
            id={id("end")}
            type="date"
            value={value.end_date}
            min={value.start_date || undefined}
            disabled={disabled}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </FormField>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium text-ink">Шимтгэл</span>
        <ChoiceChips
          label="Шимтгэлийн төрөл"
          value={value.commission_type}
          options={COMMISSION_TYPES.map((t) => ({ value: t, label: COMMISSION_TYPE_LABEL[t] }))}
          onChange={(v) => set("commission_type", v)}
          disabled={disabled}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={percent ? "Хувь (%)" : "Дүн"} htmlFor={id("commission")} error={errors.commission_value}>
            <Input
              id={id("commission")}
              inputMode="decimal"
              value={value.commission_value}
              disabled={disabled || !value.commission_type}
              placeholder={percent ? "жишээ: 3" : value.commission_type ? "жишээ: 2,000,000" : "Эхлээд төрлөө сонгоно уу"}
              onChange={(e) => set("commission_value", e.target.value)}
            />
          </FormField>
          {value.commission_type === "fixed" ? (
            <FormField label="Валют" htmlFor={id("commission-currency")}>
              <Select
                id={id("commission-currency")}
                value={value.commission_currency}
                disabled={disabled}
                onChange={(e) => set("commission_currency", e.target.value as Crm2Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
        </div>
        <FormField label="Шимтгэлийн тайлбар" htmlFor={id("commission-note")} error={errors.commission_note}>
          <Input
            id={id("commission-note")}
            value={value.commission_note}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => set("commission_note", e.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Гэрээний нөхцөл" htmlFor={id("terms")} error={errors.terms}>
        <Textarea
          id={id("terms")}
          rows={3}
          value={value.terms}
          maxLength={8000}
          disabled={disabled}
          onChange={(e) => set("terms", e.target.value)}
        />
      </FormField>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">
          Гэрээний эзэн
          {requireOwner ? <span className="ml-1 text-xs font-normal text-muted">(батлуулахад заавал)</span> : null}
        </span>
        <OwnerPicker idPrefix={`${idPrefix}-owner`} value={owner} onChange={onOwnerChange} disabled={disabled} />
        {ownerNote ? <p className="text-xs text-muted">{ownerNote}</p> : null}
        {errors.owner_contact_id ? <p className="text-xs text-danger">{errors.owner_contact_id}</p> : null}
      </div>
    </div>
  );
}

export type DocItem = { id: string; name: string; size?: number | null; url?: string | null };

/** Гэрээний файлын жагсаалт + нэмэх товч. */
export function DocList({
  items,
  onAdd,
  onRemove,
  disabled,
  canAdd = true,
  hint,
  busyText,
}: {
  items: DocItem[];
  onAdd: (files: File[]) => void;
  onRemove?: (item: DocItem) => void;
  disabled?: boolean;
  canAdd?: boolean;
  hint?: React.ReactNode;
  busyText?: string | null;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink">Гэрээний файл</span>
      {items.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((f) => (
            <li key={f.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-brand-700 hover:underline">
                    {f.name}
                  </a>
                ) : (
                  <span className="truncate text-ink">{f.name}</span>
                )}
                {f.size ? <span className="shrink-0 text-xs text-muted">{fmtFileSize(f.size)}</span> : null}
              </span>
              {onRemove && !disabled ? (
                <button
                  type="button"
                  aria-label={`${f.name} хасах`}
                  onClick={() => onRemove(f)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-danger sm:size-9"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canAdd ? (
        <FilePickButton accept={DOC_ACCEPT} disabled={disabled || !!busyText} onFiles={onAdd} className="w-full sm:w-auto">
          <Paperclip className="size-4" aria-hidden />
          {busyText ?? "Гэрээний скан, PDF нэмэх"}
        </FilePickButton>
      ) : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

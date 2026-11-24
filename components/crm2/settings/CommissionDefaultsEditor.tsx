"use client";

import * as React from "react";

import { PROPERTY_CATEGORIES, PROPERTY_CATEGORY_LABEL } from "@/lib/crm2/labels";
import { COMMISSION_DEFAULT_KIND_LABEL } from "@/lib/crm2/commission-defaults";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  commissionKindsFor,
  commissionRowError,
  commissionRowPreview,
  commissionRowWarning,
  readCommissionRow,
  writeCommissionRow,
  type CommissionRowKind,
} from "./editor-model";

/**
 * brokerage.default_commission — ангилал бүрт нэг мөр: төрөл (хувь / сарын түрээсийн N дахин /
 * тогтмол ₮) ба утга. «Бөглөхгүй» = тухайн ангилалд урьдчилан бөглөхгүй. Мөр бүрийн алдааг
 * доор нь шууд харуулна; хадгалах эцсийн шалгалт validateSettingValue ба DB.
 */

export type CommissionDefaultsEditorProps = {
  value: unknown;
  onChange: (v: Record<string, string>) => void;
  /** Оффисын ангиллын нэр (property.category_labels). */
  categoryLabels?: Partial<Record<string, string>>;
  disabled?: boolean;
};

const UNIT: Record<Exclude<CommissionRowKind, "">, string> = { percent: "%", rent_x: "дахин", fixed: "₮" };

export function CommissionDefaultsEditor({ value, onChange, categoryLabels, disabled }: CommissionDefaultsEditorProps) {
  const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const baseId = React.useId();

  return (
    <ul className="space-y-3">
      {PROPERTY_CATEGORIES.map((cat) => {
        const row = readCommissionRow(map[cat]);
        const name = categoryLabels?.[cat] || PROPERTY_CATEGORY_LABEL[cat];
        const error = commissionRowError(row);
        const warning = commissionRowWarning(row, cat);
        const preview = commissionRowPreview(row);
        const kindId = `${baseId}-${cat}-kind`;
        const valueId = `${baseId}-${cat}-value`;
        const msgId = `${baseId}-${cat}-msg`;
        return (
          <li key={cat} className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold text-ink">{name}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)]">
              <div>
                <label htmlFor={kindId} className="sr-only">
                  {name}: шимтгэлийн төрөл
                </label>
                <Select
                  id={kindId}
                  value={row.kind}
                  disabled={disabled}
                  onChange={(e) => onChange(writeCommissionRow(map, cat, { kind: e.target.value as CommissionRowKind, text: row.text }))}
                >
                  <option value="">Бөглөхгүй</option>
                  {commissionKindsFor(cat, row.kind).map((k) => (
                    <option key={k} value={k}>
                      {COMMISSION_DEFAULT_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </div>
              {row.kind ? (
                <div className="flex items-center gap-2">
                  <label htmlFor={valueId} className="sr-only">
                    {name}: шимтгэлийн утга
                  </label>
                  <Input
                    id={valueId}
                    inputMode="decimal"
                    enterKeyHint="done"
                    autoComplete="off"
                    value={row.text}
                    disabled={disabled}
                    onChange={(e) => onChange(writeCommissionRow(map, cat, { kind: row.kind, text: e.target.value }))}
                    aria-invalid={!!error}
                    aria-describedby={msgId}
                    placeholder={row.kind === "fixed" ? "500000" : row.kind === "rent_x" ? "1" : "3"}
                    className="text-base sm:text-sm"
                  />
                  <span className="shrink-0 text-sm text-muted">{UNIT[row.kind]}</span>
                </div>
              ) : null}
            </div>
            <div id={msgId} className="mt-1.5 space-y-0.5 text-xs">
              {error ? (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              ) : null}
              {warning ? <p className="text-amber-700">{warning}</p> : null}
              {preview ? <p className="text-muted">{preview}</p> : null}
              {!row.kind ? <p className="text-muted">Гэрээнд шимтгэлийг агент өөрөө бичнэ.</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

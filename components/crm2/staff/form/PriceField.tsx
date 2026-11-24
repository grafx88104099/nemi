"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatPricePreview,
  parsePriceInput,
  perM2FromTotal,
  priceToInput,
  shortAmount,
  totalFromPerM2,
  validateFields,
  type FieldIssue,
  type PriceUnit,
} from "@/lib/crm2/field-validation";
import { parseNumberText } from "@/lib/number-input";
import type { Crm2Currency, Crm2PriceBasis, Crm2PricePeriod, Crm2PropertyCategory } from "@/lib/crm2/types";

/**
 * Үнийн талбар (гар утсанд эхэлж):
 * - дүн (inputMode=decimal) + нэгжийн чип: төгрөгөөр анхдагч нь «сая» → «350» = 350 000 000 ₮;
 * - бүтэн дүн шууд харагдана: «350 000 000 ₮ · м² нь 5.4 сая» (parsePriceInput);
 * - «Нийт» / «м²» чип тус бүр нөгөө талын тооцоолсон дүнг харуулна. Хэмжээ мэдэгдэж
 *   байвал чип дарахад жинхэнэ үнэ хэвээр, суурь нь солигдоно (дүнг хөрвүүлнэ);
 *   хэмжээгүй бол зөвхөн суурийг солино;
 * - «$» чип: «нийтлэхэд саад болно»; хэмжээний (нэгжийн) сануулга field-validation-аас,
 *   фокус алдсаны дараа (эсвэл наасан утга дээр шууд) харагдана;
 * - наасан/санал болгосон баталгаажаагүй утга шар, «Зөв» дарж баталгаажуулна.
 *
 * Эцэгт маягтын төлөвтэй ижил мөр (бүтэн дүн, «350000000») буцаана; уншиж
 * чадахгүй бичвэрийг тэр чигээр нь өгч, маягтын шалгалт «тоо биш» гэж барина.
 */

export type { PriceUnit };

const UNIT_OPTIONS: { value: PriceUnit; label: string }[] = [
  { value: "сая", label: "сая" },
  { value: "тэрбум", label: "тэрбум" },
  { value: "none", label: "бүтэн" },
];

/** Маягтын мөр → тоо (хоосон/буруу бол null). */
function amountOf(value: string): number | null {
  const n = parseNumberText(value);
  return n === null || !Number.isFinite(n) ? null : n;
}

/**
 * Хадгалсан дүнг ямар нэгжээр харуулах вэ: доллар → бүтэн; төгрөг хоосон → «сая»;
 * «сая»-гаар яг буцаж уншигдах бол «сая», эс бөгөөс бүтэн (жишээ 25 000 ₮/м²).
 */
export function priceUnitFor(amount: number | null, currency: Crm2Currency): PriceUnit {
  if (currency !== "MNT") return "none";
  if (amount === null) return "сая";
  if (amount >= 1e6 && parsePriceInput(priceToInput(amount, "сая"), "сая") === amount) return "сая";
  return "none";
}

/** Талбарын бичвэр + нэгж → маягтын мөр. */
export function priceValueFromInput(text: string, unit: PriceUnit): string {
  const t = text.trim();
  if (!t) return "";
  const n = parsePriceInput(t, unit);
  return n === null ? t : String(n);
}

/** Суурь солиход дүнг хөрвүүлнэ (хэмжээ мэдэгдэж байвал). Төгрөгийг бүхэлчилнэ. */
export function convertPriceBasis(
  amount: number | null,
  from: Crm2PriceBasis,
  to: Crm2PriceBasis,
  area: number | null,
  currency: Crm2Currency
): number | null {
  if (amount === null || from === to) return amount;
  const v = to === "per_m2" ? perM2FromTotal(amount, area) : totalFromPerM2(amount, area);
  if (v === null) return null;
  return currency === "MNT" ? Math.round(v) : v;
}

export function PriceField({
  id,
  label = "Үнэ",
  value,
  onChange,
  currency,
  onCurrencyChange,
  basis,
  onBasisChange,
  category,
  period,
  areaM2,
  unconfirmed,
  onConfirm,
  error,
  disabled,
  onBlur,
}: {
  id?: string;
  label?: string;
  /** Бүтэн дүн (маягтын мөр), жишээ нь «350000000». */
  value: string;
  onChange: (value: string) => void;
  currency: Crm2Currency;
  onCurrencyChange: (currency: Crm2Currency) => void;
  basis: Crm2PriceBasis;
  onBasisChange: (basis: Crm2PriceBasis) => void;
  category: Crm2PropertyCategory | "";
  period: Crm2PricePeriod;
  /** Талбайн хэмжээ (маягтын мөр) — нийт ↔ м² тооцоонд. */
  areaM2: string;
  /** Наасан/санал болгосон, баталгаажаагүй утга — шар. */
  unconfirmed?: boolean;
  /** «Зөв» — баталгаажуулах (байхгүй бол товч харагдахгүй). */
  onConfirm?: () => void;
  error?: string | null;
  disabled?: boolean;
  onBlur?: () => void;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const previewId = `${inputId}-preview`;

  const [unit, setUnit] = React.useState<PriceUnit>(() => priceUnitFor(amountOf(value), currency));
  const [text, setText] = React.useState(() => {
    const n = amountOf(value);
    return n === null ? value : priceToInput(n, priceUnitFor(n, currency));
  });
  const [touched, setTouched] = React.useState(false);

  // Гаднаас (наалт, ноорог, суурь хөрвүүлэлт) утга солигдвол бичвэр + нэгжийг шинэчилнэ.
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (priceValueFromInput(text, unit) !== value) {
      const n = amountOf(value);
      const u = priceUnitFor(n, currency);
      setUnit(u);
      setText(n === null ? value : priceToInput(n, u));
    }
  }
  // Доллар руу шилжвэл нэгж бүтэн.
  const [prevCurrency, setPrevCurrency] = React.useState(currency);
  if (prevCurrency !== currency) {
    setPrevCurrency(currency);
    if (currency !== "MNT" && unit !== "none") setUnit("none");
  }

  const effectiveUnit: PriceUnit = currency === "MNT" ? unit : "none";
  const amount = parsePriceInput(text, effectiveUnit);
  const area = amountOf(areaM2);

  function emit(nextText: string, nextUnit: PriceUnit) {
    const v = priceValueFromInput(nextText, currency === "MNT" ? nextUnit : "none");
    if (v !== value) onChange(v);
  }

  function changeText(t: string) {
    setText(t);
    emit(t, unit);
  }

  function changeUnit(u: PriceUnit) {
    setUnit(u);
    emit(text, u);
  }

  function changeCurrency(c: Crm2Currency) {
    if (c === currency) return;
    const u: PriceUnit = c === "MNT" ? (text.trim() ? unit : "сая") : "none";
    setUnit(u);
    onCurrencyChange(c);
    const v = priceValueFromInput(text, u);
    if (v !== value) onChange(v);
  }

  function changeBasis(b: Crm2PriceBasis) {
    if (b === basis) return;
    const converted = convertPriceBasis(amount, basis, b, area, currency);
    onBasisChange(b);
    if (converted !== null && amount !== null) onChange(String(converted));
  }

  const counterpart =
    basis === "total" ? perM2FromTotal(amount, area) : totalFromPerM2(amount, area);
  const money = (n: number) => (currency === "USD" ? `$${shortAmount(n)}` : shortAmount(n));
  const totalLabel = basis === "total" ? (amount !== null ? money(amount) : null) : counterpart !== null ? money(counterpart) : null;
  const perLabel = basis === "per_m2" ? (amount !== null ? money(amount) : null) : counterpart !== null ? money(counterpart) : null;

  const preview = formatPricePreview({ amount, currency, basis, period, area_m2: area });
  const unreadable = !!text.trim() && amount === null;

  const issues: FieldIssue[] = validateFields({
    category: category || null,
    price: amount,
    currency,
    price_period: period,
    price_basis: basis,
    area_m2: area,
  });
  const showLive = touched || !!unconfirmed;
  const magnitude = issues.find((i) => i.field === "price")?.message ?? null;
  const areaNeeded = issues.find((i) => i.field === "area_m2")?.message ?? null;
  const ownError = error || (touched && unreadable ? "Үнийг тоогоор бичнэ үү" : null);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {unconfirmed ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
            шалгана уу
            {onConfirm ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={disabled}
                className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-amber-900 hover:bg-amber-100"
              >
                <Check className="size-4" aria-hidden />
                Зөв
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="flex gap-2">
        <div
          className={cn(
            "flex h-12 min-w-0 flex-1 items-center rounded-xl border bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 sm:h-11",
            ownError ? "border-danger" : unconfirmed ? "border-amber-300 bg-amber-50" : "border-line",
            disabled && "opacity-50"
          )}
        >
          {currency === "USD" ? <span className="pl-3.5 text-base text-muted" aria-hidden>$</span> : null}
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            placeholder={effectiveUnit === "сая" ? "350" : effectiveUnit === "тэрбум" ? "1.2" : "350000000"}
            value={text}
            disabled={disabled}
            aria-invalid={!!ownError || undefined}
            aria-describedby={previewId}
            onChange={(e) => changeText(e.target.value)}
            onBlur={() => {
              setTouched(true);
              onBlur?.();
            }}
            className="h-full min-w-0 flex-1 rounded-xl bg-transparent px-3.5 text-base tabular-nums text-ink placeholder:text-subtle focus:outline-none"
          />
        </div>
        {currency === "MNT" ? (
          <Chips
            label="Нэгж"
            value={unit}
            disabled={disabled}
            options={UNIT_OPTIONS}
            onChange={changeUnit}
            className="shrink-0 flex-nowrap"
          />
        ) : null}
      </div>

      <p id={previewId} className={cn("min-h-4 text-sm", ownError ? "text-danger" : "text-ink")} role={ownError ? "alert" : undefined}>
        {ownError ? ownError : preview ? <span className="font-semibold tabular-nums">{preview}</span> : <span className="text-muted">Жишээ нь 350 сая</span>}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Chips
          label="Үнийн суурь"
          value={basis}
          disabled={disabled}
          onChange={changeBasis}
          options={[
            { value: "total", label: "Нийт", sub: totalLabel },
            { value: "per_m2", label: "м²", sub: perLabel },
          ]}
        />
        <Chips
          label="Валют"
          value={currency}
          disabled={disabled}
          onChange={changeCurrency}
          options={[
            { value: "MNT", label: "₮" },
            { value: "USD", label: "$", sub: "нийтлэхэд саад болно", warn: true },
          ]}
        />
      </div>

      {areaNeeded && basis === "per_m2" ? <p className="text-xs text-amber-800">{areaNeeded}</p> : null}
      {showLive && magnitude && !ownError ? (
        <p role="status" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
          {magnitude}
        </p>
      ) : null}
    </div>
  );
}

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; sub?: string | null; warn?: boolean }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl border px-2.5 py-1 text-sm font-medium leading-tight transition disabled:opacity-50",
              on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink hover:bg-surface-2"
            )}
          >
            <span>{o.label}</span>
            {o.sub ? (
              <span className={cn("text-[11px] font-normal tabular-nums", o.warn ? "text-amber-800" : "text-muted")}>{o.sub}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

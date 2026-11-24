"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { AgentPicker } from "@/components/crm2/staff/form/AgentPicker";
import { FloorField } from "@/components/crm2/staff/form/FloorField";
import { PinField } from "@/components/crm2/staff/form/PinField";
import { PriceField } from "@/components/crm2/staff/form/PriceField";
import { SuggestInput } from "@/components/crm2/staff/form/SuggestInput";
import { loadLocationSuggestions, loadProjectSuggestions } from "@/components/crm2/staff/form/suggest-loaders";
import { ChoiceChips, FormField, SuggestionChips, Textarea, ToggleChips } from "@/components/crm2/staff/form/fields";
import {
  hasRentTerms,
  operatingCostIsSimple,
  pricePeriodMismatch,
  pricePeriodOptions,
  withCategory,
  type PropertyFormState,
} from "@/components/crm2/staff/form/form-model";
import { ubToday } from "@/lib/crm2/datetime";
import {
  categoryLabel,
  CURRENCIES,
  CURRENCY_LABEL,
  PRICE_PERIOD_LABEL,
  PROPERTY_AGENT_ROLE_LABEL,
  PROPERTY_CATEGORIES,
  VIEW_NOTE_LABEL,
} from "@/lib/crm2/labels";
import { settingOptions, type Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2Currency, Crm2PricePeriod, Crm2StaffMember } from "@/lib/crm2/types";

import { sheetFieldId as fid } from "./sheet-model";

/** Цонхны маягтын API (PropertyFieldSheet өгнө). */
export type SheetFormApi = {
  form: PropertyFormState;
  /** Талбар солих — утга өөрчлөгдвөл тухайн түлхүүр баталгаажсанд тооцогдоно. */
  set: <K extends keyof PropertyFormState>(key: K, value: PropertyFormState[K]) => void;
  /** Хэд хэдэн талбар нэг дор (edited — баталгаажсанд тооцох түлхүүрүүд). */
  update: (fn: (s: PropertyFormState) => PropertyFormState, edited: (keyof PropertyFormState)[]) => void;
  err: (key: string) => string | undefined;
  warn: (key: string) => string | undefined;
  auto: (...keys: (keyof PropertyFormState)[]) => boolean;
  confirm: (...keys: (keyof PropertyFormState)[]) => void;
  disabled: boolean;
  settings: Crm2Settings;
};

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2";

// ── Байршил ────────────────────────────────────────────────────────────────

export function LocationFields({ api, recentDistricts }: { api: SheetFormApi; recentDistricts: string[] }) {
  const { form, set, update, err, auto, confirm, disabled, settings } = api;
  const districts = settings["property.districts"];
  const options = form.district && !districts.includes(form.district) ? [...districts, form.district] : districts;
  return (
    <div className={GRID}>
      <FormField
        label="Төсөл, хотхон"
        htmlFor={fid("project_name")}
        error={err("project_name")}
        unconfirmed={auto("project_name")}
        onConfirm={() => confirm("project_name")}
        hint={form.project_name.trim() && !form.project_id ? "Жагсаалтад байхгүй бол шинэ төсөл болж бүртгэгдэнэ." : undefined}
      >
        <SuggestInput
          id={fid("project_name")}
          value={form.project_name}
          maxLength={120}
          disabled={disabled}
          placeholder="Төсөл, хотхоны нэр"
          load={loadProjectSuggestions}
          emptyText={null}
          onValueChange={(v) => update((s) => ({ ...s, project_name: v, project_id: null }), ["project_name"])}
          onPick={(it) => update((s) => ({ ...s, project_name: it.label, project_id: it.key }), ["project_name"])}
        />
      </FormField>
      <FormField
        label="Дүүрэг"
        htmlFor={fid("district")}
        error={err("district")}
        unconfirmed={auto("district")}
        onConfirm={() => confirm("district")}
      >
        <div className="space-y-2">
          <Select id={fid("district")} value={form.district} disabled={disabled} onChange={(e) => set("district", e.target.value)}>
            <option value="">— Сонгоогүй —</option>
            {options.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <SuggestionChips
            label="Сүүлд сонгосон дүүрэг"
            disabled={disabled}
            items={recentDistricts.filter((d) => d !== form.district).map((d) => ({ key: d, label: d, value: d }))}
            onPick={(d) => set("district", d)}
          />
        </div>
      </FormField>
      <FormField
        label="Байршил"
        htmlFor={fid("location_text")}
        error={err("location_text")}
        unconfirmed={auto("location_text")}
        onConfirm={() => confirm("location_text")}
        hint="Хороолол, гудамж, ойролцоох газар."
        className="sm:col-span-2"
      >
        <SuggestInput
          id={fid("location_text")}
          value={form.location_text}
          maxLength={200}
          disabled={disabled}
          invalid={!!err("location_text")}
          placeholder="жишээ: 19-р хороолол, Зайсан"
          load={loadLocationSuggestions}
          emptyText={null}
          onValueChange={(v) => set("location_text", v)}
          onPick={(it) => set("location_text", it.label)}
        />
      </FormField>
      <FormField
        label="Байр, орц, тоот (дотоод)"
        htmlFor={fid("address_detail")}
        error={err("address_detail")}
        hint="Нийтэд хэзээ ч гарахгүй."
        className="sm:col-span-2"
      >
        <Textarea
          id={fid("address_detail")}
          rows={2}
          maxLength={1000}
          value={form.address_detail}
          disabled={disabled}
          placeholder="Байр, орц, давхар, тоот, хаалганы код гэх мэт"
          onChange={(e) => set("address_detail", e.target.value)}
        />
      </FormField>
      <div id={fid("lat")} tabIndex={-1} className="outline-none sm:col-span-2">
        <PinField
          idPrefix="cs"
          lat={form.lat}
          lng={form.lng}
          address={form.pin_address}
          disabled={disabled}
          collapsible
          onPin={(lat, lng) => update((s) => ({ ...s, lat, lng }), ["lat", "lng"])}
          onAddress={(v) => set("pin_address", v)}
        />
        {err("lat") ? <p className="mt-1 text-xs text-danger">{err("lat")}</p> : null}
        {auto("lat") ? (
          <button
            type="button"
            onClick={() => confirm("lat")}
            className="mt-1 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Цэг шалгана уу · Зөв
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Хэмжээ ─────────────────────────────────────────────────────────────────

export function SizeFields({ api }: { api: SheetFormApi }) {
  const { form, set, update, err, auto, confirm, disabled } = api;
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        label="Талбай (м²)"
        htmlFor={fid("area_m2")}
        error={err("area_m2")}
        unconfirmed={auto("area_m2")}
        onConfirm={() => confirm("area_m2")}
        hint="81.47 эсвэл 81,47"
      >
        <NumberInput
          id={fid("area_m2")}
          inputMode="decimal"
          enterKeyHint="next"
          value={form.area_m2}
          disabled={disabled}
          aria-invalid={!!err("area_m2") || undefined}
          onValueChange={(v) => set("area_m2", v)}
        />
      </FormField>
      <FormField label="Өрөө" htmlFor={fid("rooms")} error={err("rooms")} unconfirmed={auto("rooms")} onConfirm={() => confirm("rooms")}>
        <NumberInput
          id={fid("rooms")}
          inputMode="numeric"
          enterKeyHint="next"
          value={form.rooms}
          disabled={disabled}
          aria-invalid={!!err("rooms") || undefined}
          onValueChange={(v) => set("rooms", v)}
        />
      </FormField>
      <div className="col-span-2 space-y-1">
        {auto("floor", "building_floors") ? (
          <button
            type="button"
            onClick={() => confirm("floor", "building_floors")}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Давхар шалгана уу · Зөв
          </button>
        ) : null}
        <FloorField
          id={fid("floor")}
          label="Давхар / барилгын давхар"
          value={{ floor: form.floor, building_floors: form.building_floors }}
          disabled={disabled}
          error={err("floor") ?? err("building_floors")}
          unconfirmed={auto("floor", "building_floors")}
          onChange={(v) => update((s) => ({ ...s, floor: v.floor, building_floors: v.building_floors }), ["floor", "building_floors"])}
        />
      </div>
      <FormField
        label="Ашиглалтад орсон он"
        htmlFor={fid("year_in_use")}
        error={err("year_in_use")}
        unconfirmed={auto("year_in_use")}
        onConfirm={() => confirm("year_in_use")}
      >
        <Input
          id={fid("year_in_use")}
          inputMode="numeric"
          enterKeyHint="next"
          maxLength={4}
          value={form.year_in_use}
          disabled={disabled}
          placeholder="2018"
          aria-invalid={!!err("year_in_use") || undefined}
          onChange={(e) => set("year_in_use", e.target.value.replace(/\D/g, ""))}
        />
      </FormField>
      <FormField
        label="Зогсоол"
        htmlFor={fid("parking_spaces")}
        error={err("parking_spaces")}
        unconfirmed={auto("parking_spaces")}
        onConfirm={() => confirm("parking_spaces")}
        hint="Тоо; байхгүй бол 0."
      >
        <NumberInput
          id={fid("parking_spaces")}
          inputMode="numeric"
          enterKeyHint="done"
          value={form.parking_spaces}
          disabled={disabled}
          onValueChange={(v) => set("parking_spaces", v)}
        />
      </FormField>
    </div>
  );
}

// ── Үнэ ────────────────────────────────────────────────────────────────────

export function PriceFields({ api }: { api: SheetFormApi }) {
  const { form, set, err, warn, auto, confirm, disabled } = api;
  const periodOptions = pricePeriodOptions(form.category, form.price_period);
  const mismatch = pricePeriodMismatch(form.category, form.price_period);
  const simpleCost = operatingCostIsSimple(form);
  return (
    <div className="space-y-4">
      <PriceField
        id={fid("price")}
        label="Үнэ"
        value={form.price}
        onChange={(v) => set("price", v)}
        currency={form.currency}
        onCurrencyChange={(c) => set("currency", c)}
        basis={form.price_basis}
        onBasisChange={(b) => set("price_basis", b)}
        category={form.category}
        period={form.price_period}
        areaM2={form.area_m2}
        unconfirmed={auto("price", "currency", "price_basis")}
        onConfirm={() => confirm("price", "currency", "price_basis", "price_period")}
        error={err("price") ?? err("area_m2")}
        disabled={disabled}
      />
      <FormField
        label="Үнийн хугацаа"
        error={err("price_period")}
        warning={warn("price_period")}
        unconfirmed={auto("price_period")}
        onConfirm={() => confirm("price_period")}
        hint={mismatch ? <span className="text-amber-700">Энэ ангилалд таарахгүй — идэвхжүүлэхэд саад болно.</span> : "Зарах = нийт үнэ; түрээс = сарын үнэ."}
      >
        <div id={fid("price_period")} tabIndex={-1} className="outline-none">
          <ChoiceChips
            label="Үнийн хугацаа"
            value={form.price_period}
            disabled={disabled}
            options={periodOptions.map((p) => ({ value: p, label: PRICE_PERIOD_LABEL[p] }))}
            onChange={(p: Crm2PricePeriod) => set("price_period", p)}
          />
        </div>
      </FormField>
      {hasRentTerms(form.category) ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Урьдчилгаа (сар)"
            htmlFor={fid("rent_advance_months")}
            error={err("rent_advance_months")}
            unconfirmed={auto("rent_advance_months")}
            onConfirm={() => confirm("rent_advance_months")}
          >
            <NumberInput
              id={fid("rent_advance_months")}
              inputMode="numeric"
              enterKeyHint="next"
              value={form.rent_advance_months}
              disabled={disabled}
              onValueChange={(v) => set("rent_advance_months", v)}
            />
          </FormField>
          <FormField
            label="Барьцаа (сар)"
            htmlFor={fid("rent_deposit_months")}
            error={err("rent_deposit_months")}
            unconfirmed={auto("rent_deposit_months")}
            onConfirm={() => confirm("rent_deposit_months")}
            hint="Барьцаагүй бол 0."
          >
            <NumberInput
              id={fid("rent_deposit_months")}
              inputMode="numeric"
              enterKeyHint="next"
              value={form.rent_deposit_months}
              disabled={disabled}
              onValueChange={(v) => set("rent_deposit_months", v)}
            />
          </FormField>
        </div>
      ) : null}
      <FormField
        label={simpleCost ? "Ашиглалтын зардал (₮/сар)" : "Ашиглалтын зардал"}
        htmlFor={fid("operating_cost")}
        error={err("operating_cost")}
      >
        {simpleCost ? (
          <div className="flex h-11 items-center rounded-xl border border-line bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
            <NumberInput
              id={fid("operating_cost")}
              inputMode="decimal"
              enterKeyHint="done"
              value={form.operating_cost}
              disabled={disabled}
              onValueChange={(v) => set("operating_cost", v)}
              className="h-full border-0 focus:ring-0"
            />
            <span className="shrink-0 pr-3.5 text-sm text-muted">₮/сар</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              className="col-span-2"
              id={fid("operating_cost")}
              inputMode="decimal"
              value={form.operating_cost}
              disabled={disabled}
              onValueChange={(v) => set("operating_cost", v)}
            />
            <Select
              aria-label="Зардлын валют"
              value={form.operating_cost_currency}
              disabled={disabled}
              onChange={(e) => set("operating_cost_currency", e.target.value as Crm2Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABEL[c]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Зардлын хугацаа"
              value={form.operating_cost_period}
              disabled={disabled}
              onChange={(e) => set("operating_cost_period", e.target.value as Crm2PricePeriod)}
            >
              {(["month", "day", "total"] as const).map((p) => (
                <option key={p} value={p}>
                  {PRICE_PERIOD_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </FormField>
      <FormField label="Зардлын тайлбар" htmlFor={fid("operating_cost_note")} error={err("operating_cost_note")}>
        <Textarea
          id={fid("operating_cost_note")}
          rows={2}
          maxLength={1000}
          value={form.operating_cost_note}
          disabled={disabled}
          onChange={(e) => set("operating_cost_note", e.target.value)}
        />
      </FormField>
    </div>
  );
}

// ── Агентын үүрэг ──────────────────────────────────────────────────────────

export function RolesFields({
  api,
  staff,
  meId,
  teamIds,
  locked,
  names,
}: {
  api: SheetFormApi;
  staff: Crm2StaffMember[];
  meId: string | null;
  teamIds: string[];
  locked: (role: "listing_agent_id" | "photo_agent_id") => boolean;
  names: Record<"listing_agent_id" | "photo_agent_id", string | null>;
}) {
  const { form, set, err, auto, confirm, disabled } = api;
  return (
    <div className="space-y-5">
      {(["listing_agent_id", "photo_agent_id"] as const).map((role) => {
        const isLocked = locked(role);
        return (
          <FormField
            key={role}
            label={PROPERTY_AGENT_ROLE_LABEL[role]}
            error={err(role)}
            unconfirmed={auto(role)}
            onConfirm={() => confirm(role)}
            hint={isLocked ? "Томилогдсон агентыг багийн ахлагч эсвэл менежер солино." : undefined}
          >
            <div id={fid(role)} tabIndex={-1} className="outline-none">
              {isLocked ? (
                <p className="flex min-h-11 items-center rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink">
                  {names[role] ?? "Томилогдсон"}
                </p>
              ) : (
                <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
                  <AgentPicker
                    value={form[role]}
                    onChange={(v) => set(role, v)}
                    staff={staff}
                    meId={meId}
                    teamIds={teamIds}
                    label={PROPERTY_AGENT_ROLE_LABEL[role]}
                    allowEmpty={role === "photo_agent_id"}
                  />
                </div>
              )}
            </div>
          </FormField>
        );
      })}
    </div>
  );
}

// ── Ангилал ба тайлбар ─────────────────────────────────────────────────────

export function DetailsFields({ api }: { api: SheetFormApi }) {
  const { form, set, update, err, auto, confirm, disabled, settings } = api;
  const catLabels = settings["property.category_labels"];
  const catHints = settings["property.category_hints"] ?? {};
  const typeOptions = settingOptions(settings["property.types"]);
  const featureOptions = settingOptions(settings["property.features"]);
  const today = ubToday();
  return (
    <div className="space-y-4">
      <FormField label="Ангилал" error={err("category")} unconfirmed={auto("category")} onConfirm={() => confirm("category")}>
        <div id={fid("category")} tabIndex={-1} className="outline-none">
          <ChoiceChips
            label="Ангилал"
            value={form.category}
            disabled={disabled}
            options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, catLabels), hint: catHints[c] ?? null }))}
            onChange={(c) => update((s) => withCategory(s, c), ["category"])}
          />
        </div>
      </FormField>
      <FormField
        label="Хөрөнгийн төрөл"
        error={err("property_type")}
        unconfirmed={auto("property_type")}
        onConfirm={() => confirm("property_type")}
      >
        <div id={fid("property_type")} tabIndex={-1} className="outline-none">
          <ChoiceChips
            label="Хөрөнгийн төрөл"
            value={form.property_type}
            disabled={disabled}
            options={[
              ...typeOptions,
              ...(form.property_type && !settings["property.types"][form.property_type]
                ? [{ value: form.property_type, label: form.property_type }]
                : []),
            ]}
            onChange={(v) => set("property_type", v)}
          />
        </div>
      </FormField>
      {featureOptions.length ? (
        <FormField label="Онцлог" error={err("features")} unconfirmed={auto("features")} onConfirm={() => confirm("features")}>
          <div id={fid("features")} tabIndex={-1} className="outline-none">
            <ToggleChips label="Онцлог" values={form.features} options={featureOptions} disabled={disabled} onChange={(v) => set("features", v)} />
          </div>
        </FormField>
      ) : null}
      <FormField label="Засвар, тавилга, техникийн байдал" htmlFor={fid("condition")} error={err("condition")}>
        <Textarea id={fid("condition")} maxLength={4000} value={form.condition} disabled={disabled} onChange={(e) => set("condition", e.target.value)} />
      </FormField>
      <FormField label={VIEW_NOTE_LABEL} htmlFor={fid("view_note")} error={err("view_note")}>
        <Textarea id={fid("view_note")} maxLength={4000} value={form.view_note} disabled={disabled} onChange={(e) => set("view_note", e.target.value)} />
      </FormField>
      <FormField
        label="Давуу тал"
        htmlFor={fid("advantages")}
        error={err("advantages")}
        unconfirmed={auto("advantages")}
        onConfirm={() => confirm("advantages")}
        hint="Нийтэд гарна — утас, тоот, хаалганы код бүү бичээрэй."
      >
        <Textarea id={fid("advantages")} maxLength={4000} value={form.advantages} disabled={disabled} onChange={(e) => set("advantages", e.target.value)} />
      </FormField>
      <FormField
        label="Дотоод тэмдэглэл"
        htmlFor={fid("notes")}
        error={err("notes")}
        unconfirmed={auto("notes")}
        onConfirm={() => confirm("notes")}
      >
        <Textarea id={fid("notes")} maxLength={8000} value={form.notes} disabled={disabled} onChange={(e) => set("notes", e.target.value)} />
      </FormField>
      <div className={GRID}>
        <FormField
          label="Хэзээнээс боломжтой"
          htmlFor={fid("available_from")}
          error={err("available_from")}
          unconfirmed={auto("available_from")}
          onConfirm={() => confirm("available_from")}
        >
          <div className="space-y-2">
            <Input
              id={fid("available_from")}
              type="date"
              value={form.available_from}
              disabled={disabled}
              onChange={(e) => set("available_from", e.target.value)}
            />
            {form.available_from !== today ? (
              <SuggestionChips
                label="Огнооны санал"
                disabled={disabled}
                items={[{ key: "today", label: "Өнөөдөр", value: today }]}
                onPick={(v) => set("available_from", v)}
              />
            ) : null}
          </div>
        </FormField>
        <FormField label="Боломжийн тайлбар" htmlFor={fid("availability_note")} error={err("availability_note")}>
          <Input
            id={fid("availability_note")}
            maxLength={1000}
            value={form.availability_note}
            disabled={disabled}
            onChange={(e) => set("availability_note", e.target.value)}
          />
        </FormField>
      </div>
    </div>
  );
}

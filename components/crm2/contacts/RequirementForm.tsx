"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createRequirement, updateRequirement } from "@/lib/crm2/actions/contacts";
import {
  periodForCategory,
  requirementFormFrom,
  requirementInputFromForm,
  type RequirementData,
  type RequirementForm as FormState,
} from "@/lib/crm2/contacts-requirements";
import { CURRENCIES, CURRENCY_LABEL, PRICE_PERIODS, PRICE_PERIOD_LABEL, PROPERTY_CATEGORIES, categoryLabel } from "@/lib/crm2/labels";
import { settingOptions } from "@/lib/crm2/settings";
import type { Crm2Currency, Crm2PricePeriod, Crm2PropertyCategory } from "@/lib/crm2/types";

import { ChipCheckbox, FormError, Textarea } from "./form-bits";

/**
 * Шаардлага нэмэх / засах (Drawer). Бүтэцтэй талбар (ангилал, төсөв+валют+хугацаа,
 * дүүрэг, өрөө, хэмжээ, орох хугацаа, зайлшгүй онцлог) + чөлөөт текст. Засахад өмнөх
 * хувилбар DB-д автоматаар хадгалагдана.
 */

export type RequirementLists = {
  categoryLabels: Partial<Record<string, string>>;
  types: Record<string, string>;
  districts: string[];
  features: Record<string, string>;
};

export function RequirementFormDrawer({
  open,
  onClose,
  contactId,
  requirementId,
  initial,
  lists,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  /** Засах үед; null бол шинэ. */
  requirementId: string | null;
  initial: RequirementData | null;
  lists: RequirementLists;
}) {
  const ids = React.useId();
  const [form, setForm] = React.useState<FormState>(() => requirementFormFrom(initial));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(requirementFormFrom(initial));
      setError(null);
    }
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "districts" | "required_features", v: string, on: boolean) =>
    setForm((f) => ({ ...f, [k]: on ? [...f[k], v] : f[k].filter((x) => x !== v) }));

  // Тохиргооноос хасагдсан ч өмнө сонгогдсон утгыг харуулна (хасвал DB хүлээж авахгүй).
  const districtOptions = [...new Set([...lists.districts, ...form.districts])];
  const featureOptions = { ...Object.fromEntries(form.required_features.map((f) => [f, f])), ...lists.features };
  const typeOptions = settingOptions(lists.types);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = requirementInputFromForm(form);
    startTransition(async () => {
      const r = requirementId
        ? await updateRequirement({ requirement_id: requirementId, ...input })
        : await createRequirement({ contact_id: contactId, ...input });
      if (!r.ok) return setError(r.error);
      toast.success(requirementId ? "Шаардлага шинэчлэгдлээ" : "Шаардлага нэмэгдлээ");
      onClose();
    });
  }

  const sale = form.category === "sale";

  return (
    <Drawer
      open={open}
      onClose={() => !pending && onClose()}
      title={requirementId ? "Шаардлага засах" : "Шинэ шаардлага"}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" form={`${ids}-form`} disabled={pending}>
            {pending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} className="space-y-4">
        {requirementId ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            Шалгуурыг өөрчлөхөд одоогийн хувилбар «өмнөх хувилбарууд»-д хадгалагдана.
          </p>
        ) : null}

        <Field label="Зорилго" htmlFor={`${ids}-purpose`} hint="Жишээ: гэр бүлээрээ амьдрах, оффис нээх">
          <Input id={`${ids}-purpose`} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={200} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ангилал" htmlFor={`${ids}-category`}>
            <Select
              id={`${ids}-category`}
              value={form.category}
              onChange={(e) => {
                const category = e.target.value as Crm2PropertyCategory | "";
                setForm((f) => ({ ...f, category, price_period: periodForCategory(category, f.price_period) }));
              }}
            >
              <option value="">Сонгоогүй</option>
              {PROPERTY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c, lists.categoryLabels)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хөрөнгийн төрөл" htmlFor={`${ids}-type`}>
            <Select id={`${ids}-type`} value={form.property_type} onChange={(e) => set("property_type", e.target.value)}>
              <option value="">Сонгоогүй</option>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {form.property_type && !(form.property_type in lists.types) ? (
                <option value={form.property_type}>{form.property_type}</option>
              ) : null}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Төсөв</legend>
          <div className="grid grid-cols-2 gap-2">
            <Input
              inputMode="decimal"
              value={form.budget_min}
              onChange={(e) => set("budget_min", e.target.value)}
              placeholder="Доод"
              aria-label="Төсвийн доод"
            />
            <Input
              inputMode="decimal"
              value={form.budget_max}
              onChange={(e) => set("budget_max", e.target.value)}
              placeholder="Дээд"
              aria-label="Төсвийн дээд"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value as Crm2Currency)} aria-label="Валют">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABEL[c]}
                </option>
              ))}
            </Select>
            <Select
              value={sale ? "total" : form.price_period}
              onChange={(e) => set("price_period", e.target.value as Crm2PricePeriod)}
              disabled={sale}
              aria-label="Үнийн хугацаа"
            >
              {PRICE_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PRICE_PERIOD_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          {sale ? <p className="text-xs text-muted">Худалдан авах шаардлагын төсөв нийт дүнгээр.</p> : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Дүүрэг</legend>
          <div className="flex flex-wrap gap-1.5">
            {districtOptions.map((d) => (
              <ChipCheckbox key={d} label={d} checked={form.districts.includes(d)} onChange={(on) => toggle("districts", d, on)} />
            ))}
          </div>
        </fieldset>

        <Field label="Байршил" htmlFor={`${ids}-locations`} hint="Хэд хэдэн байршлыг таслалаар тусгаарлана (жишээ: Зайсан, Яармаг)">
          <Input id={`${ids}-locations`} value={form.locations} onChange={(e) => set("locations", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-ink">Өрөө</legend>
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="numeric" value={form.rooms_min} onChange={(e) => set("rooms_min", e.target.value)} placeholder="Доод" aria-label="Өрөө доод" />
              <Input inputMode="numeric" value={form.rooms_max} onChange={(e) => set("rooms_max", e.target.value)} placeholder="Дээд" aria-label="Өрөө дээд" />
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-ink">Хэмжээ (м²)</legend>
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="decimal" value={form.area_min} onChange={(e) => set("area_min", e.target.value)} placeholder="Доод" aria-label="Хэмжээ доод" />
              <Input inputMode="decimal" value={form.area_max} onChange={(e) => set("area_max", e.target.value)} placeholder="Дээд" aria-label="Хэмжээ дээд" />
            </div>
          </fieldset>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Орох огноо" htmlFor={`${ids}-movein`}>
            <Input id={`${ids}-movein`} type="date" value={form.move_in_from} onChange={(e) => set("move_in_from", e.target.value)} />
          </Field>
          <Field label="Орох хугацааны тайлбар" htmlFor={`${ids}-movenote`}>
            <Input
              id={`${ids}-movenote`}
              value={form.move_in_note}
              onChange={(e) => set("move_in_note", e.target.value)}
              maxLength={500}
              placeholder="Жишээ: 2–3 сарын дотор"
            />
          </Field>
        </div>

        {Object.keys(featureOptions).length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Зайлшгүй онцлог</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(featureOptions).map(([k, v]) => (
                <ChipCheckbox
                  key={k}
                  label={v}
                  checked={form.required_features.includes(k)}
                  onChange={(on) => toggle("required_features", k, on)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <Field label="Бусад зайлшгүй нөхцөл" htmlFor={`${ids}-must`} hint="Мөр бүрт нэг нөхцөл">
          <Textarea id={`${ids}-must`} rows={3} value={form.must_haves} onChange={(e) => set("must_haves", e.target.value)} />
        </Field>

        <Field label="Тэмдэглэл" htmlFor={`${ids}-notes`}>
          <Textarea id={`${ids}-notes`} rows={3} maxLength={4000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <FormError message={error} />
      </form>
    </Drawer>
  );
}

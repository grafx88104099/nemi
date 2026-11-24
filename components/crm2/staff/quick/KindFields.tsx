"use client";

import { ChoiceChips, FormField } from "@/components/crm2/staff/form/fields";
import { CATEGORY_HINT_DEFAULT, categoryLabel, PROPERTY_CATEGORIES } from "@/lib/crm2/labels";
import type { Crm2PropertyCategory } from "@/lib/crm2/types";

/**
 * Ангилал (заавал — хадгалах цорын ганц шаардлага) ба хөрөнгийн төрөл. Төрөлд «Орон сууц» урьдчилан
 * сонгогдсон. Наалтаар бөглөгдсөн бол шар «шалгана уу».
 */
export function KindFields({
  category,
  propertyType,
  categoryLabels,
  categoryHints,
  types,
  categoryAuto,
  typeAuto,
  disabled,
  error,
  onCategory,
  onType,
  onConfirm,
}: {
  category: Crm2PropertyCategory | "";
  propertyType: string;
  categoryLabels: Partial<Record<string, string>>;
  categoryHints: Partial<Record<Crm2PropertyCategory, string>>;
  /** property.types (код → нэр). */
  types: Record<string, string>;
  categoryAuto: boolean;
  typeAuto: boolean;
  disabled?: boolean;
  error?: string | null;
  onCategory: (c: Crm2PropertyCategory) => void;
  onType: (t: string) => void;
  onConfirm: (key: "category" | "property_type") => void;
}) {
  const hints = { ...CATEGORY_HINT_DEFAULT, ...categoryHints };
  const typeOptions = Object.entries(types).map(([value, label]) => ({ value, label }));
  if (propertyType && !types[propertyType]) typeOptions.push({ value: propertyType, label: propertyType });

  return (
    <div className="space-y-4">
      <FormField
        label="Ангилал"
        htmlFor="qa-category"
        stage="start"
        error={error}
        unconfirmed={categoryAuto}
        onConfirm={() => onConfirm("category")}
      >
        <div id="qa-category" tabIndex={-1} className="outline-none">
          <ChoiceChips
            label="Ангилал"
            value={category}
            disabled={disabled}
            invalid={!!error}
            className="grid grid-cols-2 gap-2"
            options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, categoryLabels), hint: hints[c] ?? null }))}
            onChange={onCategory}
          />
        </div>
      </FormField>
      <FormField
        label="Хөрөнгийн төрөл"
        htmlFor="qa-property_type"
        unconfirmed={typeAuto}
        onConfirm={() => onConfirm("property_type")}
      >
        <div id="qa-property_type" tabIndex={-1} className="outline-none">
          <ChoiceChips label="Хөрөнгийн төрөл" value={propertyType} disabled={disabled} options={typeOptions} onChange={onType} />
        </div>
      </FormField>
    </div>
  );
}

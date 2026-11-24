"use client";

import * as React from "react";

import { PROPERTY_CATEGORIES, PROPERTY_CATEGORY_LABEL } from "@/lib/crm2/labels";
import { Input } from "@/components/ui/input";

import { writeCategoryHint } from "./editor-model";

/**
 * property.category_hints — 4 ангиллын дурын дэд олонлогт богино тайлбар (ангиллын чипийн доор).
 * Хоосон мөр = тухайн ангилалд тайлбаргүй.
 */

export type CategoryHintsEditorProps = {
  value: unknown;
  onChange: (v: Record<string, string>) => void;
  maxLabel: number;
  categoryLabels?: Partial<Record<string, string>>;
  disabled?: boolean;
};

export function CategoryHintsEditor({ value, onChange, maxLabel, categoryLabels, disabled }: CategoryHintsEditorProps) {
  const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const baseId = React.useId();

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROPERTY_CATEGORIES.map((cat) => {
          const id = `${baseId}-${cat}`;
          const text = typeof map[cat] === "string" ? (map[cat] as string) : "";
          const name = categoryLabels?.[cat] || PROPERTY_CATEGORY_LABEL[cat];
          return (
            <li key={cat}>
              <label htmlFor={id} className="block text-sm font-medium text-ink">
                {name}
              </label>
              <Input
                id={id}
                value={text}
                maxLength={maxLabel}
                enterKeyHint="done"
                disabled={disabled}
                onChange={(e) => onChange(writeCategoryHint(map, cat, e.target.value))}
                placeholder="Тайлбаргүй"
                className="mt-1 text-base sm:text-sm"
              />
              <p className="mt-0.5 text-right text-xs text-subtle">
                {text.length}/{maxLabel}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        «{categoryLabels?.lease || PROPERTY_CATEGORY_LABEL.lease}»-ийн тайлбарыг түрээслэхээс ялгах дүрмийг оффис тогтоосны дараа бичнэ үү.
      </p>
    </div>
  );
}

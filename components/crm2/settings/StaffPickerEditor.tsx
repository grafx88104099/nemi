"use client";

import * as React from "react";
import { Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

import { staffPickerView, staffRowText, toggleStaffId, type StaffOption } from "./editor-model";

/**
 * staff.quick_add_pilot — оффисын идэвхтэй ажилтнаас (crm2_staff_directory) 20 хүртэлхийг сонгоно.
 * Мөр бүр «нэр · баг», 44px. Лавлахад байхгүй (идэвхгүй болсон) id-г «Идэвхгүй ажилтан» гэж
 * харуулж хасах боломж өгнө — DB идэвхтэй ажилтныг л зөвшөөрнө.
 */

export type StaffPickerEditorProps = {
  value: unknown;
  onChange: (v: string[]) => void;
  staff: readonly StaffOption[];
  maxItems: number;
  label: string;
  disabled?: boolean;
};

const SEARCH_FROM = 8;

export function StaffPickerEditor({ value, onChange, staff, maxItems, label, disabled }: StaffPickerEditorProps) {
  const list = React.useMemo(
    () => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []),
    [value]
  );
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();
  const view = staffPickerView(staff, list, query);
  const full = list.length >= maxItems;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink" aria-live="polite">
          Сонгосон: {list.length}/{maxItems}
        </p>
        {view.selected.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Одоогоор хэн ч сонгогдоогүй.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label={`${label}: сонгосон`}>
            {view.selected.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-2 pl-3">
                <span className={cn("min-w-0 flex-1 truncate text-sm", r.inactive ? "text-subtle" : "text-ink")}>
                  {staffRowText(r.name, r.team)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(toggleStaffId(list, r.id, maxItems))}
                  aria-label={`${r.name} хасах`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {staff.length > SEARCH_FROM ? (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Ажилтан хайх
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            id={searchId}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Нэр эсвэл багаар хайх"
            disabled={disabled}
            className="pl-9 text-base sm:text-sm"
          />
        </div>
      ) : null}

      {full ? <p className="text-sm text-amber-700">{maxItems} агент сонгосон — өөр хүн нэмэхийн өмнө нэгийг хасна уу.</p> : null}

      {view.available.length === 0 ? (
        <p className="text-sm text-muted">{query.trim() ? "Хайлтад тохирох ажилтан алга." : "Сонгох ажилтан үлдсэнгүй."}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line" aria-label={`${label}: нэмэх`}>
          {view.available.map((s) => (
            <li key={s.profile_id}>
              <button
                type="button"
                disabled={disabled || full}
                onClick={() => onChange(toggleStaffId(list, s.profile_id, maxItems))}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">{staffRowText(s.name, s.team_name)}</span>
                <Plus className="size-4 shrink-0 text-brand-600" aria-hidden />
                <span className="sr-only">нэмэх</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

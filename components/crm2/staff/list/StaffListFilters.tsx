"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FilterChips,
  FilterClear,
  FilterSearch,
  FilterSelect,
  useFilters,
  type FilterOption,
} from "@/components/crm2/ui";
import { PROPERTY_STATUS_GROUP_LABEL, PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import type { Crm2PropertyStatus } from "@/lib/crm2/types";

import { STAFF_FILTER_KEYS, STAFF_STATUS_ALL, STAFF_VIEWS, defaultStatusForView, type StaffView } from "./list-params";
import { SuggestFilter } from "./SuggestFilter";

/**
 * S01 шүүлтүүр: харагдац (Идэвхтэй / Архив / Ноорог), түлхүүр үг, 4 ангилал,
 * төлөв, төсөл, дүүрэг, байршил, эрэмбэ. Бүгд URL параметрт (FilterProvider дотор).
 * Утсан дээр нэмэлт шүүлтүүр «Шүүлтүүр» товчоор нээгдэнэ.
 */
export function StaffListFilters({
  view,
  categories,
  statuses,
  districts,
  projectLabel,
  advancedCount,
  offerMode = false,
}: {
  view: StaffView;
  categories: FilterOption[];
  statuses: Crm2PropertyStatus[];
  districts: string[];
  projectLabel: string | null;
  advancedCount: number;
  /** «Санал болгох» горим — төлвийг сервер (шинэ хэлцэл нээж болох төлөв) тогтооно; харагдац, төлөв сонгохгүй. */
  offerMode?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      {offerMode ? null : <ViewTabs view={view} />}

      <div className="flex items-stretch gap-2">
        <FilterSearch placeholder="Код, төсөл, байршил эсвэл үгээр хайх" label="Staff-аас хайх" className="min-w-0 flex-1" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="staff-advanced-filters"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold sm:hidden",
            advancedCount > 0 ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink"
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span>Шүүлтүүр</span>
          {advancedCount > 0 ? <span className="tabular-nums">({advancedCount})</span> : null}
        </button>
      </div>

      <FilterChips name="category" label="Ангилал" defaultValue="" options={[{ value: "", label: "Бүх ангилал" }, ...categories]} />

      <div
        id="staff-advanced-filters"
        className={cn("grid-cols-1 gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", open ? "grid" : "hidden")}
      >
        {statuses.length > 1 && !offerMode ? (
          <FilterSelect
            name="status"
            label="Төлөв"
            // Идэвхтэй харагдацын анхдагч «Идэвхтэй»; «Бүгд» нь бүлгийн бүх төлөв (?status=all).
            defaultValue={defaultStatusForView(view) ?? ""}
            allValue={defaultStatusForView(view) ? STAFF_STATUS_ALL : ""}
            allLabel={defaultStatusForView(view) ? `Бүгд (${PROPERTY_STATUS_GROUP_LABEL[view].toLowerCase()})` : "Бүгд"}
            options={statuses.map((s) => ({ value: s, label: PROPERTY_STATUS_LABEL[s] }))}
            className="w-full sm:w-full sm:min-w-0"
          />
        ) : null}
        <SuggestFilter kind="project" name="project" label="Төсөл" placeholder="Төслөөр шүүх" selectedLabel={projectLabel} />
        <FilterSelect
          name="district"
          label="Дүүрэг"
          options={districts.map((d) => ({ value: d, label: d }))}
          className="w-full sm:w-full sm:min-w-0"
        />
        <SuggestFilter kind="location" name="loc" label="Байршил" placeholder="Байршлаар шүүх" />
        <FilterSelect
          name="sort"
          label="Эрэмбэ"
          allLabel="шинээр бүртгэсэн эхэнд"
          options={[{ value: "activated", label: "Эрэмбэ: шинээр идэвхжсэн эхэнд" }]}
          className="w-full sm:w-full sm:min-w-0"
        />
      </div>

      <FilterClear keys={[...STAFF_FILTER_KEYS]} label="Шүүлтүүр цэвэрлэх" />
    </div>
  );
}

const VIEW_LABEL: Record<StaffView, string> = {
  active: PROPERTY_STATUS_GROUP_LABEL.active,
  archive: PROPERTY_STATUS_GROUP_LABEL.archive,
  draft: PROPERTY_STATUS_GROUP_LABEL.draft,
};

/** Харагдацын таб — солиход төлвийн шүүлтүүрийг хасна (өөр бүлгийнх тул). */
function ViewTabs({ view }: { view: StaffView }) {
  const { set, pending } = useFilters();
  return (
    <div role="group" aria-label="Харагдац" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
      {STAFF_VIEWS.map((v) => {
        const on = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            disabled={pending && !on}
            onClick={() => {
              if (!on) set({ view: v === "active" ? null : v, status: null });
            }}
            className={cn(
              "h-11 shrink-0 rounded-lg px-4 text-sm font-semibold transition sm:h-9",
              on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {VIEW_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";

import { FormField } from "@/components/crm2/staff/form/fields";
import { PinField } from "@/components/crm2/staff/form/PinField";
import { SuggestInput, type Suggestion } from "@/components/crm2/staff/form/SuggestInput";
import { loadLocationSuggestions, loadProjectSuggestions } from "@/components/crm2/staff/form/suggest-loaders";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { districtChips, filterRecentProjects, mergeProjectSuggestions, type RecentProject } from "./quick-model";

const noopSubscribe = () => () => undefined;

/** localStorage-ийн утга (сервер дээр null). Бичсэний дараа `bump`-аар дахин уншина. */
export function useStoredValue(key: string, version = 0): string | null {
  const read = React.useCallback(() => {
    void version;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key, version]);
  return React.useSyncExternalStore(noopSubscribe, read, () => null);
}

export type PlaceValue = {
  project_name: string;
  project_id: string | null;
  district: string;
  location_text: string;
  lat: number | null;
  lng: number | null;
  pin_address: string;
};

/**
 * Байршил (GPS-гүй): төслийн typeahead (сүлжээгүй үед ч сүүлийн 20 төсөл санал болгоно), байршлын
 * бичвэр, дүүргийн товч (төслийн дүүрэг, сүүлийн 3, «Бусад» жагсаалт) ба нуусан газрын зургийн цэг.
 */
export function PlaceFields({
  value,
  districts,
  recentProjects,
  recentDistricts,
  projectDistrict,
  auto,
  disabled,
  onProjectText,
  onProjectPick,
  onDistrict,
  onLocation,
  onPin,
  onPinAddress,
  onConfirm,
}: {
  value: PlaceValue;
  districts: readonly string[];
  recentProjects: readonly RecentProject[];
  recentDistricts: readonly string[];
  /** Сонгосон төслийн дүүрэг (санал эсвэл кэш). */
  projectDistrict: string | null;
  auto: (formKey: string) => boolean;
  disabled?: boolean;
  onProjectText: (v: string) => void;
  onProjectPick: (p: { id: string; name: string }) => void;
  onDistrict: (d: string) => void;
  onLocation: (v: string) => void;
  onPin: (lat: number | null, lng: number | null) => void;
  onPinAddress: (v: string) => void;
  onConfirm: (formKey: string) => void;
}) {
  const recentRef = React.useRef(recentProjects);
  React.useEffect(() => {
    recentRef.current = recentProjects;
  });

  const loadProjects = React.useCallback(async (q: string): Promise<Suggestion[]> => {
    const cached = filterRecentProjects(recentRef.current, q);
    let remote: Suggestion[] = [];
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      try {
        remote = await loadProjectSuggestions(q);
      } catch {
        remote = [];
      }
    }
    return mergeProjectSuggestions(remote, cached);
  }, []);

  const loadLocations = React.useCallback(async (q: string): Promise<Suggestion[]> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return [];
    try {
      return await loadLocationSuggestions(q);
    } catch {
      return [];
    }
  }, []);

  const chips = districtChips({ current: value.district, projectDistrict, recent: recentDistricts, districts });
  const otherOptions = value.district && !districts.includes(value.district) ? [...districts, value.district] : districts;

  return (
    <div className="space-y-4">
      <FormField
        label="Төсөл, хотхон"
        htmlFor="qa-project_name"
        unconfirmed={auto("project_name")}
        onConfirm={() => onConfirm("project_name")}
        hint={
          value.project_name.trim() && !value.project_id
            ? "Жагсаалтад байхгүй бол хадгалахад шинэ төсөл болж бүртгэгдэнэ."
            : "Бичиж эхлэхэд санал гарна."
        }
      >
        <SuggestInput
          id="qa-project_name"
          value={value.project_name}
          maxLength={120}
          disabled={disabled}
          placeholder="Төсөл, хотхоны нэр"
          load={loadProjects}
          emptyText={null}
          inputClassName="h-12 text-base sm:h-11 sm:text-sm"
          onValueChange={onProjectText}
          onPick={(it) => onProjectPick({ id: it.key, name: it.label })}
        />
      </FormField>

      <FormField label="Дүүрэг" htmlFor="qa-district" unconfirmed={auto("district")} onConfirm={() => onConfirm("district")}>
        <div className="space-y-2">
          {chips.length ? (
            <div role="radiogroup" aria-label="Дүүрэг" className="flex flex-wrap gap-2">
              {chips.map((d) => {
                const on = d === value.district;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => onDistrict(d)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50",
                      on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink hover:bg-surface-2"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          ) : null}
          <Select
            id="qa-district"
            aria-label="Бусад дүүрэг"
            value={chips.includes(value.district) ? "" : value.district}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onDistrict(e.target.value);
            }}
          >
            <option value="">{chips.length ? "Бусад…" : "— Дүүрэг сонгох —"}</option>
            {otherOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </FormField>

      <FormField
        label="Байршил"
        htmlFor="qa-location_text"
        unconfirmed={auto("location_text")}
        onConfirm={() => onConfirm("location_text")}
        hint="Хороолол, гудамж, ойролцоох газар."
      >
        <SuggestInput
          id="qa-location_text"
          value={value.location_text}
          maxLength={200}
          disabled={disabled}
          placeholder="жишээ: 19-р хороолол"
          load={loadLocations}
          emptyText={null}
          inputClassName="h-12 text-base sm:h-11 sm:text-sm"
          onValueChange={onLocation}
          onPick={(it) => onLocation(it.label)}
        />
      </FormField>

      <PinField
        idPrefix="qa"
        lat={value.lat}
        lng={value.lng}
        address={value.pin_address}
        onPin={onPin}
        onAddress={onPinAddress}
        disabled={disabled}
        collapsible
      />
    </div>
  );
}

"use client";

import { FilterChips, FilterClear } from "@/components/crm2/ui";

import { WAITLIST_FILTER_KEYS, WAITLIST_MATCH_OPTIONS, WAITLIST_MINE_OPTIONS } from "./list-params";

/**
 * T10 шүүлтүүр: «Зөвхөн минийх» ба «Тохирохтой / Тохирохгүй / Бүгд».
 * Бүгд URL параметрт (FilterProvider дотор) — сервер дэлгэц дахин уншина.
 */
export function WaitlistFilters() {
  return (
    <div className="space-y-2">
      <FilterChips name="mine" label="Хариуцагч" defaultValue="" options={WAITLIST_MINE_OPTIONS} />
      <FilterChips name="match" label="Тохирох хөрөнгө" defaultValue="" options={WAITLIST_MATCH_OPTIONS} />
      <FilterClear keys={[...WAITLIST_FILTER_KEYS]} label="Шүүлтүүр цэвэрлэх" />
    </div>
  );
}

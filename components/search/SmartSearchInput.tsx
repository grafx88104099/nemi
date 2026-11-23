"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { SuggestInput } from "@/components/ui/SuggestInput";
import { applySuggestion, suggestionsFor, type SearchSuggestion } from "@/lib/search/suggest";

/**
 * Нийтийн хайлтын мөр: статик санал (дүүрэг, төрөл, «2 өрөө», «300 сая хүртэл»…)
 * — сүлжээний хүсэлтгүй. Жинхэнэ <input name="q"> нь ойролцоох GET маягтаар
 * шууд илгээгдэнэ (JS-гүй ч, hydration-оос өмнө ч). Идэвхтэй санал дээр Enter
 * дарвал сонгоно, санал сонгоогүй Enter маягтыг илгээнэ.
 */
export function SmartSearchInput({
  name = "q",
  defaultValue,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
}: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");

  // Hydration-оос өмнө бичсэн текстийг үрэхгүй — DOM-ийн утгыг state болгон авна.
  useLayoutEffect(() => {
    const dom = ref.current?.value;
    if (dom != null) setValue((v) => (v === dom ? v : dom));
  }, []);

  return (
    <SuggestInput
      name={name}
      inputRef={ref}
      value={value}
      onValueChange={setValue}
      onPick={(s) => setValue((v) => applySuggestion(v, s as SearchSuggestion))}
      load={(q) => Promise.resolve(suggestionsFor(q))}
      emptyText={null}
      debounceMs={60}
      maxLength={120}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      inputClassName={inputClassName}
    />
  );
}

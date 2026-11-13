"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFilters } from "@/components/crm2/ui";
import { SuggestInput } from "@/components/crm2/staff/form/SuggestInput";
import { loadLocationSuggestions, loadProjectSuggestions } from "@/components/crm2/staff/form/suggest-loaders";

/**
 * Санал гаргадаг URL шүүлтүүр: төсөл (?project=<id>) эсвэл байршил (?loc=<бичвэр>).
 * Сонгосон үед «Төсөл: Нэр ×» хэлбэрээр харагдана. Байршлыг жагсаалтаас сонгохгүйгээр
 * Enter дарж чөлөөт бичвэрээр ч шүүнэ.
 */
export function SuggestFilter({
  kind,
  name,
  label,
  placeholder,
  selectedLabel,
  className,
}: {
  kind: "project" | "location";
  name: string;
  label: string;
  placeholder?: string;
  /** Сонгосон утгын нэр (төслийн id → нэр). Өгөөгүй бол параметрийн утга. */
  selectedLabel?: string | null;
  className?: string;
}) {
  const { get, set } = useFilters();
  const value = get(name);
  const [text, setText] = React.useState("");

  if (value) {
    return (
      <div
        className={cn(
          "flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-brand-300 bg-brand-50 pl-3.5 pr-1 text-sm",
          className
        )}
      >
        <span className="min-w-0 truncate text-brand-800">
          <span className="text-brand-700/80">{label}: </span>
          <span className="font-semibold">{selectedLabel || value}</span>
        </span>
        <button
          type="button"
          aria-label={`${label} шүүлтүүрийг арилгах`}
          onClick={() => set({ [name]: null })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-100 sm:size-9"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <SuggestInput
      className={className}
      value={text}
      onValueChange={setText}
      ariaLabel={label}
      placeholder={placeholder ?? label}
      maxLength={kind === "location" ? 200 : 120}
      load={kind === "project" ? loadProjectSuggestions : loadLocationSuggestions}
      onPick={(it) => {
        setText("");
        set({ [name]: it.key });
      }}
      onEnter={
        kind === "location"
          ? (t) => {
              const v = t.trim();
              if (!v) return;
              setText("");
              set({ [name]: v });
            }
          : undefined
      }
    />
  );
}

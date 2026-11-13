import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Харилцагчийн маягтуудын жижиг хэсгүүд (components/ui/input-тэй ижил хэв маяг):
 * олон мөр текст, сонголтын «чип» (checkbox).
 */

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

/** Олон сонголтын чип (дүүрэг, онцлог). */
export function ChipCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
        checked ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Алдааны мөр (маягтын доор). */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}

/** Утасны шошгын санал (datalist). */
export const PHONE_LABEL_SUGGESTIONS = ["Үндсэн", "Гар утас", "Ажлын", "Гэрийн", "Гэр бүлийн гишүүн", "Эзэн", "Төлөөлөгч"];

export function PhoneLabelList({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {PHONE_LABEL_SUGGESTIONS.map((l) => (
        <option key={l} value={l} />
      ))}
    </datalist>
  );
}

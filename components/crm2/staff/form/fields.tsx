"use client";

import * as React from "react";
import { ChevronDown, Lock, NotebookPen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * S02 маягтын жижиг хэсгүүд: бүлэг (карт), талбар (шошго + алдаа), олон мөрт
 * текст, сонголтын товчлуур, талбарын эх бичвэр. components/ui-ийн хэв маягаар.
 */

export function FormSection({
  title,
  description,
  icon: Icon,
  locked,
  children,
  className,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Зөвхөн эрх бүхий ажилтанд харагдах хэсэг. */
  locked?: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="space-y-4 p-4 sm:p-5">
        <header className="space-y-0.5">
          <h2 id={id ? `${id}-title` : undefined} className="flex items-center gap-2 text-base font-bold text-ink">
            {Icon ? <Icon className="size-4 text-brand-600" /> : null}
            {title}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                <Lock className="size-3" aria-hidden />
                Хаалттай
              </span>
            ) : null}
          </h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </header>
        {children}
      </section>
    </Card>
  );
}

/** Шошго + оруулга + тайлбар/алдаа. required — идэвхжүүлэхэд заавал (одоор тэмдэглэнэ). */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-brand-600" title="Идэвхжүүлэхэд заавал">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
        "aria-[invalid=true]:border-danger",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

/** Нэг сонголттой товчлуурууд (ангилал, валют г.м.). */
export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  invalid,
  className,
}: {
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              // Гар утсанд 44px хүрэх талбай (sm-ээс дээш илүү нягт).
              "inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-left text-sm font-medium transition disabled:opacity-50 sm:min-h-9",
              on
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : cn("bg-surface text-ink hover:bg-surface-2", invalid ? "border-danger" : "border-line")
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Олон сонголттой товчлуур (онцлог). */
export function ToggleChips({
  values,
  options,
  onChange,
  label,
  disabled,
}: {
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  const set = new Set(values);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition disabled:opacity-50",
              on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Талбарын эх бичвэр (field_notes): эзний/зарын анхны үг, нэмэлт тайлбар.
 * Хоосон бол «Эх бичвэр» товч, бичсэн бол шууд нээлттэй.
 */
export function FieldNote({
  value,
  onChange,
  label,
  maxLength = 2000,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ямар талбарын тайлбар (дэлгэц уншигчид). */
  label: string;
  maxLength?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const shown = open || !!value;
  return (
    <div className="space-y-1">
      {!shown ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-brand-700"
        >
          <NotebookPen className="size-3.5" aria-hidden />
          Эх бичвэр нэмэх
          <ChevronDown className="size-3" aria-hidden />
        </button>
      ) : (
        <>
          <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-muted">
            <NotebookPen className="size-3.5" aria-hidden />
            Эх бичвэр — {label}
          </label>
          <Textarea
            id={id}
            rows={2}
            value={value}
            maxLength={maxLength}
            placeholder="Эзний хэлсэн эсвэл анхны бичвэрийг хадгална (заавал биш)"
            onChange={(e) => onChange(e.target.value)}
            className="bg-surface-2/60 text-[13px]"
          />
        </>
      )}
    </div>
  );
}

/** Маягтын ерөнхий алдаа (серверийн хамгаалалтын мессеж). */
export function FormAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "warn" | "info" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "error" && "border-rose-200 bg-rose-50 text-rose-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900"
      )}
    >
      {children}
    </div>
  );
}

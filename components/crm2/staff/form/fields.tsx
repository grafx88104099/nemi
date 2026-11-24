"use client";

import * as React from "react";
import { Lock, NotebookPen, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { STAGE_TAG_LABEL, type Crm2FieldStage } from "@/lib/crm2/labels";

/**
 * S02 маягтын жижиг хэсгүүд: бүлэг (карт), талбар (шошго + шат + алдаа), олон мөрт
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
          <h2 id={id ? `${id}-title` : undefined} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold text-ink">
            {Icon ? <Icon className="size-4 text-brand-600" /> : null}
            {title}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                <Lock className="size-3" aria-hidden />
                Зөвхөн үүрэгт агентад харагдана
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

/** Талбар хэзээ хэрэгтэй болохыг заах жижиг шошго («эхлэхэд хэрэгтэй» г.м.). */
export function StageTag({ stage, className }: { stage: Crm2FieldStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-medium leading-4",
        stage === "start" && "bg-brand-50 text-brand-700",
        stage === "contract" && "bg-violet-50 text-violet-700",
        stage === "publish" && "bg-sky-50 text-sky-700",
        className
      )}
    >
      {STAGE_TAG_LABEL[stage]}
    </span>
  );
}

/** «шалгана уу» шошго + «Зөв» товч (автоматаар бөглөгдсөн, баталгаажаагүй утга). */
export function UnconfirmedTag({ onConfirm, disabled }: { onConfirm?: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
      шалгана уу
      {onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="-my-2 inline-flex min-h-11 items-center rounded-lg px-2 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          Зөв
        </button>
      ) : null}
    </span>
  );
}

/**
 * Шошго + оруулга + тайлбар/алдаа/сануулга. stage — талбар хэзээ хэрэгтэйг (эхлэх, гэрээ,
 * нийтлэх) шошгоор заана; хуучин required нь «эхлэхэд хэрэгтэй» шошготой ижил.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  warning,
  required,
  stage,
  unconfirmed,
  onConfirm,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  /** Хадгалахыг саатуулахгүй сануулга (нэгж, нийтлэхэд саад). */
  warning?: string | null;
  /** @deprecated stage-ийг ашиглана. */
  required?: boolean;
  stage?: Crm2FieldStage | null;
  /** Автоматаар бөглөгдсөн, баталгаажаагүй утга — шар «шалгана уу». */
  unconfirmed?: boolean;
  onConfirm?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const tag = stage ?? (required ? "start" : null);
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <label htmlFor={htmlFor} className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
          {label}
          {tag ? <StageTag stage={tag} /> : null}
        </label>
        {unconfirmed ? <UnconfirmedTag onConfirm={onConfirm} /> : null}
      </div>
      <div className={cn(unconfirmed && "rounded-xl ring-2 ring-amber-300 ring-offset-1")}>{children}</div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : warning ? (
        <p role="status" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
          {warning}
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
        // Гар утсанд 16px (iOS томруулахгүй).
        "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-subtle sm:text-sm",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
        "aria-[invalid=true]:border-danger",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

/** Нэг сонголттой товчлуурууд (ангилал, валют г.м.). hint — сонголт бүрийн доорх тайлбар. */
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
  options: { value: T; label: string; hint?: string | null }[];
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
              "inline-flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left text-sm font-medium transition disabled:opacity-50 sm:min-h-9",
              on
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : cn("bg-surface text-ink hover:bg-surface-2", invalid ? "border-danger" : "border-line")
            )}
          >
            <span>{o.label}</span>
            {o.hint ? <span className={cn("text-[11px] font-normal leading-4", on ? "text-brand-700" : "text-muted")}>{o.hint}</span> : null}
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
              "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium transition disabled:opacity-50 sm:min-h-9",
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

/** Нэг товшилтын санал (сүүлийн дүүрэг, «Өнөөдөр», «Би») — хэзээ ч автоматаар бөглөхгүй. */
export function SuggestionChips({
  label,
  items,
  onPick,
  disabled,
}: {
  label: string;
  items: { key: string; label: string; value: string }[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(it.value)}
          className="inline-flex min-h-11 items-center rounded-full border border-dashed border-line-strong bg-surface px-3 text-sm font-medium text-ink transition hover:border-brand-400 hover:bg-brand-50/60 disabled:opacity-50 sm:min-h-9"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Талбарын эх бичвэр (field_notes): эзний/зарын анхны үг, нэмэлт тайлбар.
 * Хоосон бол жижиг дүрс товч («Эх бичвэр нэмэх»), бичсэн бол шууд нээлттэй.
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
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const shown = open || !!value;

  React.useEffect(() => {
    if (open && !value) ref.current?.focus();
    // зөвхөн нээхэд
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!shown) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          aria-label="Эх бичвэр нэмэх"
          title={`Эх бичвэр нэмэх — ${label}`}
          onClick={() => setOpen(true)}
          className="-mt-1 inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-brand-700 sm:size-8"
        >
          <NotebookPen className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-muted">
          <NotebookPen className="size-3.5" aria-hidden />
          Эх бичвэр — {label}
        </label>
        {!value ? (
          <button
            type="button"
            aria-label="Эх бичвэр хаах"
            onClick={() => setOpen(false)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 sm:size-8"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <Textarea
        ref={ref}
        id={id}
        rows={2}
        value={value}
        maxLength={maxLength}
        placeholder="Эзний хэлсэн эсвэл анхны бичвэрийг хадгална (заавал биш)"
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2/60 sm:text-[13px]"
      />
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

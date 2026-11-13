import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE } from "@/lib/crm2/labels";

/**
 * Хөрөнгийн карт, хэлцлийн хуудасны жижиг харагдацын хэсгүүд (сервер ба клиентэд).
 */

/** Гарчигтай карт-хэсэг. */
export function Section({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink">
          {Icon ? <Icon className="size-4 shrink-0 text-brand-600" aria-hidden /> : null}
          <span className="min-w-0">{title}</span>
        </h2>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("px-4 py-3", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Нэр — утга мөр (dl дотор). Утгагүй бол «—». */
export function InfoRow({ label, children, className }: { label: string; children?: React.ReactNode; className?: string }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div className={cn("flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4", className)}>
      <dt className="text-xs text-muted sm:w-44 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm", empty ? "text-subtle" : "text-ink")}>{empty ? EMPTY_VALUE : children}</dd>
    </div>
  );
}

/** Олон мөрт текст (мөр таслалтыг хадгална). */
export function TextBlock({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return <span className="text-subtle">{EMPTY_VALUE}</span>;
  return <p className={cn("whitespace-pre-line break-words text-sm text-ink", className)}>{text}</p>;
}

/** «Эхнээс / Цааш» хуудаслалт (курсортой). */
export function CursorPager({
  firstHref,
  nextHref,
  className,
}: {
  firstHref?: string | null;
  nextHref?: string | null;
  className?: string;
}) {
  if (!firstHref && !nextHref) return null;
  return (
    <div className={cn("flex items-center justify-between gap-2 pt-3", className)}>
      {firstHref ? (
        <Link
          href={firstHref}
          scroll={false}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:min-h-9"
        >
          <ChevronLeft className="size-4" aria-hidden /> Эхнээс
        </Link>
      ) : (
        <span />
      )}
      {nextHref ? (
        <Link
          href={nextHref}
          scroll={false}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:min-h-9"
        >
          Цааш <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** Жижиг тайлбар мөр (icon + текст). */
export function Note({
  icon: Icon,
  tone = "muted",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "muted" | "amber" | "rose" | "green" | "blue";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    muted: "bg-surface-2 text-muted",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
    green: "bg-emerald-50 text-emerald-800",
    blue: "bg-sky-50 text-sky-800",
  } as const;
  return (
    <p className={cn("flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs", tones[tone], className)}>
      {Icon ? <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Хуудасны гаднах хүрээ (агент/оффис панелд ижил). */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-4 sm:py-6 md:px-6">{children}</div>;
}

/** «Staff › P001 › Дуудлага» гэх мэт зам. */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Зам" className="mb-3 min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden /> : null}
            {it.href ? (
              <Link href={it.href} className="inline-flex min-h-11 min-w-0 items-center font-medium hover:text-brand-700 hover:underline sm:min-h-0">
                <span className="truncate">{it.label}</span>
              </Link>
            ) : (
              <span className="truncate text-ink">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

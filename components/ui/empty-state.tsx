import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Хоосон төлөв (UX-8): юу байхгүйг, яагаад, дараа нь юу хийхийг нэг дор.
 *
 *   <EmptyState
 *     icon={Users}
 *     title="Сэжим алга"
 *     description="Шинэ сэжим бүртгэхэд энд харагдана."
 *     action={{ label: "Сэжим бүртгэх", href: "/agent/crm/leads?new=1" }}
 *   />
 *
 * compact — карт/жагсаалт доторх жижиг хувилбар.
 */
export type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const renderAction = (a: EmptyStateAction, variant: "primary" | "outline") =>
    a.href ? (
      <ButtonLink href={a.href} variant={variant} size="sm">
        {a.label}
      </ButtonLink>
    ) : (
      <Button type="button" variant={variant} size="sm" onClick={a.onClick}>
        {a.label}
      </Button>
    );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-3 py-4" : "gap-2 rounded-2xl border border-dashed border-line px-4 py-10",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-surface-2 text-subtle",
          compact ? "size-8" : "size-11"
        )}
        aria-hidden
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <p className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base")}>{title}</p>
      {description ? (
        <p className={cn("max-w-md text-muted", compact ? "text-xs" : "text-sm")}>{description}</p>
      ) : null}
      {children}
      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action ? renderAction(action, "primary") : null}
          {secondaryAction ? renderAction(secondaryAction, "outline") : null}
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { MASKED_NAME_HINT } from "@/lib/crm2/labels";

/**
 * Харилцагчийн нэр. Харах эрхгүй үед DB нэрийг «Б***» болгож өгдөг —
 * түгжээтэй дүрстэй, тайлбартай харуулна (id ч нуугдсан тул холбоосгүй).
 */
export function MaskedName({
  name,
  visible,
  href,
  className,
}: {
  name: string | null | undefined;
  visible: boolean;
  href?: string | null;
  className?: string;
}) {
  const text = (name ?? "").trim() || "—";
  if (!visible) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-muted", className)} title={MASKED_NAME_HINT}>
        <Lock className="size-3.5 shrink-0" aria-hidden />
        <span>{text}</span>
        <span className="sr-only">({MASKED_NAME_HINT})</span>
      </span>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cn("font-medium text-ink hover:text-brand-700 hover:underline", className)}>
        {text}
      </Link>
    );
  }
  return <span className={cn("font-medium text-ink", className)}>{text}</span>;
}

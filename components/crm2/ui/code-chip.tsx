import Link from "next/link";

import { cn } from "@/lib/utils";
import { CODE_KIND_LABEL, codeKind } from "@/lib/crm2/labels";

/**
 * Объектын код (P001 хөрөнгө, C001 харилцагч, D001 хэлцэл, B001 гэрээ) — моно
 * үсэгтэй жижиг шошго. href өгвөл холбоос.
 */
const KIND_CLASS = {
  property: "border-sky-200 bg-sky-50 text-sky-800",
  contact: "border-emerald-200 bg-emerald-50 text-emerald-800",
  deal: "border-brand-200 bg-brand-50 text-brand-800",
  brokerage: "border-amber-200 bg-amber-50 text-amber-800",
} as const;

export function CodeChip({
  code,
  href,
  className,
  title,
}: {
  code: string | null | undefined;
  href?: string | null;
  className?: string;
  title?: string;
}) {
  if (!code) return null;
  const kind = codeKind(code);
  const classes = cn(
    "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold leading-none tabular-nums",
    kind ? KIND_CLASS[kind] : "border-line bg-surface-2 text-ink",
    // Холбоос бол хүрэх талбарыг босоо чиглэлд томсгоно (харагдах хэмжээ хэвээр, хөрш чиптэй давхцахгүй).
    href &&
      "relative transition after:absolute after:-inset-x-1 after:-inset-y-3 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
    className
  );
  const label = title ?? (kind ? `${CODE_KIND_LABEL[kind]} ${code}` : code);
  return href ? (
    <Link href={href} className={classes} title={label} aria-label={label}>
      {code}
    </Link>
  ) : (
    <span className={classes} title={label}>
      {code}
    </span>
  );
}

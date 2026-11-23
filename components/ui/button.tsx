import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Variant = "primary" | "cta" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "touch" | "md" | "lg";

const variants: Record<Variant, string> = {
  /* text-on-primary / brand-hover: CRM-д цагаан + #ea580c (өмнөхтэй ижил); нийтийн
     сайтад (data-surface="site") ink #f97316 дээр (6.17:1), hover #fb923c (7.64:1). */
  primary: "bg-brand-500 text-on-primary shadow-sm hover:bg-brand-hover",
  /** Сайтын тодорхой CTA: primary + фокусын хүрээний зай. */
  cta: "bg-brand-500 text-on-primary shadow-sm hover:bg-brand-hover focus-visible:ring-offset-2",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  outline: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  /** sm шиг нягт боловч гар утсанд 44px (h-11) — хүрэх талбайн дүрэм; sm+ дэлгэцэд h-9. */
  touch: "h-11 px-3 text-sm gap-1.5 sm:h-9",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-soft";

/** Товчны классууд — <button>/<Link>-ээс өөр элементэд (submit г.м.) ижил загвар өгөх. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  href,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

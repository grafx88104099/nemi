import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Дэд хуудаснаас эх хуудас руу буцах холбоос. */
export function BackLink({
  href = "/account",
  label = "Профайл руу буцах",
  className = "",
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-brand-600 ${className}`}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

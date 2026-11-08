import Link from "next/link";

import { cn } from "@/lib/utils";

/** Агентын долоо хоногийн хоёр хэсэг: Даваагийн карт ба Баасан гарагийн дүн шинжилгээ. */
export function WeekTabs({ week, active, base }: { week: string; active: "plan" | "review"; base: string }) {
  const items = [
    { key: "plan", label: "Даваагийн карт", href: `${base}/${week}` },
    { key: "review", label: "Баасан гарагийн дүн шинжилгээ", href: `${base}/${week}/review` },
  ] as const;
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Долоо хоногийн хэсгүүд">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
            active === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

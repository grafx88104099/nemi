import Link from "next/link";
import { Activity, ListChecks, Repeat, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Ажлын жагсаалтын хэсгийн дэд цэс (утсанд хэвтээ гүйлгэнэ). */
export function WorklistsNav({
  active,
  showVitals,
  base = "/agent/crm/worklists",
}: {
  active: "lists" | "tracks" | "leaderboard" | "vitals";
  showVitals: boolean;
  base?: string;
}) {
  const items = [
    { key: "lists", href: base, label: "Ажлын жагсаалт", icon: ListChecks },
    { key: "tracks", href: `${base}/tracks`, label: "Ажлын цуваа", icon: Repeat },
    { key: "leaderboard", href: `${base}/leaderboard`, label: "Тэргүүлэгчид", icon: Trophy },
    ...(showVitals ? [{ key: "vitals", href: `${base}/vitals`, label: "Ажлын эрүүл мэнд", icon: Activity }] : []),
  ] as const;
  return (
    <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Ажлын жагсаалтын цэс">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
            active === i.key ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-muted hover:bg-surface-2"
          )}
        >
          <i.icon className="size-4" /> {i.label}
        </Link>
      ))}
    </nav>
  );
}

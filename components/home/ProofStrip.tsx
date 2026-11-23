import { Fragment } from "react";

import { manrope } from "@/components/brand/fonts";
import type { PlatformStats } from "@/lib/platform-stats-core";
import { cn } from "@/lib/utils";

/** Босго: үүнээс доош тоо харуулахгүй (жижиг тоо итгэл бууруулна). */
export const PROOF_MIN = 10;

export function proofItems(stats: PlatformStats): { n: number; text: string; prefix?: string }[] {
  const items: { n: number; text: string; prefix?: string }[] = [];
  if (stats.districtsWithListings > 0) items.push({ n: stats.districtsWithListings, text: "дүүрэгт зар" });
  if (stats.verifiedAgents >= PROOF_MIN) items.push({ n: stats.verifiedAgents, text: "баталгаажсан агент" });
  if (stats.new7d >= PROOF_MIN) items.push({ prefix: "Сүүлийн 7 хоногт +", n: stats.new7d, text: "шинэ зар" });
  // Нийт зарын тоо ≥500 болтол ЗОРИУДААР харуулахгүй.
  return items;
}

/**
 * Hero доорх бодит тоо: «6 дүүрэгт зар · 24 баталгаажсан агент · Сүүлийн 7 хоногт +17 шинэ зар».
 * stats null (алдаа) эсвэл зүйлгүй бол юу ч зурахгүй. Count-up анимацгүй.
 */
export function ProofStrip({ stats }: { stats: PlatformStats | null }) {
  if (!stats) return null;
  const items = proofItems(stats);
  if (items.length === 0) return null;
  return (
    <p className={cn(manrope.variable, "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted")}>
      {items.map((it, i) => (
        <Fragment key={it.text}>
          {i > 0 ? <span aria-hidden>·</span> : null}
          <span>
            {it.prefix}
            <span className="font-display font-extrabold text-ink tabular-nums">{it.n}</span> {it.text}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

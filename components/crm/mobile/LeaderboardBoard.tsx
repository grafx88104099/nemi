"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, Trophy } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { LEADERBOARD_METRICS, LEADERBOARD_METRIC_LABEL, type LeaderboardRow } from "@/lib/crm/leaderboard";
import { cn } from "@/lib/utils";

/**
 * Тэргүүлэгчид (R22): шалгагдах үр дүнгийн оноо. ТВ горимд том фонттой,
 * тохиргооны давтамжаар өөрөө шинэчлэгдэнэ. Шимтгэл, орлого гаргахгүй.
 */
export function LeaderboardBoard({
  rows,
  me,
  weights,
  tv,
  refreshSec,
  period,
  range,
}: {
  rows: LeaderboardRow[];
  me: string;
  weights: Record<string, number>;
  tv: boolean;
  refreshSec: number;
  period: "week" | "month";
  range: { from: string; to: string };
}) {
  const router = useRouter();
  useEffect(() => {
    if (!tv) return;
    const t = setInterval(() => router.refresh(), refreshSec * 1000);
    return () => clearInterval(t);
  }, [tv, refreshSec, router]);

  const base = "/agent/crm/worklists/leaderboard";
  return (
    <div className={cn(tv && "min-h-[80vh] rounded-3xl bg-ink p-6 text-white")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["week", "month"] as const).map((p) => (
          <Link
            key={p}
            href={`${base}?period=${p}${tv ? "&tv=1" : ""}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              period === p
                ? tv
                  ? "border-white bg-white text-ink"
                  : "border-brand-300 bg-brand-50 text-brand-700"
                : tv
                  ? "border-white/30 text-white/80"
                  : "border-line text-muted"
            )}
          >
            {p === "week" ? "Энэ долоо хоног" : "Энэ сар"}
          </Link>
        ))}
        <span className={cn("text-xs", tv ? "text-white/60" : "text-muted")}>
          {range.from} — {range.to}
        </span>
        <Link
          href={tv ? `${base}?period=${period}` : `${base}?period=${period}&tv=1`}
          className={cn("ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm", tv ? "text-white/80 hover:bg-white/10" : "text-muted hover:bg-surface-2")}
        >
          <Maximize2 className="size-4" /> {tv ? "Энгийн горим" : "ТВ горим"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="Энэ хугацаанд шалгагдах үр дүн бүртгэгдээгүй" description="Утга бүхий холболт, үзлэг, санал бүртгэгдэхэд оноо гарна." compact />
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.agentId}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5",
                tv ? "border-white/10 bg-white/5" : "border-line bg-surface",
                r.agentId === me && (tv ? "ring-2 ring-amber-300" : "ring-2 ring-brand-200")
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full font-bold tabular-nums",
                  r.rank === 1 ? "bg-amber-400 text-ink" : r.rank === 2 ? "bg-slate-300 text-ink" : r.rank === 3 ? "bg-orange-300 text-ink" : tv ? "bg-white/10" : "bg-surface-2 text-ink",
                  tv && "size-12 text-xl"
                )}
              >
                {r.rank}
              </span>
              <span className={cn("min-w-0 flex-1 truncate font-semibold", tv ? "text-2xl" : "text-sm text-ink")}>
                {r.name}
                {r.agentId === me ? <span className={cn("ml-1 font-normal", tv ? "text-white/60" : "text-muted")}>(та)</span> : null}
              </span>
              <span className="hidden flex-wrap gap-3 text-xs sm:flex">
                {LEADERBOARD_METRICS.map((m) => (
                  <span key={m} className={tv ? "text-white/70" : "text-muted"}>
                    {LEADERBOARD_METRIC_LABEL[m]} <b className={cn("tabular-nums", tv ? "text-white" : "text-ink")}>{r.counts[m]}</b>
                  </span>
                ))}
              </span>
              <span className={cn("shrink-0 font-bold tabular-nums", tv ? "text-3xl" : "text-lg text-ink")}>{r.points}</span>
            </li>
          ))}
        </ol>
      )}

      <p className={cn("mt-3 text-xs", tv ? "text-white/50" : "text-muted")}>
        Оноо: {LEADERBOARD_METRICS.map((m) => `${LEADERBOARD_METRIC_LABEL[m]} × ${weights[m] ?? 0}`).join(" · ")}. Зөвхөн системд
        баталгаажих үр дүн тооцогдоно.
      </p>
    </div>
  );
}

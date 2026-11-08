import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { shortMNT } from "@/lib/format";
import { WEEKLY_METRICS, WEEKLY_TIER_LABEL, type WeeklyMetricDef, type WeeklyTier } from "@/lib/constants-crm-weekly";
import { formatMetricValue, gapRow, type WeeklyValues } from "@/lib/crm/weekly-score";

export type MetricNote = { note: string | null; nextAction: string | null };

/**
 * §9.1 маягт: Үзүүлэлт · Зорилт · Гүйцэтгэл · Зөрүү · Тайлбар. Гүйцэтгэл
 * зөвхөн CRM-ийн бүртгэлээс — энд засах талбар байхгүй.
 */
export function MetricTable({
  actuals,
  targets,
  notes,
  filter = "plan",
  groupByTier = true,
  showNotes = false,
  caption,
}: {
  actuals: WeeklyValues;
  targets: WeeklyValues;
  notes?: Partial<Record<string, MetricNote>>;
  filter?: "plan" | "review" | "all";
  groupByTier?: boolean;
  showNotes?: boolean;
  caption?: string;
}) {
  const defs = WEEKLY_METRICS.filter((m) => (filter === "all" ? true : filter === "plan" ? m.inPlan : m.inReview));
  const tiers: WeeklyTier[] = groupByTier ? ["activity", "pipeline", "closing", "discipline"] : [];
  const groups: { tier: WeeklyTier | null; defs: WeeklyMetricDef[] }[] = groupByTier
    ? tiers.map((t) => ({ tier: t, defs: defs.filter((d) => d.tier === t) })).filter((g) => g.defs.length)
    : [{ tier: null, defs }];

  return (
    <div className="space-y-3">
      {caption ? <p className="text-xs text-subtle">{caption}</p> : null}
      {/* Ширээ */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-2 font-medium">Үзүүлэлт</th>
              <th className="px-2 py-2 text-right font-medium">Зорилт</th>
              <th className="px-2 py-2 text-right font-medium">Гүйцэтгэл</th>
              <th className="px-2 py-2 text-right font-medium">Зөрүү</th>
              {showNotes ? <th className="px-2 py-2 font-medium">Тайлбар, дараагийн үйлдэл</th> : null}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <MetricGroupRows key={g.tier ?? "all"} group={g} actuals={actuals} targets={targets} notes={notes} showNotes={showNotes} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Утас */}
      <div className="space-y-3 md:hidden">
        {groups.map((g) => (
          <div key={g.tier ?? "all"} className="space-y-2">
            {g.tier ? <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{WEEKLY_TIER_LABEL[g.tier]}</p> : null}
            {g.defs.map((m) => {
              const gap = gapRow(actuals[m.code], targets[m.code], m.better);
              const n = notes?.[m.code];
              return (
                <div key={m.code} className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-sm font-medium text-ink">{m.label}</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                    <Cell label="Зорилт" value={formatMetricValue(m.code, targets[m.code], shortMNT)} />
                    <Cell label="Гүйцэтгэл" value={formatMetricValue(m.code, actuals[m.code], shortMNT)} />
                    <Cell label="Зөрүү" value={gapText(m, gap.gap)} tone={gap.met} />
                  </div>
                  {showNotes && (n?.note || n?.nextAction) ? (
                    <p className="mt-2 text-xs text-muted">
                      {n?.note}
                      {n?.nextAction ? <span className="block text-ink">→ {n.nextAction}</span> : null}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricGroupRows({
  group,
  actuals,
  targets,
  notes,
  showNotes,
}: {
  group: { tier: WeeklyTier | null; defs: WeeklyMetricDef[] };
  actuals: WeeklyValues;
  targets: WeeklyValues;
  notes?: Partial<Record<string, MetricNote>>;
  showNotes: boolean;
}) {
  return (
    <>
      {group.tier ? (
        <tr>
          <td colSpan={showNotes ? 5 : 4} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-subtle">
            {WEEKLY_TIER_LABEL[group.tier]}
          </td>
        </tr>
      ) : null}
      {group.defs.map((m) => {
        const gap = gapRow(actuals[m.code], targets[m.code], m.better);
        const n = notes?.[m.code];
        return (
          <tr key={m.code} className="border-b border-line/60 last:border-0">
            <td className="py-2 pr-2 text-ink">
              <span className="inline-flex items-center gap-1">
                {m.label}
                <span title={m.hint} className="text-subtle">
                  <Info className="size-3.5" aria-label={m.hint} />
                </span>
              </span>
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{formatMetricValue(m.code, targets[m.code], shortMNT)}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">
              {formatMetricValue(m.code, actuals[m.code], shortMNT)}
            </td>
            <td
              className={cn(
                "px-2 py-2 text-right tabular-nums",
                gap.met === true ? "text-emerald-700" : gap.met === false ? "text-rose-700" : "text-subtle"
              )}
            >
              {gapText(m, gap.gap)}
            </td>
            {showNotes ? (
              <td className="px-2 py-2 text-xs text-muted">
                {n?.note ?? ""}
                {n?.nextAction ? <span className="block text-ink">→ {n.nextAction}</span> : null}
              </td>
            ) : null}
          </tr>
        );
      })}
    </>
  );
}

function gapText(m: WeeklyMetricDef, gap: number | null): string {
  if (gap == null) return "—";
  const sign = gap > 0 ? "+" : "";
  if (m.unit === "mnt") return `${sign}${shortMNT(gap)}`;
  if (m.unit === "pct") return `${sign}${Math.round(gap)}%`;
  return `${sign}${Math.round(gap * 10) / 10}`;
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: boolean | null }) {
  return (
    <div>
      <p className="text-subtle">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          tone === true ? "text-emerald-700" : tone === false ? "text-rose-700" : "text-ink"
        )}
      >
        {value}
      </p>
    </div>
  );
}

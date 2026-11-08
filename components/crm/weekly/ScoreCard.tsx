import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shortMNT } from "@/lib/format";
import { SCORE_COMPONENT_LABEL, STAGE_ADVANCES_LABEL, WEEKLY_METRIC_BY_CODE } from "@/lib/constants-crm-weekly";
import { formatMetricValue, type WeeklyScore } from "@/lib/crm/weekly-score";

const KIND_LABEL = {
  live: { label: "Одоогийн байдлаар", tone: "blue" as const },
  preliminary: { label: "Урьдчилсан", tone: "amber" as const },
  final: { label: "Эцсийн", tone: "green" as const },
};

export function scoreTone(total: number): "green" | "amber" | "rose" {
  return total >= 80 ? "green" : total >= 50 ? "amber" : "rose";
}

/** §6.25 Агентын долоо хоногийн үнэлгээний хуудас — 6 бүрэлдэхүүн, 100 оноо. */
export function ScoreCard({
  score,
  kind,
  title = "Долоо хоногийн үнэлгээ",
}: {
  score: WeeklyScore;
  kind: "live" | "preliminary" | "final";
  title?: string;
}) {
  const k = KIND_LABEL[kind];
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <Badge tone={k.tone}>{k.label}</Badge>
          <span className="ml-auto text-2xl font-extrabold tabular-nums text-ink">
            {score.total}
            <span className="text-sm font-medium text-muted">/100</span>
          </span>
        </div>
        <div className="space-y-2.5">
          {score.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="text-ink">{SCORE_COMPONENT_LABEL[c.key]}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted">
                  {c.points == null ? "Хамааралгүй" : `${c.points} / ${c.weight}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div
                  className={cn("h-1.5 rounded-full", c.points == null ? "bg-line" : "bg-brand-500")}
                  style={{ width: `${c.points == null || c.weight === 0 ? 0 : Math.round((c.points / c.weight) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-subtle">
                {c.parts
                  .map((p) => {
                    const label = p.code === "stage_advances" ? STAGE_ADVANCES_LABEL : WEEKLY_METRIC_BY_CODE[p.code].label;
                    const a = formatMetricValue(p.code, p.actual, shortMNT);
                    return p.target != null ? `${label} ${a}/${formatMetricValue(p.code, p.target, shortMNT)}` : `${label} ${a}`;
                  })
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-subtle">
          Гүйцэтгэл CRM-ийн бүртгэлээс автоматаар тооцогдоно; гараар засах боломжгүй. Алдсан хэлцэл оноо өгөхгүй.
          {score.rescaled ? " Хамааралгүй хэсгийн жинг бусад хэсэгт хувь тэнцүүлэн шилжүүлсэн." : ""}
        </p>
      </CardBody>
    </Card>
  );
}

/** Самбарын мөрийн оноо: идэвхтэй ажилгүй агентыг үнэлэхгүй (§6.25 хүрээ). */
export function ScoreBadge({ total, scored, className }: { total: number; scored: boolean; className?: string }) {
  if (!scored)
    return (
      <span title="Нээлттэй сэжим, боломжгүй тул энэ долоо хоногт үнэлэхгүй">
        <Badge tone="neutral" className={className}>
          Үнэлэхгүй
        </Badge>
      </span>
    );
  return (
    <Badge tone={scoreTone(total)} className={className}>
      {total}
    </Badge>
  );
}

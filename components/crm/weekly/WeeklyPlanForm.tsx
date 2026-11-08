"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2 } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { shortMNT } from "@/lib/format";
import {
  CARD_TARGET_CODES,
  WEEKLY_METRICS,
  WEEKLY_METRIC_BY_CODE,
  WEEKLY_TIER_LABEL,
  weeklyStatusLabel,
  type WeeklyMetricCode,
} from "@/lib/constants-crm-weekly";
import { formatMetricValue, type WeeklyValues } from "@/lib/crm/weekly-score";
import { saveWeeklyPlan, submitWeeklyPlan, type WeeklyPlanInput } from "@/lib/actions/crm-weekly";
import type { OppOption, PlanDetail } from "@/lib/queries-crm-weekly";

type Slot = { opportunityId: string; text: string };
type Obstacle = { obstacleId: string; text: string };

const textareaCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60";

/**
 * §6.21 Даваа гарагийн долоо хоногийн төлөвлөгөөний карт. Агент зөвхөн
 * зорилт, жагсаалт, тайлбараа бөглөнө; гүйцэтгэл системээс.
 */
export function WeeklyPlanForm({
  plan,
  editable,
  agentLine,
  oppOptions,
  obstacleOptions,
  defaults,
  prevActuals,
}: {
  plan: PlanDetail;
  editable: boolean;
  agentLine: string;
  oppOptions: OppOption[];
  obstacleOptions: { id: string; label: string }[];
  defaults: WeeklyValues;
  prevActuals?: WeeklyValues | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState(plan.last_week_summary ?? "");
  const [support, setSupport] = useState(plan.support_needed ?? "");
  const [commitment, setCommitment] = useState(plan.commitment ?? "");
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(plan.targets)) if (v?.target != null) out[k] = String(v.target);
    return out;
  });
  const [deals, setDeals] = useState<Slot[]>(() => slots(plan, "top_deal"));
  const [priorities, setPriorities] = useState<Slot[]>(() => slots(plan, "priority"));
  const [obstacles, setObstacles] = useState<Obstacle[]>(() =>
    plan.items
      .filter((i) => i.kind === "obstacle")
      .map((i) => ({ obstacleId: i.obstacle_id ?? "", text: i.text ?? "" }))
  );
  const status = weeklyStatusLabel(plan.status);
  const otherCodes = useMemo(
    () => WEEKLY_METRICS.filter((m) => !CARD_TARGET_CODES.includes(m.code)).map((m) => m.code),
    []
  );
  const oppLabel = (id: string) => {
    const o = oppOptions.find((x) => x.id === id);
    if (o) return [o.label, o.stage].filter(Boolean).join(" · ");
    return plan.items.find((i) => i.opportunity_id === id)?.opportunity_label ?? "Боломж";
  };

  function payload(): WeeklyPlanInput {
    const t: Record<string, number | null> = {};
    for (const code of [...CARD_TARGET_CODES, ...otherCodes]) {
      const raw = (targets[code] ?? "").trim();
      t[code] = raw === "" ? null : Number(raw);
    }
    return {
      lastWeekSummary: summary.trim() || null,
      supportNeeded: support.trim() || null,
      commitment: commitment.trim() || null,
      targets: t,
      topDeals: deals.filter((d) => d.opportunityId).map((d) => ({ opportunityId: d.opportunityId, text: d.text.trim() || null })),
      priorities: priorities
        .filter((p) => p.text.trim())
        .map((p) => ({ text: p.text.trim(), opportunityId: p.opportunityId || null })),
      obstacles: obstacles.filter((o) => o.obstacleId).map((o) => ({ obstacleId: o.obstacleId, text: o.text.trim() || null })),
    };
  }

  function invalidNumber(): string | null {
    for (const [code, raw] of Object.entries(targets)) {
      if (raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        const m = WEEKLY_METRIC_BY_CODE[code as WeeklyMetricCode];
        return `${m?.label ?? "Зорилт"}: зөв тоо оруулна уу.`;
      }
    }
    return null;
  }

  function save(thenSubmit: boolean) {
    const bad = invalidNumber();
    if (bad) {
      toast.error(bad);
      return;
    }
    start(async () => {
      const r = await saveWeeklyPlan(plan.id, payload());
      if (!r.ok) {
        toast.error(r.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      if (thenSubmit) {
        const s = await submitWeeklyPlan(plan.id);
        if (!s.ok) {
          toast.error(s.error ?? "Илгээхэд алдаа гарлаа.");
          router.refresh();
          return;
        }
        toast.success("Карт батлуулахаар илгээгдлээ.");
      } else toast.success("Хадгаллаа.");
      router.refresh();
    });
  }

  const targetInput = (code: WeeklyMetricCode, label?: string) => {
    const m = WEEKLY_METRIC_BY_CODE[code];
    const prev = prevActuals?.[code];
    const hint = [
      prev != null ? `Өнгөрсөн долоо хоногт: ${formatMetricValue(code, prev, shortMNT)}` : null,
      defaults[code] != null ? `Жишиг: ${formatMetricValue(code, defaults[code], shortMNT)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <Field key={code} label={label ?? m.label} htmlFor={`t-${code}`} hint={hint || undefined}>
        {editable ? (
          <Input
            id={`t-${code}`}
            inputMode="decimal"
            value={targets[code] ?? ""}
            placeholder={defaults[code] != null ? String(defaults[code]) : ""}
            onChange={(e) => setTargets((s) => ({ ...s, [code]: e.target.value }))}
          />
        ) : (
          <p className="text-sm font-semibold tabular-nums text-ink">
            {formatMetricValue(code, plan.targets[code]?.target ?? null, shortMNT)}
          </p>
        )}
      </Field>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">Даваа гарагийн төлөвлөгөөний карт</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="ml-auto text-xs text-muted">{agentLine}</span>
          </div>
          {plan.status === "returned" && plan.return_note ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Ахлагчийн тайлбар: {plan.return_note}
            </p>
          ) : null}
          {plan.status === "approved" && plan.approved_by_name ? (
            <p className="text-xs text-muted">Баталсан: {plan.approved_by_name}</p>
          ) : null}

          <Field label="Өнгөрсөн долоо хоногийн үр дүнгийн хураангуй" htmlFor="summary" hint="Өнгөрсөн долоо хоногийн CRM-ийн тоогоор урьдчилан бөглөгдсөн — засаж болно.">
            {editable ? (
              <textarea id="summary" rows={3} className={textareaCls} value={summary} onChange={(e) => setSummary(e.target.value)} />
            ) : (
              <p className="whitespace-pre-line text-sm text-ink">{plan.last_week_summary || "—"}</p>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CARD_TARGET_CODES.map((code) => targetInput(code, WEEKLY_METRIC_BY_CODE[code].cardLabel))}
          </div>

          <details className="rounded-xl border border-line p-3" open={!editable ? false : undefined}>
            <summary className="cursor-pointer text-sm font-medium text-ink">Бусад үзүүлэлтийн зорилт</summary>
            <div className="mt-3 space-y-4">
              {(["activity", "pipeline", "closing", "discipline"] as const).map((tier) => {
                const codes = otherCodes.filter((c) => WEEKLY_METRIC_BY_CODE[c].tier === tier);
                if (!codes.length) return null;
                return (
                  <div key={tier}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{WEEKLY_TIER_LABEL[tier]}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{codes.map((c) => targetInput(c))}</div>
                  </div>
                );
              })}
            </div>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Хаах боломжтой шилдэг 3 хэлцэл</h3>
          {oppOptions.length === 0 && editable ? (
            <p className="text-sm text-muted">Нээлттэй боломж алга — урсгалаас боломж үүсгэсний дараа энд сонгогдоно.</p>
          ) : null}
          <div className="space-y-2">
            {deals.map((d, i) => (
              <div key={`deal-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[2rem_1fr_1fr] sm:items-center">
                <span className="text-sm font-semibold text-muted">{i + 1}.</span>
                {editable ? (
                  <>
                    <Select
                      aria-label={`Хэлцэл ${i + 1}`}
                      value={d.opportunityId}
                      onChange={(e) => setDeals((s) => s.map((x, j) => (j === i ? { ...x, opportunityId: e.target.value } : x)))}
                    >
                      <option value="">Боломж сонгох</option>
                      {oppOptions.map((o) => (
                        <option key={o.id} value={o.id} disabled={deals.some((x, j) => j !== i && x.opportunityId === o.id)}>
                          {[o.label, o.stage, o.amount != null ? shortMNT(o.amount) : null].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Хэлцэл ${i + 1}-ийн тэмдэглэл`}
                      placeholder="Энэ долоо хоногт юу хийх вэ"
                      value={d.text}
                      onChange={(e) => setDeals((s) => s.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                  </>
                ) : (
                  <p className="text-sm text-ink sm:col-span-2">
                    {d.opportunityId ? oppLabel(d.opportunityId) : "—"}
                    {d.text ? <span className="text-muted"> — {d.text}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </div>

          <h3 className="pt-2 text-sm font-semibold text-ink">Тэргүүлэх 3 ажил</h3>
          <div className="space-y-2">
            {priorities.map((p, i) => (
              <div key={`prio-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[2rem_1fr_16rem] sm:items-center">
                <span className="text-sm font-semibold text-muted">{i + 1}.</span>
                {editable ? (
                  <>
                    <Input
                      aria-label={`Тэргүүлэх ажил ${i + 1}`}
                      placeholder="Заавал урагшлуулах ажил"
                      value={p.text}
                      onChange={(e) => setPriorities((s) => s.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <Select
                      aria-label={`Тэргүүлэх ажил ${i + 1}-ийн боломж`}
                      value={p.opportunityId}
                      onChange={(e) => setPriorities((s) => s.map((x, j) => (j === i ? { ...x, opportunityId: e.target.value } : x)))}
                    >
                      <option value="">Боломжтой холбохгүй</option>
                      {oppOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </>
                ) : (
                  <p className="text-sm text-ink sm:col-span-2">
                    {p.text || "—"}
                    {p.opportunityId ? <span className="text-muted"> · {oppLabel(p.opportunityId)}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <h3 className="text-sm font-semibold text-ink">Саад</h3>
            {editable && obstacles.length < 6 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setObstacles((s) => [...s, { obstacleId: "", text: "" }])}
              >
                <Plus className="size-4" /> Саад нэмэх
              </Button>
            ) : null}
          </div>
          {obstacles.length === 0 ? (
            <p className="text-sm text-muted">Саад бүртгээгүй.</p>
          ) : (
            <div className="space-y-2">
              {obstacles.map((o, i) => (
                <div key={`obs-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-center">
                  {editable ? (
                    <>
                      <Select
                        aria-label="Саадын ангилал"
                        value={o.obstacleId}
                        onChange={(e) => setObstacles((s) => s.map((x, j) => (j === i ? { ...x, obstacleId: e.target.value } : x)))}
                      >
                        <option value="">Ангилал сонгох</option>
                        {obstacleOptions.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        aria-label="Саадын тайлбар"
                        placeholder="Юу саад болж байна, ямар дэмжлэг хэрэгтэй"
                        value={o.text}
                        onChange={(e) => setObstacles((s) => s.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Саад хасах"
                        onClick={() => setObstacles((s) => s.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-ink sm:col-span-3">
                      <Badge tone="amber">{obstacleOptions.find((x) => x.id === o.obstacleId)?.label ?? "Саад"}</Badge>{" "}
                      {o.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Field label="Шаардлагатай дэмжлэг" htmlFor="support">
            {editable ? (
              <textarea id="support" rows={2} className={textareaCls} value={support} onChange={(e) => setSupport(e.target.value)} />
            ) : (
              <p className="whitespace-pre-line text-sm text-ink">{plan.support_needed || "—"}</p>
            )}
          </Field>
          <Field label="Агентын амлалт" htmlFor="commitment" hint="Долоо хоногийн хамгийн чухал, хэмжигдэхүйц амлалт.">
            {editable ? (
              <Input id="commitment" value={commitment} onChange={(e) => setCommitment(e.target.value)} />
            ) : (
              <p className="text-sm font-medium text-ink">{plan.commitment || "—"}</p>
            )}
          </Field>

          {editable ? (
            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
                Хадгалах
              </Button>
              <Button type="button" disabled={pending} onClick={() => save(true)}>
                <Send className="size-4" /> Батлуулахаар илгээх
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function slots(plan: PlanDetail, kind: "top_deal" | "priority"): Slot[] {
  const out: Slot[] = [0, 1, 2].map(() => ({ opportunityId: "", text: "" }));
  for (const i of plan.items.filter((x) => x.kind === kind)) {
    if (i.position >= 1 && i.position <= 3) out[i.position - 1] = { opportunityId: i.opportunity_id ?? "", text: i.text ?? "" };
  }
  return out;
}

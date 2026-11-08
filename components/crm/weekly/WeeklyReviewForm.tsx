"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, shortMNT } from "@/lib/format";
import { MOVE_KIND_LABEL, WEEKLY_METRICS, weeklyStatusLabel, type MoveKind } from "@/lib/constants-crm-weekly";
import { formatMetricValue, gapRow, type MoveSummary, type WeeklyValues } from "@/lib/crm/weekly-score";
import { saveWeeklyReview, submitWeeklyReview, type WeeklyReviewInput } from "@/lib/actions/crm-weekly";
import type { LostReasonCount, OppOption, OverdueStepRow, PlanDetail } from "@/lib/queries-crm-weekly";

const textareaCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60";

type Notes = Record<string, { note: string; nextAction: string }>;
type Carry = { opportunityId: string; text: string };

/**
 * §6.24 Баасан гараг — долоо хоногийн төгсгөлийн дүн шинжилгээ, §9.1 маягт.
 * Гүйцэтгэл системээс; агент тайлбар, сургамж, шилжих ажлаа бичнэ.
 */
export function WeeklyReviewForm({
  plan,
  editable,
  actuals,
  targets,
  moves,
  conversions,
  overdue,
  lostReasons,
  oppOptions,
}: {
  plan: PlanDetail;
  editable: boolean;
  actuals: WeeklyValues;
  targets: WeeklyValues;
  moves: MoveSummary;
  conversions: { label: string; pct: number | null }[];
  overdue: OverdueStepRow[];
  lostReasons: LostReasonCount[];
  oppOptions: OppOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = plan.review;
  const [f, setF] = useState({
    achievedNote: r?.achieved_note ?? "",
    missedNote: r?.missed_note ?? "",
    conversionNote: r?.conversion_note ?? "",
    movementNote: r?.movement_note ?? "",
    overdueReason: r?.overdue_reason ?? "",
    recoveryAction: r?.recovery_action ?? "",
    lostNote: r?.lost_note ?? "",
    revenueNote: r?.revenue_note ?? "",
    lessons: r?.lessons ?? "",
  });
  const [notes, setNotes] = useState<Notes>(() => {
    const out: Notes = {};
    for (const [k, v] of Object.entries(plan.targets)) out[k] = { note: v?.review_note ?? "", nextAction: v?.next_action ?? "" };
    return out;
  });
  const [carry, setCarry] = useState<Carry[]>(() => {
    const out: Carry[] = [0, 1, 2].map(() => ({ opportunityId: "", text: "" }));
    for (const i of plan.items.filter((x) => x.kind === "carry")) {
      if (i.position >= 1 && i.position <= 3) out[i.position - 1] = { opportunityId: i.opportunity_id ?? "", text: i.text ?? "" };
    }
    return out;
  });
  const status = weeklyStatusLabel(r?.status ?? "draft");
  const reviewDefs = WEEKLY_METRICS.filter((m) => m.inReview);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  function payload(): WeeklyReviewInput {
    const metricNotes: WeeklyReviewInput["metricNotes"] = {};
    for (const [code, v] of Object.entries(notes)) {
      metricNotes[code] = { note: v.note.trim() || null, nextAction: v.nextAction.trim() || null };
    }
    return {
      achievedNote: f.achievedNote.trim() || null,
      missedNote: f.missedNote.trim() || null,
      conversionNote: f.conversionNote.trim() || null,
      movementNote: f.movementNote.trim() || null,
      overdueReason: f.overdueReason.trim() || null,
      recoveryAction: f.recoveryAction.trim() || null,
      lostNote: f.lostNote.trim() || null,
      revenueNote: f.revenueNote.trim() || null,
      lessons: f.lessons.trim() || null,
      metricNotes,
      carry: carry
        .filter((c) => c.opportunityId || c.text.trim())
        .map((c) => ({ opportunityId: c.opportunityId || null, text: c.text.trim() || null })),
    };
  }

  function save(thenSubmit: boolean) {
    start(async () => {
      const res = await saveWeeklyReview(plan.id, payload());
      if (!res.ok) {
        toast.error(res.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      if (thenSubmit) {
        const s = await submitWeeklyReview(plan.id);
        if (!s.ok) {
          toast.error(s.error ?? "Илгээхэд алдаа гарлаа.");
          router.refresh();
          return;
        }
        toast.success("Дүн шинжилгээ илгээгдлээ. Дараагийн долоо хоногийн карт бэлтгэгдсэн.");
      } else toast.success("Хадгаллаа.");
      router.refresh();
    });
  }

  const dominant = lostReasons[0] ?? null;
  const ta = (k: keyof typeof f, label: string, hint?: string, rows = 2) => (
    <Field label={label} htmlFor={`rv-${k}`} hint={hint}>
      {editable ? (
        <textarea id={`rv-${k}`} rows={rows} className={textareaCls} value={f[k]} onChange={set(k)} />
      ) : (
        <p className="whitespace-pre-line text-sm text-ink">{f[k] || "—"}</p>
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">Төлөвлөгөө ба гүйцэтгэл</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {r?.status === "returned" && r.return_note ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Ахлагчийн тайлбар: {r.return_note}</p>
          ) : null}
          <div className="space-y-2">
            {reviewDefs.map((m) => {
              const g = gapRow(actuals[m.code], targets[m.code], m.better);
              const n = notes[m.code] ?? { note: "", nextAction: "" };
              const needNote = g.met === false;
              return (
                <div key={m.code} className={cn("rounded-xl border p-3", needNote ? "border-rose-200 bg-rose-50/40" : "border-line")}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium text-ink">{m.label}</span>
                    <span className="text-muted">
                      Зорилт <b className="tabular-nums text-ink">{formatMetricValue(m.code, targets[m.code], shortMNT)}</b>
                    </span>
                    <span className="text-muted">
                      Гүйцэтгэл <b className="tabular-nums text-ink">{formatMetricValue(m.code, actuals[m.code], shortMNT)}</b>
                    </span>
                    <span className={cn("tabular-nums", g.met === true ? "text-emerald-700" : g.met === false ? "text-rose-700" : "text-subtle")}>
                      {g.met === true ? "Биелсэн" : g.met === false ? "Биелээгүй" : "Зорилтгүй"}
                    </span>
                  </div>
                  {editable ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={`${m.label}: тайлбар`}
                        placeholder={needNote ? "Яагаад биелээгүй вэ (заавал)" : "Тайлбар"}
                        value={n.note}
                        onChange={(e) => setNotes((s) => ({ ...s, [m.code]: { ...n, note: e.target.value } }))}
                      />
                      <Input
                        aria-label={`${m.label}: дараагийн үйлдэл`}
                        placeholder={needNote ? "Дараагийн үйлдэл (заавал)" : "Дараагийн үйлдэл"}
                        value={n.nextAction}
                        onChange={(e) => setNotes((s) => ({ ...s, [m.code]: { ...n, nextAction: e.target.value } }))}
                      />
                    </div>
                  ) : n.note || n.nextAction ? (
                    <p className="mt-1 text-xs text-muted">
                      {n.note}
                      {n.nextAction ? <span className="block text-ink">→ {n.nextAction}</span> : null}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ta("achievedNote", "Юуг биелүүлсэн бэ")}
            {ta("missedNote", "Юуг биелүүлж чадаагүй вэ")}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Шатлал — хөрвөлт</h3>
            <div className="space-y-1.5">
              {conversions.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-sm">
                  <span className="text-ink">{c.label}</span>
                  <span className="ml-auto tabular-nums font-semibold">{c.pct == null ? "—" : `${c.pct}%`}</span>
                </div>
              ))}
            </div>
            {ta("conversionNote", "Хөрвөлтийн дүгнэлт")}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Урсгалын хөдөлгөөн</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MOVE_KIND_LABEL) as MoveKind[]).map((k) => (
                <Badge key={k} tone={MOVE_KIND_LABEL[k].tone}>
                  {MOVE_KIND_LABEL[k].label}: {moves[k]}
                </Badge>
              ))}
            </div>
            {ta("movementNote", "Хөдөлгөөний дүгнэлт")}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Хугацаа хэтэрсэн эргэн холбогдолт ({overdue.length})</h3>
            {overdue.length === 0 ? (
              <EmptyState compact title="Хугацаа хэтэрсэн алхам алга" description="Энэ долоо хоногт бүх дараагийн үйлдэл хугацаандаа байна." />
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                {overdue.map((o) => (
                  <li key={`${o.entity}-${o.entity_id}-${o.due_on}`} className="flex items-center gap-2">
                    <Link href={o.href} className="truncate font-medium text-brand-700 hover:underline">
                      {o.label}
                    </Link>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {fmtDate(o.due_on)} {o.resolved_at ? "· хожимдож хийсэн" : "· хүлээгдэж буй"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ta("overdueReason", "Яагаад хэтэрсэн бэ")}
            {ta("recoveryAction", "Нөхөн сэргээх арга хэмжээ")}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Алдсан хэлцэл</h3>
            {lostReasons.length === 0 ? (
              <p className="text-sm text-muted">Энэ долоо хоногт амжилтгүй хаагдсан хэлцэл алга.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lostReasons.map((l) => (
                  <li key={l.label} className="flex items-center gap-2">
                    <span className="text-ink">{l.label}</span>
                    {dominant?.label === l.label ? <Badge tone="rose">Давамгай</Badge> : null}
                    <span className="ml-auto tabular-nums font-semibold">{l.cnt}</span>
                  </li>
                ))}
              </ul>
            )}
            {ta("lostNote", "Алдсан шалтгааны сургамж")}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Орлого</h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Баталгаажсан орлого" value={formatMetricValue("revenue", actuals.revenue, shortMNT)} />
              <Stat label="Хаасан хэлцэл" value={formatMetricValue("closed_deals", actuals.closed_deals, shortMNT)} />
              <Stat label="Хүлээгдэж буй цэвэр орлого" value={formatMetricValue("expected_net_fee", actuals.expected_net_fee, shortMNT)} />
            </div>
            {ta("revenueNote", "Орлогын тайлбар")}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Сургамж</h3>
            {ta("lessons", "Ямар эсэргүүцэл, процесс дээр сайжрах вэ", undefined, 3)}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Дараагийн долоо хоногт шилжих тэргүүлэх 3 боломж</h3>
          <p className="text-xs text-subtle">Эдгээр нь дараагийн Даваа гарагийн картын шилдэг хэлцэл, тэргүүлэх ажил болж эхэлнэ.</p>
          {carry.map((c, i) => (
            <div key={`carry-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[2rem_1fr_1fr] sm:items-center">
              <span className="text-sm font-semibold text-muted">{i + 1}.</span>
              {editable ? (
                <>
                  <Select
                    aria-label={`Шилжих боломж ${i + 1}`}
                    value={c.opportunityId}
                    onChange={(e) => setCarry((s) => s.map((x, j) => (j === i ? { ...x, opportunityId: e.target.value } : x)))}
                  >
                    <option value="">Боломж сонгох</option>
                    {oppOptions.map((o) => (
                      <option key={o.id} value={o.id} disabled={carry.some((x, j) => j !== i && x.opportunityId === o.id)}>
                        {[o.label, o.stage].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Шилжих боломж ${i + 1}-ийн тайлбар`}
                    placeholder="Дараагийн долоо хоногт юу хийх"
                    value={c.text}
                    onChange={(e) => setCarry((s) => s.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                </>
              ) : (
                <p className="text-sm text-ink sm:col-span-2">
                  {plan.items.find((x) => x.kind === "carry" && x.position === i + 1)?.opportunity_label ?? (c.text ? "" : "—")}
                  {c.text ? <span className="text-muted"> {c.text}</span> : null}
                </p>
              )}
            </div>
          ))}
          {r?.coaching_need ? (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Дадлагажуулалт: {r.coaching_need}
              {r.coaching_at ? ` · ${fmtDateTime(r.coaching_at)}` : ""}
            </p>
          ) : null}
          {editable ? (
            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
                Хадгалах
              </Button>
              <Button type="button" disabled={pending} onClick={() => save(true)}>
                <Send className="size-4" /> Илгээх
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

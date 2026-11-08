"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, ExternalLink, Printer, Wrench, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  assignQualityFix,
  cancelQualityAudit,
  completeQualityAudit,
  reviewQualityItem,
} from "@/lib/actions/crm-quality";
import {
  AUDIT_SCOPE_LABEL,
  AUDIT_STATUS_LABEL,
  QUALITY_CRITERIA,
  QUALITY_CRITERION_LABEL,
  QUALITY_ENTITY_LABEL,
  QUALITY_RESULT_LABEL,
  qualityEntityHref,
  scoreByCriterion,
  type QualityResult,
} from "@/lib/crm/quality";
import type { QualityAuditDetail, QualityAuditItem } from "@/lib/queries-crm-kpi";

const TASK_STATUS_LABEL: Record<string, { label: string; tone: "amber" | "green" | "neutral" | "blue" }> = {
  pending: { label: "Засах даалгавар: хүлээгдэж буй", tone: "amber" },
  in_progress: { label: "Засах даалгавар: хийгдэж буй", tone: "blue" },
  completed: { label: "Засагдсан", tone: "green" },
  deferred: { label: "Засах даалгавар: хойшилсон", tone: "neutral" },
};

/**
 * Чанарын аудитын дэлгэрэнгүй (§6.29): шалгуур бүрийн түүвэр, автомат
 * шалгалтын шалтгаан, аудиторын гар баталгаа, засах даалгавар, дүгнэлт.
 * Хаагдсан аудит зөвхөн уншигдана (DB түгжинэ).
 */
export function AuditDetailShell({
  audit,
  canRun,
  passScore,
}: {
  audit: QualityAuditDetail;
  canRun: boolean;
  passScore: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editable = canRun && audit.status === "in_review";
  const [noteFor, setNoteFor] = useState<{ item: QualityAuditItem; result: QualityResult } | null>(null);
  const [note, setNote] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [acceptRest, setAcceptRest] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [filter, setFilter] = useState<"all" | "fail" | "open">("all");

  const byCriterion = useMemo(() => scoreByCriterion(audit.items), [audit.items]);
  const live = audit.score_live;
  const finalScore = audit.score;

  function review(item: QualityAuditItem, result: QualityResult, n?: string) {
    // Автомат дүнгээс өөр бол тайлбар заавал (DB давхар шалгана).
    if (result !== item.auto_result && n === undefined) {
      setNote(item.note ?? "");
      setNoteFor({ item, result });
      return;
    }
    start(async () => {
      const res = await reviewQualityItem({ itemId: item.id, result, note: n });
      if (!res.ok) {
        toast.error(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      setNoteFor(null);
      router.refresh();
    });
  }

  function assignFix(item: QualityAuditItem) {
    start(async () => {
      const res = await assignQualityFix({ itemId: item.id });
      if (!res.ok) {
        toast.error(res.error ?? "Даалгавар үүсгэж чадсангүй.");
        return;
      }
      toast.success("Засах даалгавар оноогдож, агентад мэдэгдлээ");
      router.refresh();
    });
  }

  function complete() {
    start(async () => {
      const res = await completeQualityAudit({ auditId: audit.id, summary, acceptRest });
      if (!res.ok) {
        toast.error(res.error ?? "Дуусгаж чадсангүй.");
        return;
      }
      toast.success(`Аудит дууслаа${res.score != null ? ` — оноо ${res.score}` : ""}`);
      setCompleteOpen(false);
      router.refresh();
    });
  }

  function cancel() {
    start(async () => {
      const res = await cancelQualityAudit({ auditId: audit.id, reason: cancelReason });
      if (!res.ok) {
        toast.error(res.error ?? "Цуцалж чадсангүй.");
        return;
      }
      toast.info("Аудит цуцлагдлаа");
      setCancelOpen(false);
      router.refresh();
    });
  }

  const st = AUDIT_STATUS_LABEL[audit.status] ?? { label: audit.status, tone: "neutral" as const };
  const shown = audit.items.filter((i) =>
    filter === "all" ? true : filter === "open" ? i.result == null : (i.result ?? i.auto_result) === "fail"
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="print:hidden">
            <BackLink href="/office/crm/quality" label="Аудитын жагсаалт руу" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-ink">CRM-ийн чанарын аудит</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="text-sm text-muted">
            {audit.period_start.replaceAll("-", ".")} – {audit.period_end.replaceAll("-", ".")} ·{" "}
            {AUDIT_SCOPE_LABEL[audit.scope] ?? ""}
            {audit.scope_label ? `: ${audit.scope_label}` : ""} · Аудитор: {audit.auditor_name ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Хэвлэх
          </Button>
          {editable && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)} disabled={pending}>
                Цуцлах
              </Button>
              <Button size="sm" onClick={() => setCompleteOpen(true)} disabled={pending || audit.items.length === 0}>
                <CheckCircle2 className="size-4" /> Аудит дуусгах
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs text-muted">{finalScore != null ? "Аудитын оноо" : "Урьдчилсан оноо"}</p>
            <p
              className={
                "text-3xl font-extrabold tabular-nums " +
                ((finalScore ?? live.provisional ?? 0) >= passScore ? "text-emerald-700" : "text-danger")
              }
            >
              {finalScore ?? live.provisional ?? "—"}
            </p>
            <p className="text-xs text-subtle">Тэнцэх оноо {passScore}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Тэнцсэн</p>
            <p className="text-2xl font-bold tabular-nums text-ink">{live.passed}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Тэнцээгүй</p>
            <p className="text-2xl font-bold tabular-nums text-danger">{live.failed}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Хянаагүй</p>
            <p className="text-2xl font-bold tabular-nums text-amber-700">{live.open}</p>
          </CardBody>
        </Card>
      </div>

      {audit.summary && (
        <Card>
          <CardBody>
            <p className="text-sm font-semibold text-ink">Аудиторын дүгнэлт</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{audit.summary}</p>
          </CardBody>
        </Card>
      )}
      {audit.cancel_reason && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">Цуцалсан шалтгаан: {audit.cancel_reason}</p>
      )}

      {/* Шалгуур бүрийн хураангуй */}
      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-semibold text-ink">Шалгуур бүрээр</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Шалгах зүйл</th>
                  <th className="py-1.5 pr-3">Тэнцэх нөхцөл</th>
                  <th className="py-1.5 pr-3 text-right">Нийт бүртгэл</th>
                  <th className="py-1.5 pr-3 text-right">Автомат тэнцсэн</th>
                  <th className="py-1.5 text-right">Түүврийн оноо</th>
                </tr>
              </thead>
              <tbody>
                {QUALITY_CRITERIA.map((c) => {
                  const pop = audit.population[c];
                  const s = byCriterion[c];
                  const popPct = pop && pop.total > 0 ? Math.round((1000 * pop.passed) / pop.total) / 10 : null;
                  return (
                    <tr key={c} className="border-t border-line">
                      <td className="py-1.5 pr-3 font-medium text-ink">{QUALITY_CRITERION_LABEL[c].label}</td>
                      <td className="py-1.5 pr-3 text-muted">{QUALITY_CRITERION_LABEL[c].pass}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{pop?.total ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{popPct == null ? "—" : `${popPct}%`}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.score ?? s.provisional ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Түүврийн мөрүүд */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(
          [
            ["all", `Бүгд (${audit.items.length})`],
            ["fail", `Тэнцээгүй (${audit.items.filter((i) => (i.result ?? i.auto_result) === "fail").length})`],
            ["open", `Хянаагүй (${live.open})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold " +
              (filter === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-surface text-muted")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {audit.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Түүвэрт бүртгэл ороогүй"
          description="Сонгосон хүрээ, хугацаанд шалгах бүртгэл олдсонгүй. Хүрээгээ өргөтгөж дахин эхлүүлнэ үү."
        />
      ) : shown.length === 0 ? (
        <EmptyState compact title="Энэ шүүлтэд мөр алга" />
      ) : (
        <div className="space-y-5">
          {QUALITY_CRITERIA.filter((c) => shown.some((i) => i.criterion === c)).map((c) => (
            <section key={c} className="space-y-2">
              <h2 className="text-sm font-bold text-ink">
                {QUALITY_CRITERION_LABEL[c].label}
                <span className="ml-2 font-normal text-muted">— {QUALITY_CRITERION_LABEL[c].pass}</span>
              </h2>
              <ul className="grid gap-2">
                {shown
                  .filter((i) => i.criterion === c)
                  .map((i) => {
                    const effective = i.result ?? i.auto_result;
                    const href = qualityEntityHref(i.entity, i.entity_id, "/office/crm");
                    return (
                      <li key={i.id} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                              <span className="text-xs text-subtle">{QUALITY_ENTITY_LABEL[i.entity] ?? "Бүртгэл"}</span>
                              {href ? (
                                <Link href={href} className="inline-flex items-center gap-1 hover:underline">
                                  {i.label ?? "—"} <ExternalLink className="size-3" />
                                </Link>
                              ) : (
                                <span>{i.label ?? "—"}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              Хариуцагч: {i.agent_name ?? "Оноогоогүй"} · Автомат шалгалт:{" "}
                              <span className={i.auto_result === "pass" ? "text-emerald-700" : "text-danger"}>
                                {QUALITY_RESULT_LABEL[i.auto_result].label}
                              </span>
                              {i.auto_reason ? ` — ${i.auto_reason}` : ""}
                            </p>
                            {i.note && <p className="mt-1 text-xs text-ink">Аудитор: {i.note}</p>}
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {i.result ? (
                                <Badge tone={QUALITY_RESULT_LABEL[i.result].tone}>
                                  {QUALITY_RESULT_LABEL[i.result].label}
                                  {i.reviewed_name ? ` · ${i.reviewed_name}` : ""}
                                </Badge>
                              ) : (
                                <Badge tone="amber">Хянаагүй</Badge>
                              )}
                              {i.fix_status && (
                                <Badge tone={TASK_STATUS_LABEL[i.fix_status]?.tone ?? "neutral"}>
                                  {TASK_STATUS_LABEL[i.fix_status]?.label ?? "Засах даалгавар"}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {canRun && (
                            <div className="flex shrink-0 flex-wrap gap-1.5 print:hidden">
                              {editable && (
                                <>
                                  <Button
                                    size="sm"
                                    variant={i.result === "pass" ? "secondary" : "outline"}
                                    disabled={pending}
                                    onClick={() => review(i, "pass")}
                                    aria-label="Тэнцсэн"
                                  >
                                    <CheckCircle2 className="size-4" /> Тэнцсэн
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={i.result === "fail" ? "secondary" : "outline"}
                                    disabled={pending}
                                    onClick={() => review(i, "fail")}
                                    aria-label="Тэнцээгүй"
                                  >
                                    <XCircle className="size-4" /> Тэнцээгүй
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={i.result === "na" ? "secondary" : "ghost"}
                                    disabled={pending}
                                    onClick={() => review(i, "na")}
                                  >
                                    Хамааралгүй
                                  </Button>
                                </>
                              )}
                              {effective === "fail" && !i.fix_task_id && audit.status !== "cancelled" && (
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => assignFix(i)}>
                                  <Wrench className="size-4" /> Засах даалгавар
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={noteFor != null} onClose={() => setNoteFor(null)} title="Автомат дүнгээс өөр шийдвэр">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Автомат шалгалтын дүнг өөрчлөх, эсвэл «Хамааралгүй» гэж тэмдэглэхэд үндэслэлээ бичнэ.
          </p>
          <Field label="Тайлбар (заавал)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Жишээ нь: нотолгоог баримтаас шалгасан" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Болих
            </Button>
            <Button
              disabled={pending || note.trim().length < 3}
              onClick={() => noteFor && review(noteFor.item, noteFor.result, note.trim())}
            >
              Хадгалах
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Аудит дуусгах">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Дуусгасны дараа дүн өөрчлөгдөхгүй. Оноо = тэнцсэн ÷ (тэнцсэн + тэнцээгүй) × 100; «Хамааралгүй» мөр тооцогдохгүй.
          </p>
          <Field label="Дүгнэлт, залруулах арга хэмжээ">
            <textarea
              className="min-h-28 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Гол дутагдал, хариуцагч, хугацаа…"
            />
          </Field>
          {live.open > 0 && (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={acceptRest} onChange={(e) => setAcceptRest(e.target.checked)} className="mt-1" />
              Хянаагүй {live.open} мөрийг автомат шалгалтын дүнгээр батлах
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending || summary.trim().length < 10 || (live.open > 0 && !acceptRest)}
              onClick={complete}
            >
              Дуусгах
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Аудит цуцлах">
        <div className="space-y-4">
          <Field label="Шалтгаан (заавал)">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Болих
            </Button>
            <Button variant="danger" disabled={pending || cancelReason.trim().length < 5} onClick={cancel}>
              Цуцлах
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

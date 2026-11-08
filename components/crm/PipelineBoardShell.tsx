"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarX, Hourglass, KanbanSquare, Lock, MoveRight, Plus, Search, ShieldAlert, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import { OpportunityCreateModal } from "@/components/crm/OpportunityCreateModal";
import { moveStage, closeLost, getMoveOptions } from "@/lib/actions/crm-opportunities";
import { fmtMNT, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stageHealth, type DealFlowConfig } from "@/lib/crm/deal-flow";
import { OPP_STATE_LABEL, PL_LABEL, type CrmRole, type PlCode } from "@/lib/constants-crm";
import type { PipelineBoard, BoardOpp, BoardStage, TransitionOption } from "@/lib/queries-crm-pipeline";

/**
 * Канбан самбар (§6.13, §6.14): багана = шат, чирж зөөх эсвэл картын «Шат
 * солих» (утсанд) → moveStage → DB stage guard (ижил шалгуур). Шилжих
 * шалгуур хаагдвал дутуу жагсаалт; буцаалт/шалтгаант шилжилтэд шалтгаан;
 * амжилтгүй хаахад шалтгаан ангиллаар. Карт бүрд хоёр тусдаа дохио:
 * дараагийн үйлдэл хэтэрсэн, шатанд удсан. «Боломж үүсгэх» модал.
 */

type PendingMove = {
  opp: BoardOpp;
  target: BoardStage;
  kind: string;
  requiresReason: boolean;
};

export function PipelineBoardShell({
  pipelines,
  board,
  currentCode,
  lostReasons,
  roles,
  basePath,
  dealPath,
  dealFlow,
  today,
}: {
  pipelines: { id: string; code: string; name: string }[];
  board: PipelineBoard | null;
  currentCode: string;
  lostReasons: { id: string; label: string; requires_note: boolean }[];
  roles: CrmRole[];
  basePath: string;
  dealPath: string;
  dealFlow: DealFlowConfig;
  /** Серверийн өнөөдөр (YYYY-MM-DD) — hydration зөрүүгээс сэргийлнэ. */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [gateError, setGateError] = useState<{ missing: string[]; stageName: string } | null>(null);
  const [reasonMove, setReasonMove] = useState<PendingMove | null>(null);
  const [reason, setReason] = useState("");
  const [lostMove, setLostMove] = useState<PendingMove | null>(null);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetOpp, setSheetOpp] = useState<BoardOpp | null>(null);
  const [sheetOptions, setSheetOptions] = useState<TransitionOption[] | null>(null);

  const canCreate = currentCode !== "PL-6";

  const oppById = useMemo(() => {
    const map = new Map<string, BoardOpp>();
    for (const col of board?.columns ?? []) for (const o of col.opps) map.set(o.id, o);
    return map;
  }, [board]);
  const stageById = useMemo(() => {
    const map = new Map<string, BoardStage>();
    for (const col of board?.columns ?? []) map.set(col.stage.id, col.stage);
    return map;
  }, [board]);

  function switchPipeline(code: string) {
    router.push(`${basePath}/pipeline?pl=${encodeURIComponent(code)}`);
  }

  function executeMove(opp: BoardOpp, target: BoardStage, moveReason?: string, lost?: { reasonId: string; note?: string }) {
    setError(null);
    startTransition(async () => {
      const res = lost ? await closeLost(opp.id, lost.reasonId, lost.note) : await moveStage(opp.id, target.id, moveReason);
      if (!res.ok) {
        if (res.missing?.length) {
          setGateError({ missing: res.missing, stageName: target.name });
        } else {
          setError(res.error ?? "Алдаа гарлаа.");
        }
        return;
      }
      toast.success(`«${opp.contact_name}» → ${target.name}`);
      setReasonMove(null);
      setLostMove(null);
      setSheetOpp(null);
      setReason("");
      setLostReasonId("");
      setLostNote("");
      router.refresh();
    });
  }

  function initiateMove(oppId: string, target: BoardStage) {
    const opp = oppById.get(oppId);
    if (!opp || !board) return;
    if (opp.stage_id === target.id) return;
    setError(null);

    const tr = board.transitions.find((t) => t.from_stage_id === opp.stage_id && t.to_stage_id === target.id);
    if (!tr) {
      setError(
        target.terminal_state === "won"
          ? "Амжилттай хаагдсан шат руу хэлцэл хаагдахад автоматаар шилжинэ."
          : "Энэ шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой."
      );
      return;
    }
    if (!tr.allowed_roles.some((r) => roles.includes(r))) {
      setError("Танд энэ шилжилтийг хийх эрх алга.");
      return;
    }
    if (target.terminal_state === "lost") {
      setLostMove({ opp, target, kind: tr.kind, requiresReason: tr.requires_reason });
      return;
    }
    if (tr.requires_reason || tr.kind === "backward") {
      setReasonMove({ opp, target, kind: tr.kind, requiresReason: tr.requires_reason });
      return;
    }
    executeMove(opp, target);
  }

  function openSheet(o: BoardOpp) {
    setSheetOpp(o);
    setSheetOptions(null);
    startTransition(async () => {
      const res = await getMoveOptions(o.id);
      if (res.error) {
        setError(res.error);
        setSheetOpp(null);
        return;
      }
      setSheetOptions((res.transitions ?? []).filter((t) => t.allowed_roles.some((r) => roles.includes(r))));
    });
  }

  const selectedLostReason = lostReasons.find((r) => r.id === lostReasonId);
  const totalOpen = board?.columns.reduce((s, c) => s + c.opps.filter((o) => o.state === "open").length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <KanbanSquare className="size-5 text-brand-600" /> Урсгал
        </h1>
        <div className="flex items-center gap-1 overflow-x-auto">
          {pipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchPipeline(p.code)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                p.code === currentCode ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-muted hover:text-ink"
              )}
            >
              {PL_LABEL[p.code as PlCode] ?? p.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Хайх…" className="h-9 pl-9" aria-label="Боломж хайх" />
          </div>
          {canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Боломж
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p> : null}

      {!board ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          <Lock className="mx-auto mb-2 size-5 text-subtle" />
          Урсгал олдсонгүй эсвэл танд харах эрх алга.
        </div>
      ) : totalOpen === 0 && board.columns.every((c) => c.opps.length === 0) ? (
        <EmptyState
          icon={KanbanSquare}
          title="Энэ урсгалд боломж алга"
          description="Сэжимтэй утга бүхий холболт хийсний дараа боломж үүсгэж, шат шатаар ахиулна."
          action={canCreate ? { label: "Боломж үүсгэх", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-4" aria-busy={pending}>
          {board.columns.map((col) => {
            const needle = q.trim().toLowerCase();
            const visible = needle
              ? col.opps.filter(
                  (o) =>
                    o.contact_name.toLowerCase().includes(needle) ||
                    (o.property_name ?? "").toLowerCase().includes(needle) ||
                    (o.property_number ?? "").toLowerCase().includes(needle) ||
                    (o.owner_name ?? "").toLowerCase().includes(needle)
                )
              : col.opps;
            return (
              <div
                key={col.stage.id}
                className="flex w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-2xl border border-line bg-surface-2 sm:w-72"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/opp") || dragId;
                  if (id) initiateMove(id, col.stage);
                  setDragId(null);
                }}
              >
                <div className="border-b border-line px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{col.stage.name}</span>
                    <Badge tone={col.stage.is_terminal ? (col.stage.terminal_state === "won" ? "green" : "rose") : "neutral"}>
                      {visible.length}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {col.stage.probability}% · жинлэсэн {fmtMNT(col.weightedAmount)}
                  </p>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {visible.map((o) => {
                    const h = stageHealth(
                      {
                        stageCode: col.stage.code,
                        stageEnteredAt: o.stage_entered_at,
                        nextStepDate: o.next_step_date,
                        open: o.state === "open",
                      },
                      today,
                      dealFlow
                    );
                    const overdueClose = o.state === "open" && o.expected_close_on !== null && o.expected_close_on < today;
                    return (
                      <div
                        key={o.id}
                        draggable={o.state === "open"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/opp", o.id);
                          setDragId(o.id);
                        }}
                        className={cn(
                          "rounded-xl border bg-surface p-3 shadow-sm",
                          h.nextStepOverdueDays > 0 || h.nextStepMissing ? "border-rose-200" : "border-line",
                          o.state === "open" ? "cursor-grab active:cursor-grabbing" : "opacity-70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`${dealPath}/${o.id}`} className="text-sm font-semibold text-ink hover:text-brand-700">
                            {o.contact_name}
                          </Link>
                          {o.aml_hold ? (
                            <span title="МУТСТ түгжээтэй">
                              <ShieldAlert className="size-4 shrink-0 text-rose-600" />
                            </span>
                          ) : null}
                        </div>
                        {o.property_name ? (
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {o.property_name} <span className="font-mono text-subtle">{o.property_number}</span>
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          {o.amount != null ? <span className="font-medium text-ink">{fmtMNT(o.amount)}</span> : null}
                          <span className="inline-flex items-center gap-1">
                            <Timer className="size-3" /> {h.daysInStage} хоног
                          </span>
                          {o.expected_close_on ? (
                            <span className={overdueClose ? "font-medium text-rose-600" : ""}>Хаалт: {fmtDate(o.expected_close_on)}</span>
                          ) : null}
                        </div>
                        {o.state === "open" ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {h.nextStepOverdueDays > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                <CalendarX className="size-3" /> Алхам {h.nextStepOverdueDays} хоног хэтэрсэн
                              </span>
                            ) : h.nextStepMissing ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                <CalendarX className="size-3" /> Дараагийн үйлдэлгүй
                              </span>
                            ) : o.next_step ? (
                              <span className="truncate text-[11px] text-muted" title={o.next_step}>
                                → {o.next_step}
                              </span>
                            ) : null}
                            {h.stale ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                <Hourglass className="size-3" /> Шатанд удсан
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-subtle">
                          <span className="truncate">{o.owner_name ?? "—"}</span>
                          {o.state !== "open" ? (
                            <Badge tone={OPP_STATE_LABEL[o.state].tone}>{OPP_STATE_LABEL[o.state].label}</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openSheet(o)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
                            >
                              <MoveRight className="size-3.5" /> Шат солих
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {visible.length === 0 ? <p className="px-2 py-4 text-center text-xs text-subtle">Хоосон</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OpportunityCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pipelines={pipelines}
        defaultPipelineCode={currentCode}
        dealPath={dealPath}
      />

      <GateErrorDialog
        open={gateError !== null}
        missing={gateError?.missing ?? []}
        stageName={gateError?.stageName}
        onClose={() => setGateError(null)}
      />

      {/* Шат солих (утсанд чирэхийн оронд) */}
      <Modal
        open={sheetOpp !== null}
        onClose={() => setSheetOpp(null)}
        title={sheetOpp ? `Шат солих — ${sheetOpp.contact_name}` : "Шат солих"}
        footer={
          <Button variant="outline" onClick={() => setSheetOpp(null)}>
            Хаах
          </Button>
        }
      >
        {sheetOptions === null ? (
          <p className="text-sm text-muted">Шилжих шалгуурыг шалгаж байна…</p>
        ) : sheetOptions.length === 0 ? (
          <p className="text-sm text-muted">Танд энэ шатнаас хийх шилжилт алга.</p>
        ) : (
          <ul className="space-y-2">
            {sheetOptions.map((t) => {
              const target = stageById.get(t.to_stage_id);
              return (
                <li key={t.to_stage_id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {t.kind === "backward" ? "← " : ""}
                      {t.to_stage_name}
                    </span>
                    {t.gate_missing.length ? (
                      <Badge tone="amber">{t.gate_missing.length} шаардлага дутуу</Badge>
                    ) : t.gate_code ? (
                      <Badge tone="green">Шалгуур хангагдсан</Badge>
                    ) : null}
                    <Button
                      size="sm"
                      className="ml-auto"
                      variant={t.terminal_state === "lost" ? "danger" : t.kind === "forward" ? "primary" : "outline"}
                      disabled={pending || !target || !sheetOpp}
                      onClick={() => {
                        if (!sheetOpp || !target) return;
                        if (t.gate_missing.length) {
                          setGateError({ missing: t.gate_missing, stageName: t.to_stage_name });
                          return;
                        }
                        initiateMove(sheetOpp.id, target);
                      }}
                    >
                      <ArrowRight className="size-4" /> Шилжүүлэх
                    </Button>
                  </div>
                  {t.gate_missing.length ? (
                    <ul className="mt-1.5 list-disc pl-5 text-xs text-amber-800">
                      {t.gate_missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {sheetOpp ? (
          <Link href={`${dealPath}/${sheetOpp.id}`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
            Карт нээж дутууг бүрдүүлэх →
          </Link>
        ) : null}
      </Modal>

      {/* Буцаалт/шалтгаант шилжилт */}
      <Modal
        open={reasonMove !== null}
        onClose={() => setReasonMove(null)}
        title={reasonMove?.kind === "backward" ? "Буцаах шилжилт — шалтгаан заавал" : "Шилжилтийн шалтгаан"}
        footer={
          <>
            <Button variant="outline" onClick={() => setReasonMove(null)}>
              Болих
            </Button>
            <Button
              disabled={pending || !reason.trim()}
              onClick={() => reasonMove && executeMove(reasonMove.opp, reasonMove.target, reason.trim())}
            >
              Шилжүүлэх
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {reasonMove
            ? `«${reasonMove.opp.contact_name}» боломжийг «${reasonMove.target.name}» шат руу шилжүүлнэ. Шалтгаан аудитад бүртгэгдэнэ.`
            : null}
        </p>
        <Field label="Шалтгаан" htmlFor="move-reason">
          <Input
            id="move-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Жишээ: харилцагч дахин үзлэг хүссэн"
          />
        </Field>
      </Modal>

      {/* Амжилтгүй хаах */}
      <Modal
        open={lostMove !== null}
        onClose={() => setLostMove(null)}
        title="Амжилтгүй хаах — шалтгаан заавал"
        footer={
          <>
            <Button variant="outline" onClick={() => setLostMove(null)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={pending || !lostReasonId || Boolean(selectedLostReason?.requires_note && !lostNote.trim())}
              onClick={() =>
                lostMove &&
                executeMove(lostMove.opp, lostMove.target, undefined, {
                  reasonId: lostReasonId,
                  note: lostNote.trim() || undefined,
                })
              }
            >
              Амжилтгүй хаах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Шалтгааны ангилал" htmlFor="lost-reason">
            <Select id="lost-reason" value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={selectedLostReason?.requires_note ? "Тайлбар (заавал)" : "Тайлбар"} htmlFor="lost-note">
            <Input id="lost-note" value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

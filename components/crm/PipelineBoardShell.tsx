"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KanbanSquare, Lock, Search, ShieldAlert, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import { moveStage, closeLost } from "@/lib/actions/crm-opportunities";
import { fmtMNT, fmtDate, daysSince } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OPP_STATE_LABEL, type CrmRole } from "@/lib/constants-crm";
import type { PipelineBoard, BoardOpp, BoardStage } from "@/lib/queries-crm-pipeline";

/**
 * Канбан самбар (F-352): багана = crm_stages, drag-drop → moveStage action →
 * DB stage guard («ижил босго»). Гейт хаагдвал GateErrorDialog дутуу
 * жагсаалттай; буцаалт/шалтгаант шилжилтэд шалтгааны модал; Алдсан руу —
 * шалтгаан ангиллаар заавал (F-356). Жинлэсэн төсөөлөл багана бүрд (F-353).
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
}: {
  pipelines: { id: string; code: string; name: string }[];
  board: PipelineBoard | null;
  currentCode: string;
  lostReasons: { id: string; label: string; requires_note: boolean }[];
  roles: CrmRole[];
  basePath: string;
  dealPath: string;
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

  const oppById = useMemo(() => {
    const map = new Map<string, BoardOpp>();
    for (const col of board?.columns ?? []) for (const o of col.opps) map.set(o.id, o);
    return map;
  }, [board]);

  function switchPipeline(code: string) {
    router.push(`${basePath}/pipeline?pl=${encodeURIComponent(code)}`);
  }

  function executeMove(opp: BoardOpp, target: BoardStage, moveReason?: string, lost?: { reasonId: string; note?: string }) {
    setError(null);
    startTransition(async () => {
      const res = lost
        ? await closeLost(opp.id, lost.reasonId, lost.note)
        : await moveStage(opp.id, target.id, moveReason);
      if (!res.ok) {
        if (res.missing?.length) {
          setGateError({ missing: res.missing, stageName: target.name });
        } else {
          setError(res.error ?? "Алдаа гарлаа.");
        }
        return;
      }
      setReasonMove(null);
      setLostMove(null);
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

    const tr = board.transitions.find(
      (t) => t.from_stage_id === opp.stage_id && t.to_stage_id === target.id
    );
    if (!tr) {
      setError("Энэ шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой (F-355).");
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

  const selectedLostReason = lostReasons.find((r) => r.id === lostReasonId);

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
                p.code === currentCode
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line bg-surface text-muted hover:text-ink"
              )}
            >
              {p.code} · {p.name}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Хайх…"
            className="h-9 pl-9"
            aria-label="Боломж хайх"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {!board ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          <Lock className="mx-auto mb-2 size-5 text-subtle" />
          Урсгал олдсонгүй эсвэл танд харах эрх алга (PL-6 — хязгаарлагдмал).
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4" aria-busy={pending}>
          {board.columns.map((col) => {
            const visible = q.trim()
              ? col.opps.filter(
                  (o) =>
                    o.contact_name.toLowerCase().includes(q.trim().toLowerCase()) ||
                    (o.property_name ?? "").toLowerCase().includes(q.trim().toLowerCase()) ||
                    (o.owner_name ?? "").toLowerCase().includes(q.trim().toLowerCase())
                )
              : col.opps;
            return (
              <div
                key={col.stage.id}
                className="flex w-72 shrink-0 flex-col rounded-2xl border border-line bg-surface-2"
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
                    const days = daysSince(o.stage_entered_at);
                    const overdue =
                      o.state === "open" &&
                      o.expected_close_on !== null &&
                      o.expected_close_on < new Date().toISOString().slice(0, 10);
                    return (
                      <div
                        key={o.id}
                        draggable={o.state === "open"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/opp", o.id);
                          setDragId(o.id);
                        }}
                        className={cn(
                          "rounded-xl border border-line bg-surface p-3 shadow-sm",
                          o.state === "open" ? "cursor-grab active:cursor-grabbing" : "opacity-70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`${dealPath}/${o.id}`}
                            className="text-sm font-semibold text-ink hover:text-brand-700"
                          >
                            {o.contact_name}
                          </Link>
                          {o.aml_hold ? (
                            <span title="МУТСТ түгжээтэй (Д-12)">
                              <ShieldAlert className="size-4 shrink-0 text-rose-600" />
                            </span>
                          ) : null}
                        </div>
                        {o.property_name ? (
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {o.property_name}{" "}
                            <span className="font-mono text-subtle">{o.property_number}</span>
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          {o.amount != null ? <span className="font-medium text-ink">{fmtMNT(o.amount)}</span> : null}
                          <span className="inline-flex items-center gap-1">
                            <Timer className="size-3" /> {days} хоног
                          </span>
                          {o.expected_close_on ? (
                            <span className={overdue ? "font-medium text-rose-600" : ""}>
                              Хаалт: {fmtDate(o.expected_close_on)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-subtle">
                          <span>{o.owner_name ?? "—"}</span>
                          {o.state !== "open" ? (
                            <Badge tone={OPP_STATE_LABEL[o.state].tone}>{OPP_STATE_LABEL[o.state].label}</Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {visible.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-subtle">Хоосон</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <GateErrorDialog
        open={gateError !== null}
        missing={gateError?.missing ?? []}
        stageName={gateError?.stageName}
        onClose={() => setGateError(null)}
      />

      {/* Буцаалт/шалтгаант шилжилтийн модал (F-355) */}
      <Modal
        open={reasonMove !== null}
        onClose={() => setReasonMove(null)}
        title={
          reasonMove?.kind === "backward" ? "Буцаах шилжилт — шалтгаан заавал" : "Шилжилтийн шалтгаан"
        }
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
            ? `«${reasonMove.opp.contact_name}» боломжийг «${reasonMove.target.name}» шат руу шилжүүлнэ. Шалтгаан аудит логт бүртгэгдэнэ (F-355).`
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

      {/* Closed Lost модал (F-356) */}
      <Modal
        open={lostMove !== null}
        onClose={() => setLostMove(null)}
        title="Алдсанаар хаах — шалтгаан заавал (F-356)"
        footer={
          <>
            <Button variant="outline" onClick={() => setLostMove(null)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={
                pending ||
                !lostReasonId ||
                Boolean(selectedLostReason?.requires_note && !lostNote.trim())
              }
              onClick={() =>
                lostMove &&
                executeMove(lostMove.opp, lostMove.target, undefined, {
                  reasonId: lostReasonId,
                  note: lostNote.trim() || undefined,
                })
              }
            >
              Алдсанаар хаах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Алдсан шалтгаан" htmlFor="lost-reason">
            <Select id="lost-reason" value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={selectedLostReason?.requires_note ? "Тайлбар (заавал)" : "Тайлбар"}
            htmlFor="lost-note"
          >
            <Input id="lost-note" value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

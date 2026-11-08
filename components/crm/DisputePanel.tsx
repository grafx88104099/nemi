"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileDown, Gavel, Scale, ShieldCheck, UserX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { EvidenceEditor, type EvidenceDraft } from "@/components/crm/ClaimCard";
import {
  addDisputeEvidence,
  anonymizeContact,
  appealDispute,
  completeDataRequest,
  createDataRequestByNumber,
  decideAppeal,
  decideDataRequest,
  decideDispute,
  escalateDispute,
  reviewDispute,
  withdrawDispute,
} from "@/lib/actions/crm-ownership";
import { decideExport, requestExport } from "@/lib/actions/crm-exports";
import {
  APPEAL_OUTCOMES,
  APPEAL_OUTCOME_LABEL,
  DATA_REQUEST_KIND_LABEL,
  DATA_REQUEST_STATUS_LABEL,
  DISPUTE_DECISIONS,
  DISPUTE_DECISION_LABEL,
  DISPUTE_KIND_LABEL,
  DISPUTE_STATUS_LABEL,
  EVIDENCE_KIND_LABEL,
  EXPORT_SCOPE_LABEL,
  EXPORT_STATUS_LABEL,
  disputeAbilities,
  type AppealOutcome,
  type DataRequestKind,
  type DisputeDecision,
  type EvidenceKind,
  type ExportScope,
} from "@/lib/validation/crm-ownership";
import type { CrmRole } from "@/lib/constants-crm";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type {
  DataRequestRow,
  DisputeDetail,
  DisputeListRow,
  ExportRequestRow,
} from "@/lib/queries-crm-ownership";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {error}
    </p>
  );
}

// ════════════════════════════════════════════════════════════
// Маргааны жагсаалт
// ════════════════════════════════════════════════════════════

export function DisputeList({
  rows,
  hrefBase,
  selectedId,
  me,
}: {
  rows: DisputeListRow[];
  /** Холбоосын угтвар — араас нь маргааны id залгана. */
  hrefBase: string;
  selectedId?: string | null;
  me: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="Маргаан алга"
        description="Харилцагч өөр агентын нэр дээр бүртгэлтэй бол «Харилцагч шалгах» хэсгээс нотолгоотой маргаан нээнэ."
        compact
      />
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map((r) => {
        const st = DISPUTE_STATUS_LABEL[r.status] ?? DISPUTE_STATUS_LABEL.open;
        const role = r.claimant_id === me ? "Та гаргасан" : r.respondent_id === me ? "Таны эсрэг" : null;
        return (
          <li key={r.id}>
            <Link
              href={`${hrefBase}${r.id}`}
              className={`flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3 ${
                selectedId === r.id ? "bg-brand-50" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{r.contact_name ?? "Харилцагч"}</span>
                <span className="block text-xs text-muted">
                  {r.claimant_name ?? "—"} ↔ {r.respondent_name ?? "эзэмшигчгүй"} · {fmtDate(r.created_at)}
                </span>
              </span>
              <span className="flex flex-wrap gap-1">
                {role ? <Badge tone="neutral">{role}</Badge> : null}
                <Badge tone={st.tone}>{st.label}</Badge>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════
// Маргааны дэлгэрэнгүй
// ════════════════════════════════════════════════════════════

function EvidenceList({ items }: { items: DisputeDetail["claimant_evidence"] }) {
  if (items.length === 0) return <p className="text-sm text-subtle">Нотолгоо оруулаагүй.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => (
        <li key={i} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <span className="font-medium text-ink">{EVIDENCE_KIND_LABEL[e.kind as EvidenceKind] ?? "Нотолгоо"}</span>
          {e.at ? <span className="text-xs text-subtle"> · {fmtDate(e.at)}</span> : null}
          <p className="text-ink">{e.text}</p>
        </li>
      ))}
    </ul>
  );
}

function yesNo(v: boolean | null | undefined): string {
  return v == null ? "—" : v ? "Тийм" : "Үгүй";
}

export function DisputePanel({
  dispute,
  me,
  roles,
  isTeamLeadOfParty,
  appealDays,
  leadHref,
}: {
  dispute: DisputeDetail;
  me: string;
  roles: CrmRole[];
  isTeamLeadOfParty: boolean;
  appealDays: number;
  /** Сэжмийн карт руу (харах эрхтэй үед). */
  leadHref?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([{ kind: "", text: "", at: "" }]);
  const [reviewNote, setReviewNote] = useState("");
  const [recommendation, setRecommendation] = useState<DisputeDecision | "">("");
  const [decision, setDecision] = useState<DisputeDecision | "">("");
  const [rationale, setRationale] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [appealText, setAppealText] = useState("");
  const [outcome, setOutcome] = useState<AppealOutcome | "">("");
  const [appealRationale, setAppealRationale] = useState("");

  const d = dispute;
  const can = disputeAbilities(
    d,
    { me, roles, isTeamLeadOfParty, conflict: d.my_conflict },
    { appealDays }
  );
  const st = DISPUTE_STATUS_LABEL[d.status] ?? DISPUTE_STATUS_LABEL.open;
  const f = d.facts;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, reset?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(success);
      reset?.();
      router.refresh();
    });
  }

  const evidencePayload = () =>
    evidence
      .filter((e) => e.kind || e.text.trim())
      .map((e) => ({ kind: e.kind, text: e.text, ...(e.at ? { at: e.at } : {}) }));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="size-5 text-brand-600" />
            <h2 className="text-lg font-bold text-ink">{d.contact_name ?? "Харилцагч"}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
            {leadHref ? (
              <Link href={leadHref} className="ml-auto text-sm font-semibold text-brand-700 hover:underline">
                Сэжмийн карт
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted">{DISPUTE_KIND_LABEL[d.kind] ?? "Эзэмшлийн маргаан"}</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-subtle">Маргаан гаргагч</dt>
              <dd className="text-ink">{d.claimant_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Одоогийн эзэмшигч</dt>
              <dd className="text-ink">{d.respondent_name ?? "Эзэмшигчгүй"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Нээсэн</dt>
              <dd className="text-ink">{fmtDateTime(d.created_at)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-bold text-ink">Гаргагчийн үндэслэл, нотолгоо</h3>
            <p className="whitespace-pre-line text-sm text-ink">{d.claim}</p>
            <EvidenceList items={d.claimant_evidence} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-bold text-ink">Эзэмшигчийн тайлбар, нотолгоо</h3>
            {d.respondent_note ? <p className="whitespace-pre-line text-sm text-ink">{d.respondent_note}</p> : null}
            {d.respondent_note || d.respondent_evidence.length ? (
              <EvidenceList items={d.respondent_evidence} />
            ) : (
              <p className="text-sm text-subtle">Эзэмшигч хариу өгөөгүй байна.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {f ? (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-bold text-ink">CRM-ийн нотолгоо (системээс)</h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-subtle">Харилцагчийг анх бүртгэсэн</dt>
                <dd className="text-ink">
                  {f.contact_created_at ? fmtDateTime(f.contact_created_at) : "—"}
                  {f.contact_created_by_respondent ? " · эзэмшигч" : f.contact_created_by_claimant ? " · гаргагч" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Сэжим бүртгэгдсэн</dt>
                <dd className="text-ink">
                  {f.lead_created_at ? fmtDateTime(f.lead_created_at) : "—"}
                  {f.lead_created_by_respondent ? " · эзэмшигч өөрөө" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Анхны утга бүхий холболт</dt>
                <dd className="text-ink">{f.first_contact_at ? fmtDateTime(f.first_contact_at) : "Бүртгэгдээгүй"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Эзэмшигчийн үйл ажиллагаа</dt>
                <dd className="text-ink">
                  {f.respondent_activities} удаа
                  {f.respondent_last_activity_at ? ` · сүүлд ${fmtDate(f.respondent_last_activity_at)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Гаргагчийн бүртгэсэн үйл ажиллагаа</dt>
                <dd className="text-ink">{f.claimant_activities} удаа</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Дараагийн үйлдлийн огноо</dt>
                <dd className="text-ink">{f.next_step_date ? fmtDate(f.next_step_date) : "Тогтоогоогүй"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Хамгаалалтгүй бүртгэл</dt>
                <dd className="text-ink">{yesNo(f.unprotected)}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Эзэмшигч солигдсон</dt>
                <dd className="text-ink">{f.owner_changes} удаа</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Гаргагчийн давхар бүртгэлээс нэгтгэсэн</dt>
                <dd className="text-ink">{yesNo(f.merged_from_claimant)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      ) : null}

      {d.review_note || d.escalation_reason ? (
        <Card>
          <CardBody className="space-y-2">
            {d.review_note ? (
              <>
                <h3 className="text-sm font-bold text-ink">Хяналтын дүгнэлт</h3>
                <p className="text-xs text-subtle">
                  {d.reviewed_by_name ?? "—"} · {d.reviewed_at ? fmtDateTime(d.reviewed_at) : ""}
                  {d.review_recommendation ? ` · Санал: ${DISPUTE_DECISION_LABEL[d.review_recommendation]}` : ""}
                </p>
                <p className="whitespace-pre-line text-sm text-ink">{d.review_note}</p>
              </>
            ) : null}
            {d.escalation_reason ? (
              <p className="text-sm text-rose-700">CEO-д шилжүүлсэн шалтгаан: {d.escalation_reason}</p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {d.decision ? (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Gavel className="size-4" /> Эхний шатны шийдвэр
            </h3>
            <p className="text-sm font-semibold text-ink">{DISPUTE_DECISION_LABEL[d.decision]}</p>
            <p className="text-xs text-subtle">
              {d.decided_by_name ?? "—"} · {d.decided_at ? fmtDateTime(d.decided_at) : ""}
            </p>
            <p className="whitespace-pre-line text-sm text-ink">{d.decision_rationale}</p>
            {d.appeal_text ? (
              <div className="rounded-xl bg-surface-2 p-3 text-sm">
                <p className="font-semibold text-ink">Давж заалдах хүсэлт</p>
                <p className="whitespace-pre-line text-ink">{d.appeal_text}</p>
                {d.appeal_decision ? (
                  <p className="mt-2 text-ink">
                    <span className="font-semibold">{APPEAL_OUTCOME_LABEL[d.appeal_decision]}</span> —{" "}
                    {d.appeal_decided_by_name ?? ""}: {d.appeal_rationale}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <ErrorBox error={error} />

      {can.addEvidence ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-bold text-ink">
              {me === d.respondent_id ? "Тайлбар, нотолгоо өгөх" : "Нотолгоо нэмэх"}
            </h3>
            {me === d.respondent_id ? (
              <Field label="Тайлбар">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={TEXTAREA} />
              </Field>
            ) : null}
            <EvidenceEditor value={evidence} onChange={setEvidence} />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => addDisputeEvidence({ disputeId: d.id, note: note || undefined, evidence: evidencePayload() }),
                  "Нотолгоо хадгалагдлаа",
                  () => {
                    setNote("");
                    setEvidence([{ kind: "", text: "", at: "" }]);
                  }
                )
              }
            >
              Хадгалах
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {can.review ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Хяналтын дүгнэлт бичих</h3>
            <Field label="Дүгнэлт" hint="Хоёр талын нотолгоог тулгасан дүгнэлт (10+ тэмдэгт).">
              <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} maxLength={2000} className={TEXTAREA} />
            </Field>
            <Field label="Санал">
              <Select value={recommendation} onChange={(e) => setRecommendation(e.target.value as DisputeDecision | "")}>
                <option value="">Санал өгөхгүй</option>
                {DISPUTE_DECISIONS.map((x) => (
                  <option key={x} value={x}>
                    {DISPUTE_DECISION_LABEL[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              disabled={pending || reviewNote.trim().length < 10}
              onClick={() =>
                run(
                  () => reviewDispute({ disputeId: d.id, note: reviewNote, recommendation: recommendation || null }),
                  "Дүгнэлт хадгалагдлаа",
                  () => setReviewNote("")
                )
              }
            >
              <ShieldCheck className="size-4" /> Дүгнэлт хадгалах
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {can.decideBlockedReason ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Та энэ маргааныг шийдэх боломжгүй — {can.decideBlockedReason}. Өөр Борлуулалт хариуцсан захирал шийднэ,
            эсвэл CEO-д шилжүүлнэ үү.
          </span>
        </div>
      ) : null}

      {can.decide ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Gavel className="size-4" /> Шийдвэр гаргах
            </h3>
            {!d.respondent_note && d.respondent_evidence.length === 0 ? (
              <p className="text-xs text-amber-700">Эзэмшигч хараахан тайлбар өгөөгүй байна.</p>
            ) : null}
            <fieldset className="space-y-2">
              {DISPUTE_DECISIONS.map((x) => (
                <label
                  key={x}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
                    decision === x ? "border-brand-300 bg-brand-50" : "border-line"
                  }`}
                >
                  <input type="radio" name="dispute-decision" checked={decision === x} onChange={() => setDecision(x)} className="size-4" />
                  {DISPUTE_DECISION_LABEL[x]}
                </label>
              ))}
            </fieldset>
            <Field label="Үндэслэл" hint="Аль нотолгоонд үндэслэснийг бичнэ үү (10+ тэмдэгт).">
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} maxLength={2000} className={TEXTAREA} />
            </Field>
            <Button
              size="sm"
              disabled={pending || !decision || rationale.trim().length < 10}
              onClick={() => run(() => decideDispute({ disputeId: d.id, decision, rationale }), "Шийдвэр бүртгэгдлээ")}
            >
              Шийдвэрлэх
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {can.escalate ? (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-bold text-ink">CEO-д шилжүүлэх</h3>
            <p className="text-xs text-muted">
              Шийдэх эрхтэй Борлуулалт хариуцсан захирал ашиг сонирхлын зөрчилтэй эсвэл байхгүй үед.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="Шалтгаан" aria-label="Шилжүүлэх шалтгаан" />
              <Button
                size="sm"
                variant="outline"
                disabled={pending || escalateReason.trim().length < 5}
                onClick={() =>
                  run(() => escalateDispute({ disputeId: d.id, reason: escalateReason }), "CEO-д шилжүүллээ", () => setEscalateReason(""))
                }
              >
                Шилжүүлэх
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {can.appeal ? (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-bold text-ink">Давж заалдах</h3>
            <p className="text-xs text-muted">Шийдвэрээс хойш {appealDays} хоногийн дотор (PMC-SAL-POL-001 §8).</p>
            <textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={3} maxLength={2000} className={TEXTAREA} aria-label="Давж заалдах үндэслэл" />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || appealText.trim().length < 10}
              onClick={() => run(() => appealDispute({ disputeId: d.id, text: appealText }), "Давж заалдах хүсэлт илгээгдлээ")}
            >
              Илгээх
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {can.decideAppeal ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Давж заалдах хүсэлтийг шийдэх</h3>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value as AppealOutcome | "")} aria-label="Шийдвэр">
              <option value="">Шийдвэрээ сонгоно уу</option>
              {APPEAL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {APPEAL_OUTCOME_LABEL[o]}
                </option>
              ))}
            </Select>
            <textarea value={appealRationale} onChange={(e) => setAppealRationale(e.target.value)} rows={3} maxLength={2000} className={TEXTAREA} aria-label="Үндэслэл" />
            <Button
              size="sm"
              disabled={pending || !outcome || appealRationale.trim().length < 10}
              onClick={() =>
                run(() => decideAppeal({ disputeId: d.id, outcome, rationale: appealRationale }), "Давж заалдах шийдвэр бүртгэгдлээ")
              }
            >
              Шийдвэрлэх
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {can.withdraw ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => withdrawDispute(d.id), "Маргааныг татлаа")}
        >
          <X className="size-4" /> Маргаанаа татах
        </Button>
      ) : null}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Экспортын хүсэлт (§6.32)
// ════════════════════════════════════════════════════════════

export function ExportRequestQueue({ rows, canDecide, me }: { rows: ExportRequestRow[]; canDecide: boolean; me: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [maxRows, setMaxRows] = useState<Record<string, string>>({});

  function decide(r: ExportRequestRow, approve: boolean) {
    const mr = Number(maxRows[r.id] ?? r.row_estimate ?? "");
    startTransition(async () => {
      const res = await decideExport({
        requestId: r.id,
        approve,
        note: notes[r.id] || undefined,
        maxRows: Number.isFinite(mr) && mr > 0 ? Math.round(mr) : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Шийдвэрлэж чадсангүй.");
        return;
      }
      toast.success(approve ? "Экспортыг зөвшөөрлөө" : "Татгалзлаа");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileDown}
        title="Экспортын хүсэлт алга"
        description="Агент жагсаалт татах шаардлагатай бол зорилгоо бичиж хүсэлт илгээнэ; энд шийдвэрлэнэ."
        compact
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const st = EXPORT_STATUS_LABEL[r.status] ?? EXPORT_STATUS_LABEL.requested;
        return (
          <li key={r.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{r.requester_name ?? "Ажилтан"}</span>
              <Badge tone="neutral">{EXPORT_SCOPE_LABEL[r.scope as ExportScope] ?? "Жагсаалт"}</Badge>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span className="ml-auto text-xs text-subtle">{fmtDateTime(r.created_at)}</span>
            </div>
            <p className="text-sm text-ink">{r.reason}</p>
            <p className="text-xs text-muted">
              Тооцоолсон мөр: {r.row_estimate ?? "—"}
              {r.max_rows ? ` · Зөвшөөрсөн дээд: ${r.max_rows}` : ""}
              {r.expires_at ? ` · Хүчинтэй: ${fmtDateTime(r.expires_at)} хүртэл` : ""}
              {r.row_count != null ? ` · Татсан: ${r.row_count} мөр` : ""}
              {r.decision_note ? ` · ${r.decision_note}` : ""}
            </p>
            {canDecide && r.status === "requested" && r.requested_by !== me ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={maxRows[r.id] ?? (r.row_estimate ? String(r.row_estimate) : "")}
                  onChange={(e) => setMaxRows((m) => ({ ...m, [r.id]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="Дээд мөр"
                  aria-label="Зөвшөөрөх дээд мөр"
                  className="sm:w-32"
                />
                <Input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Тайлбар (татгалзвал заавал)"
                  aria-label="Шийдвэрийн тайлбар"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(r, true)} disabled={pending}>
                    <Check className="size-4" /> Зөвшөөрөх
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, false)} disabled={pending}>
                    <X className="size-4" /> Татгалзах
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════
// Хувь хүний мэдээллийн хүсэлт (§6.32)
// ════════════════════════════════════════════════════════════

export function DataRequestQueue({ rows, canDecide }: { rows: DataRequestRow[]; canDecide: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UserX}
        title="Хүсэлт алга"
        description="Харилцагч мэдээлэлтэйгээ танилцах, засуулах, устгуулах хүсэлт гаргавал харилцагчийн картаас бүртгэнэ."
        compact
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const st = DATA_REQUEST_STATUS_LABEL[r.status] ?? DATA_REQUEST_STATUS_LABEL.received;
        return (
          <li key={r.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{r.contact_name ?? "Харилцагч"}</span>
              <Badge tone="neutral">{DATA_REQUEST_KIND_LABEL[r.kind as DataRequestKind] ?? "Хүсэлт"}</Badge>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span className="ml-auto text-xs text-subtle">{fmtDateTime(r.received_at)}</span>
            </div>
            <p className="text-xs text-muted">
              Бүртгэсэн: {r.created_by_name ?? "—"}
              {r.channel ? ` · Суваг: ${r.channel}` : ""}
              {r.note ? ` · ${r.note}` : ""}
              {r.decision_note ? ` · Шийдвэр: ${r.decision_note}` : ""}
            </p>
            {canDecide && r.status === "received" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Шийдвэрийн тайлбар"
                  aria-label="Шийдвэрийн тайлбар"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending || (notes[r.id] ?? "").trim().length < 5}
                    onClick={() => act(() => decideDataRequest({ requestId: r.id, approve: true, note: notes[r.id] ?? "" }), "Зөвшөөрлөө")}
                  >
                    Зөвшөөрөх
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || (notes[r.id] ?? "").trim().length < 5}
                    onClick={() => act(() => decideDataRequest({ requestId: r.id, approve: false, note: notes[r.id] ?? "" }), "Татгалзлаа")}
                  >
                    Татгалзах
                  </Button>
                </div>
              </div>
            ) : null}
            {canDecide && r.status === "approved" ? (
              r.kind === "erase" ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Харилцагчийн нэр, утас, и-мэйлийг бүрмөсөн арилгана. Буцаах боломжгүй. Үргэлжлүүлэх үү?")) return;
                    act(() => anonymizeContact(r.id), "Харилцагчийг нэргүйжүүллээ");
                  }}
                >
                  Нэргүйжүүлэх
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => completeDataRequest(r.id), "Гүйцэтгэснээр тэмдэглэлээ")}>
                  Гүйцэтгэсэн
                </Button>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Харилцагчийн хүсэлт бүртгэх (харилцагчийн дугаараар). */
export function DataRequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState("");
  const [kind, setKind] = useState<DataRequestKind | "">("");
  const [channel, setChannel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createDataRequestByNumber({ contactNumber: number, kind, channel, note });
      if (!res.ok) {
        setError(res.error ?? "Бүртгэж чадсангүй.");
        return;
      }
      toast.success("Хүсэлт бүртгэгдлээ");
      setNumber("");
      setKind("");
      setChannel("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-bold text-ink">Харилцагчийн хүсэлт бүртгэх</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Харилцагчийн дугаар" hint="Харилцагчийн картын дээд хэсэгт байгаа дугаар.">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="Хүсэлт">
              <Select value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind | "")}>
                <option value="">Сонгоно уу</option>
                {(Object.keys(DATA_REQUEST_KIND_LABEL) as DataRequestKind[]).map((k) => (
                  <option key={k} value={k}>
                    {DATA_REQUEST_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Хүлээн авсан суваг">
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Утас, и-мэйл, биечлэн…" />
            </Field>
            <Field label="Тайлбар">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <ErrorBox error={error} />
          <Button type="submit" size="sm" disabled={pending || !number.trim() || !kind}>
            Бүртгэх
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Экспортын хүсэлт илгээх (зөвшөөрөл шаардлагатай үед). */
export function ExportRequestForm({ defaultScope }: { defaultScope?: ExportScope }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<ExportScope | "">(defaultScope ?? "");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(rows);
    startTransition(async () => {
      const res = await requestExport({
        scope,
        reason,
        rowEstimate: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
        filters: {},
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Хүсэлт илгээгдлээ", { description: "Үйл ажиллагаа-ЧМТ шийдвэрлэсний дараа татаж авна." });
      setReason("");
      setRows("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-bold text-ink">Экспортын хүсэлт илгээх</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Юуг экспортлох">
              <Select value={scope} onChange={(e) => setScope(e.target.value as ExportScope | "")}>
                <option value="">Сонгоно уу</option>
                {(Object.keys(EXPORT_SCOPE_LABEL) as ExportScope[]).map((s) => (
                  <option key={s} value={s}>
                    {EXPORT_SCOPE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ойролцоо мөр">
              <Input value={rows} onChange={(e) => setRows(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Зорилго" hint="Юунд ашиглах, хэнд дамжуулахгүйг бичнэ үү (10+ тэмдэгт).">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} className={TEXTAREA} />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" size="sm" disabled={pending || !scope || reason.trim().length < 10}>
            Илгээх
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

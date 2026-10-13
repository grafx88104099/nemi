"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PhoneCall,
  RefreshCcw,
  UserRoundCog,
  Play,
  Recycle,
  PauseCircle,
  History,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { BackLink } from "@/components/ui/back-link";
import { NextStepGuard } from "@/components/crm/NextStepGuard";
import { DuplicateHint } from "@/components/crm/DuplicateHint";
import {
  activateLead,
  logFirstContact,
  reassignLead,
  recycleLead,
  refreshLeadScore,
  setLeadGrade,
  setLeadStatus,
  updateLead,
} from "@/lib/actions/crm-leads";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import type { LeadDetail, AgentOption } from "@/lib/queries-crm-leads";
import type { DuplicateHit } from "@/lib/queries-crm-contacts";
import {
  CRM_LIFECYCLE_LABEL,
  LEAD_GRADES,
  LEAD_GRADE_LABEL,
  KYC_STATUS_LABEL,
  CONSENT_STATUS_LABEL,
  CONTACT_TYPE_LABEL,
  type CrmRole,
  type LeadGrade,
  type ConsentStatus,
} from "@/lib/constants-crm";
import { REASSIGN_REASONS, REASSIGN_REASON_LABEL, type ReassignReason } from "@/lib/validation/crm";

/**
 * Сэжимийн карт (P-01): алтан дүрмийн блок (NextStepGuard), онооны задаргаа
 * (F-112), ангилал + гар өөрчлөлтийн шалтгаан (F-113), амьдралын мөчлөгийн
 * үйлдлүүд (F-110), эзэмшлийн түүх (зарчим 6), давхардлын сануулга (F-107).
 */

const BREAKDOWN_LABEL: Record<string, string> = {
  budget_fit: "Төсөв/санхүүжилт",
  timeline: "Хугацаа",
  financing: "Санхүүжилтийн хэлбэр",
  engagement: "Идэвх, хариу үйлдэл",
  source_quality: "Эх сурвалжийн чанар",
  profile_complete: "Профайлын бүрэн байдал",
};

export function LeadDetailShell({
  lead,
  agents,
  roles,
  basePath,
  duplicates,
}: {
  lead: LeadDetail;
  agents: AgentOption[];
  roles: CrmRole[];
  basePath: string;
  duplicates: DuplicateHit[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isLeadRole = ["team_lead", "sales_director", "ops_qc", "sysadmin"].some((r) =>
    roles.includes(r as CrmRole)
  );

  // Идэвхжүүлэх модал
  const [activateOpen, setActivateOpen] = useState(false);
  const [actGrade, setActGrade] = useState<LeadGrade>(lead.grade ?? "b");
  const [actReason, setActReason] = useState("");
  const [actStep, setActStep] = useState(lead.next_step ?? "");
  const [actDate, setActDate] = useState(lead.next_step_date ?? "");
  const [actMissing, setActMissing] = useState<string[]>([]);

  // Ангилал модал
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeVal, setGradeVal] = useState<LeadGrade>(lead.grade ?? "c");
  const [gradeReason, setGradeReason] = useState("");

  // Шилжүүлэх модал
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [reason, setReason] = useState<ReassignReason>("client_request");
  const [reasonNote, setReasonNote] = useState("");

  // Дараагийн алхам засах
  const [stepEdit, setStepEdit] = useState(false);
  const [stepVal, setStepVal] = useState(lead.next_step ?? "");
  const [stepDate, setStepDate] = useState(lead.next_step_date ?? "");

  function run(fn: () => Promise<{ ok?: boolean; error?: string; missing?: string[] } | { error?: string }>, onOk?: () => void) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) {
        setError(res.error);
        if ("missing" in res && res.missing) setActMissing(res.missing);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  const breakdown = (lead.score_breakdown ?? {}) as Record<string, number>;
  const primaryPhone = lead.contact.phones.find((p) => p.is_primary) ?? lead.contact.phones[0];

  return (
    <div className="space-y-4">
      <BackLink href={`${basePath}/leads`} label="Сэжимийн жагсаалт" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{lead.contact.display_name}</h1>
            <Badge tone={CRM_LIFECYCLE_LABEL[lead.status].tone}>{CRM_LIFECYCLE_LABEL[lead.status].label}</Badge>
            {lead.grade ? <Badge tone={LEAD_GRADE_LABEL[lead.grade].tone}>{LEAD_GRADE_LABEL[lead.grade].label}</Badge> : null}
            {lead.unprotected ? <Badge tone="amber">Хамгаалалтгүй (F-127)</Badge> : null}
            <Badge tone={KYC_STATUS_LABEL[lead.contact.kyc_public_status].tone}>
              KYC: {KYC_STATUS_LABEL[lead.contact.kyc_public_status].label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Link href={`${basePath}/contacts/${lead.contact.id}`} className="font-mono text-xs text-brand-700 hover:underline">
              {lead.contact.number}
            </Link>
            {primaryPhone ? (
              <span className="font-mono text-xs">{formatPhone(normalizePhone(primaryPhone.raw)) || primaryPhone.raw}</span>
            ) : null}
            {lead.source_label ? <span>Эх сурвалж: {lead.source_label}</span> : null}
            {lead.campaign_code ? <span>Аян: {lead.campaign_code}</span> : null}
            <span>
              Зөвшөөрөл: {CONSENT_STATUS_LABEL[lead.contact.consent as ConsentStatus]?.label ?? lead.contact.consent}
            </span>
            <span>{lead.contact.contact_types.map((t) => CONTACT_TYPE_LABEL[t]).join(", ")}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!lead.last_contact_at ? (
            <Button size="sm" onClick={() => run(() => logFirstContact(lead.id))} disabled={pending}>
              <PhoneCall className="size-4" /> Эхний холболт бүртгэх
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => run(() => logFirstContact(lead.id))} disabled={pending}>
              <PhoneCall className="size-4" /> Холболт бүртгэх
            </Button>
          )}
          {lead.status === "new" || lead.status === "recycled" || lead.status === "inactive" ? (
            <Button size="sm" variant="secondary" onClick={() => setActivateOpen(true)} disabled={pending}>
              <Play className="size-4" /> Идэвхжүүлэх
            </Button>
          ) : null}
          {lead.status === "active" && isLeadRole ? (
            <Button size="sm" variant="outline" onClick={() => run(() => recycleLead(lead.id))} disabled={pending}>
              <Recycle className="size-4" /> Эргэлтэд оруулах
            </Button>
          ) : null}
          {lead.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => run(() => setLeadStatus(lead.id, "inactive"))} disabled={pending}>
              <PauseCircle className="size-4" /> Идэвхгүй болгох
            </Button>
          ) : null}
          {isLeadRole ? (
            <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)} disabled={pending}>
              <UserRoundCog className="size-4" /> Шилжүүлэх
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
          {actMissing.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs">
              {actMissing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {info ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p> : null}

      <NextStepGuard
        status={lead.status}
        ownerName={lead.owner_name}
        grade={lead.grade}
        lastContactAt={lead.last_contact_at}
        nextStep={lead.next_step}
        nextStepDate={lead.next_step_date}
      />

      {duplicates.length > 0 ? <DuplicateHint hits={duplicates} basePath={basePath} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Оноо (F-112) */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Сэжимийн оноо (100 онооны загвар)</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-brand-700">
                  {lead.score != null ? Number(lead.score).toFixed(0) : "—"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Оноо шинэчлэх"
                  onClick={() =>
                    run(
                      () => refreshLeadScore(lead.id),
                      () => setInfo("Оноо шинэчлэгдлээ.")
                    )
                  }
                  disabled={pending}
                >
                  <RefreshCcw className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {Object.entries(BREAKDOWN_LABEL).map(([key, label]) => {
                const val = Number(breakdown[key] ?? 0);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">{label}</span>
                      <span className="font-semibold text-ink">{val.toFixed(1)}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, val * 4)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <div className="text-xs text-muted">
                Ангилал: {lead.grade ? LEAD_GRADE_LABEL[lead.grade].label : "тодорхойгүй"}
                {lead.grade_override_reason ? (
                  <span className="block text-subtle">Гар өөрчлөлтийн шалтгаан: {lead.grade_override_reason}</span>
                ) : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => setGradeOpen(true)}>
                Ангилал өөрчлөх
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Дараагийн алхам + SLA */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Дараагийн алхам</h3>
              <Button size="sm" variant="ghost" onClick={() => setStepEdit((v) => !v)}>
                {stepEdit ? "Болих" : "Засах"}
              </Button>
            </div>
            {stepEdit ? (
              <div className="mt-2 space-y-2">
                <Field label="Алхам">
                  <Input value={stepVal} onChange={(e) => setStepVal(e.target.value)} placeholder="Үзлэг товлох" />
                </Field>
                <Field label="Огноо">
                  <Input type="date" value={stepDate ?? ""} onChange={(e) => setStepDate(e.target.value)} />
                </Field>
                <Button
                  size="sm"
                  onClick={() =>
                    run(
                      () => updateLead({ id: lead.id, nextStep: stepVal, nextStepDate: stepDate || null }),
                      () => setStepEdit(false)
                    )
                  }
                  disabled={pending}
                >
                  Хадгалах
                </Button>
              </div>
            ) : (
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Алхам</dt>
                  <dd className="font-medium text-ink">{lead.next_step ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Огноо</dt>
                  <dd className="font-medium text-ink">{lead.next_step_date ? fmtDate(lead.next_step_date) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Сүүлийн холболт</dt>
                  <dd className="font-medium text-ink">{lead.last_contact_at ? fmtDateTime(lead.last_contact_at) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Эхний холболтын SLA</dt>
                  <dd className="font-medium text-ink">
                    {lead.first_contact_due_at ? fmtDateTime(lead.first_contact_due_at) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Идэвхгүй хоног</dt>
                  <dd className="font-medium text-ink">{lead.inactivity_days}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Эзэмшлийн түүх (зарчим 6, P-10) */}
      <Card>
        <CardBody>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <History className="size-4" /> Эзэмшлийн түүх
          </h3>
          {lead.ownershipHistory.length === 0 ? (
            <p className="mt-2 text-sm text-subtle">Эзэмшлийн өөрчлөлт бүртгэгдээгүй.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {lead.ownershipHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="text-xs text-subtle">{fmtDateTime(h.created_at)}</span>
                  <span className="text-muted">{h.old_owner_name ?? "Оноогдоогүй"}</span>
                  <span className="text-subtle">→</span>
                  <span className="font-medium text-ink">{h.new_owner_name ?? "—"}</span>
                  <Badge tone="neutral">{REASSIGN_REASON_LABEL[h.reason_code as ReassignReason] ?? h.reason_code}</Badge>
                  {h.note ? <span className="text-xs text-muted">{h.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Идэвхжүүлэх — алтан дүрмийн 5 бүрдэл (F-125) */}
      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title="Сэжим идэвхжүүлэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setActivateOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () =>
                    activateLead(lead.id, {
                      grade: actGrade,
                      gradeOverrideReason: actReason.trim() || null,
                      nextStep: actStep.trim(),
                      nextStepDate: actDate,
                    }),
                  () => setActivateOpen(false)
                )
              }
              disabled={pending}
            >
              Идэвхжүүлэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Идэвхтэй төлөвт алтан дүрмийн 5 бүрдэл заавал: эзэмшигч, ангилал, сүүлийн холболт, дараагийн алхам + огноо.
          </p>
          <Field label="Ангилал">
            <Select value={actGrade} onChange={(e) => setActGrade(e.target.value as LeadGrade)}>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ангиллын шалтгаан" hint="Системийн саналаас зөрвөл заавал (F-113)">
            <Input value={actReason} onChange={(e) => setActReason(e.target.value)} />
          </Field>
          <Field label="Дараагийн алхам">
            <Input value={actStep} onChange={(e) => setActStep(e.target.value)} placeholder="Үзлэг товлох" />
          </Field>
          <Field label="Алхмын огноо">
            <Input type="date" value={actDate ?? ""} onChange={(e) => setActDate(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Ангилал (F-113) */}
      <Modal
        open={gradeOpen}
        onClose={() => setGradeOpen(false)}
        title="Ангилал өөрчлөх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setGradeOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () => setLeadGrade(lead.id, gradeVal, gradeReason.trim() || null),
                  () => setGradeOpen(false)
                )
              }
              disabled={pending}
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Ангилал">
            <Select value={gradeVal} onChange={(e) => setGradeVal(e.target.value as LeadGrade)}>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан" hint="Системийн санал болгосноос өөр бол заавал (F-113)">
            <Input value={gradeReason} onChange={(e) => setGradeReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Шилжүүлэх (зарчим 6) */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Эзэмшигч шилжүүлэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setReassignOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () =>
                    reassignLead({
                      leadId: lead.id,
                      newOwnerId: newOwner,
                      reasonCode: reason,
                      note: reasonNote.trim() || null,
                    }),
                  () => setReassignOpen(false)
                )
              }
              disabled={pending || !newOwner}
            >
              Шилжүүлэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Шинэ эзэмшигч">
            <Select value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
              <option value="">— Сонгох —</option>
              {agents.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан (заавал — эзэмшлийн түүхэд бичигдэнэ)">
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReassignReason)}>
              {REASSIGN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASSIGN_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тэмдэглэл">
            <Input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

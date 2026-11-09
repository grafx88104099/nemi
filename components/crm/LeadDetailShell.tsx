"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, PauseCircle, RefreshCcw, KanbanSquare, PenLine, Sparkles, Pencil, Plus } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { NextStepGuard } from "@/components/crm/NextStepGuard";
import { DuplicateHint } from "@/components/crm/DuplicateHint";
import { ActivityComposer } from "@/components/crm/ActivityComposer";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { ContactActionBar } from "@/components/crm/ContactActionBar";
import { QuickLogSheet, markCallStarted, useReturnFromCall } from "@/components/crm/QuickLogSheet";
import { NeedProfileForm, NeedProfileSummary } from "@/components/crm/NeedProfileForm";
import { MatchList } from "@/components/crm/MatchList";
import { OwnershipPanel } from "@/components/crm/OwnershipPanel";
import { OpportunityCreateModal } from "@/components/crm/OpportunityCreateModal";
import { LeadListingCard } from "@/components/crm/LeadListingCard";
import { TrackEnrollButton } from "@/components/crm/mobile/TrackEnrollButton";
import { activateLead, refreshLeadScore, setLeadGrade, setLeadStatus, updateLead } from "@/lib/actions/crm-leads";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import { recontactDays, SCORE_CRITERIA, type ScoreWeights } from "@/lib/crm/scoring";
import {
  NEXT_STEP_CODES,
  NEXT_STEP_LABEL,
  gradeTimelineMismatch,
  leadSlaState,
  slaStateLabel,
  ubToday,
  type NextStepCode,
} from "@/lib/crm/agent-core";
import type { LeadCardData } from "@/lib/queries-crm-lead-card";
import type { TrackTemplate } from "@/lib/queries-crm-worklists";
import {
  CRM_LIFECYCLE_LABEL,
  LEAD_GRADES,
  LEAD_GRADE_LABEL,
  KYC_STATUS_LABEL,
  CONTACT_TYPE_LABEL,
  SCORE_CRITERION_LABEL,
  type CrmRole,
  type LeadGrade,
} from "@/lib/constants-crm";

/**
 * Сэжимийн карт (UX-2): толгой (нэр, ангилал, эхний холболтын хугацаа, шат,
 * Залгах), дараагийн үйлдэл, табууд — Түүх (бүртгэл + түүх), Хэрэгцээ,
 * Тохируулга, Оноо, Эзэмшил. Утсан дээр доод мөрөнд Залгах / Үр дүн бүртгэх.
 * Эхний холболтыг зөвхөн үйл ажиллагааны бүртгэлээр тэмдэглэнэ.
 */

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function codeFromText(text: string | null): NextStepCode | "" {
  if (!text) return "";
  const hit = NEXT_STEP_CODES.find((c) => text.startsWith(NEXT_STEP_LABEL[c]));
  return hit ?? "";
}

export function LeadDetailShell({
  data,
  me,
  agentName,
  roles,
  basePath,
  trackTemplates = [],
}: {
  data: LeadCardData;
  me: string;
  agentName?: string | null;
  roles: CrmRole[];
  basePath: string;
  /** Ажлын цувааны загвар (агентын панель). Хоосон бол товч харагдахгүй. */
  trackTemplates?: TrackTemplate[];
}) {
  const { lead, settings } = data;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState("history");
  const [now] = useState(() => new Date());
  const today = ubToday(now);

  const [quickOpen, setQuickOpen] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [oppOpen, setOppOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditId, setProfileEditId] = useState<string | null>(null);

  // Идэвхжүүлэх
  const [activateOpen, setActivateOpen] = useState(false);
  const [actGrade, setActGrade] = useState<LeadGrade | "">(lead.grade ?? data.suggestedGrade ?? "");
  const [actReason, setActReason] = useState("");
  const [actCode, setActCode] = useState<NextStepCode | "">(codeFromText(lead.next_step));
  const [actDate, setActDate] = useState(lead.next_step_date && lead.next_step_date >= today ? lead.next_step_date : "");
  const [actMissing, setActMissing] = useState<string[]>([]);

  // Ангилал
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeVal, setGradeVal] = useState<LeadGrade | "">(lead.grade ?? "");
  const [gradeReason, setGradeReason] = useState("");

  // Идэвхгүй болгох
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [inactiveReason, setInactiveReason] = useState("");

  // Дараагийн үйлдэл
  const [stepEdit, setStepEdit] = useState(false);
  const [stepCode, setStepCode] = useState<NextStepCode | "">(codeFromText(lead.next_step));
  const [stepDate, setStepDate] = useState(lead.next_step_date ?? "");

  const isOpen = lead.status === "new" || lead.status === "active";
  // crm_leads_update RLS-ийн нөхцөл: маркетинг, МУТСТ зэрэг зөвхөн харах эрхтэд товч гарахгүй.
  const canEditListing =
    lead.owner_id === me ||
    (!lead.owner_id && lead.created_by === me) ||
    roles.some((r) => r === "team_lead" || r === "sales_director" || r === "ops_qc" || r === "ceo");
  const openOpp = lead.opportunities.find((o) => o.state === "open") ?? null;
  const stageName = openOpp?.stage_name ?? null;
  const primaryPhone = lead.contact.phones.find((p) => p.is_primary) ?? lead.contact.phones[0];
  const phoneDisplay = primaryPhone ? formatPhone(normalizePhone(primaryPhone.raw)) || primaryPhone.raw : null;
  const sla = slaStateLabel(leadSlaState(lead, now, settings.noContactHours));
  const breakdown = (lead.score_breakdown ?? {}) as Record<string, number>;
  const activeProfiles = data.needProfiles.filter((p) => p.status === "active" || p.status === "paused");
  const bestProfile = activeProfiles[0] ?? null;
  const timelineMismatch = gradeTimelineMismatch(lead.grade, bestProfile?.timeline);

  const suggestDate = useCallback(
    (g: LeadGrade | "") =>
      g ? addDays(today, recontactDays(g, openOpp?.stage_code ?? null, settings.recontactRanges)) : "",
    [today, openOpp?.stage_code, settings.recontactRanges]
  );

  useReturnFromCall(lead.id, () => setQuickOpen(true));

  function run(fn: () => Promise<{ ok?: boolean; error?: string; missing?: string[] }>, okMsg: string, onOk?: () => void) {
    setActMissing([]);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        if (res.missing) setActMissing(res.missing);
        return;
      }
      toast.success(okMsg);
      onOk?.();
      router.refresh();
    });
  }

  function openFullComposer() {
    setTab("history");
    setComposerKey((k) => k + 1);
    setTimeout(() => document.getElementById("lead-composer")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const editingProfile = profileEditId ? data.needProfiles.find((p) => p.id === profileEditId) ?? null : null;
  const totalMatches = Object.values(data.profileMatches).reduce((n, r) => n + r.length, 0);
  const pipelineDefault = lead.contact.contact_types.includes("tenant")
    ? "PL-3"
    : lead.contact.contact_types.includes("seller") || lead.contact.contact_types.includes("landlord")
      ? "PL-2"
      : "PL-1";
  const weights: ScoreWeights = data.weights;

  return (
    <div className="space-y-4">
      <BackLink href={`${basePath}/leads`} label="Сэжимийн жагсаалт" />

      {/* Толгой */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{lead.contact.display_name}</h1>
            <Badge tone={CRM_LIFECYCLE_LABEL[lead.status].tone}>{CRM_LIFECYCLE_LABEL[lead.status].label}</Badge>
            {lead.grade ? <Badge tone={LEAD_GRADE_LABEL[lead.grade].tone}>{LEAD_GRADE_LABEL[lead.grade].label}</Badge> : null}
            {stageName ? <Badge tone="blue">{stageName}</Badge> : null}
            {sla ? <Badge tone={sla.tone}>{sla.label}</Badge> : null}
            {lead.unprotected ? <Badge tone="amber">Хамгаалалтгүй</Badge> : null}
            {lead.contact.kyc_public_status !== "pending" ? (
              <Badge tone={KYC_STATUS_LABEL[lead.contact.kyc_public_status].tone}>
                {KYC_STATUS_LABEL[lead.contact.kyc_public_status].label}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Link href={`${basePath}/contacts/${lead.contact.id}`} className="font-mono text-xs text-brand-700 hover:underline">
              {lead.contact.number}
            </Link>
            {phoneDisplay ? <span className="font-mono text-xs">{phoneDisplay}</span> : null}
            {lead.source_label ? (
              <span>
                Эх сурвалж: {lead.source_label}
                {lead.source_detail ? ` — ${lead.source_detail}` : ""}
              </span>
            ) : null}
            <span>{lead.contact.contact_types.map((t) => CONTACT_TYPE_LABEL[t]).join(", ")}</span>
            <span>
              Анх бүртгэсэн: {lead.created_by_name ?? "—"} · {fmtDateTime(lead.created_at)}
            </span>
          </div>
        </div>
      </div>

      <ContactActionBar
        phone={primaryPhone?.raw ?? null}
        email={lead.contact.emails[0]?.email ?? null}
        name={lead.contact.display_name}
        agentName={agentName}
        onCall={() => markCallStarted(lead.id)}
        onLog={isOpen || lead.status === "inactive" ? () => setQuickOpen(true) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        {isOpen && !openOpp ? (
          <Button size="sm" variant="secondary" onClick={() => setOppOpen(true)}>
            <KanbanSquare className="size-4" /> Боломж үүсгэх
          </Button>
        ) : null}
        {openOpp ? (
          <Link
            href={basePath.startsWith("/office") ? `/office/crm/deals/${openOpp.id}` : `${basePath}/pipeline/${openOpp.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          >
            <KanbanSquare className="size-4" /> Боломж: {openOpp.stage_name ?? "нээх"}
          </Link>
        ) : null}
        {isOpen && lead.owner_id === me && trackTemplates.length > 0 ? (
          <TrackEnrollButton templates={trackTemplates} leadId={lead.id} name={lead.contact.display_name} />
        ) : null}
        {isOpen && basePath.startsWith("/agent") ? (
          <Link
            href="/agent/crm/links?new=collection"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            Сонголтын жагсаалт илгээх
          </Link>
        ) : null}
        {lead.status === "new" || lead.status === "inactive" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setActDate((d) => d || suggestDate(actGrade));
              setActivateOpen(true);
            }}
            disabled={pending}
          >
            <Play className="size-4" /> Идэвхжүүлэх
          </Button>
        ) : null}
        {lead.status === "active" ? (
          <Button size="sm" variant="outline" onClick={() => setInactiveOpen(true)} disabled={pending}>
            <PauseCircle className="size-4" /> Идэвхгүй болгох
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setGradeOpen(true)}>
          Ангилал өөрчлөх
        </Button>
      </div>

      {actMissing.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Дутуу:
          <ul className="mt-1 list-inside list-disc text-xs">
            {actMissing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <NextStepGuard
        status={lead.status}
        ownerName={lead.owner_name}
        grade={lead.grade}
        lastContactAt={lead.last_contact_at}
        nextStep={lead.next_step}
        nextStepDate={lead.next_step_date}
        stageName={stageName}
      />

      {data.duplicates.length > 0 ? <DuplicateHint hits={data.duplicates} basePath={basePath} /> : null}

      <LeadListingCard lead={lead} canEdit={canEditListing} />

      {/* Дараагийн үйлдэл + эхний холболт */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Дараагийн үйлдэл</h3>
            {isOpen ? (
              <Button size="sm" variant="ghost" onClick={() => setStepEdit((v) => !v)}>
                {stepEdit ? "Болих" : (
                  <>
                    <Pencil className="size-4" /> Засах
                  </>
                )}
              </Button>
            ) : null}
          </div>
          {stepEdit ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Үйлдэл">
                <Select value={stepCode} onChange={(e) => setStepCode(e.target.value as NextStepCode | "")}>
                  <option value="">— Сонгох —</option>
                  {NEXT_STEP_CODES.map((c) => (
                    <option key={c} value={c}>
                      {NEXT_STEP_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Огноо" hint={lead.grade ? `Санал: ${fmtDate(suggestDate(lead.grade))}` : undefined}>
                <Input type="date" min={today} value={stepDate} onChange={(e) => setStepDate(e.target.value)} />
              </Field>
              <Button
                size="sm"
                disabled={pending || !stepCode || !stepDate}
                onClick={() =>
                  run(
                    () => updateLead({ id: lead.id, nextStep: stepCode ? NEXT_STEP_LABEL[stepCode] : null, nextStepDate: stepDate || null }),
                    "Дараагийн үйлдэл хадгалагдлаа",
                    () => setStepEdit(false)
                  )
                }
              >
                Хадгалах
              </Button>
            </div>
          ) : (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Үйлдэл</dt>
                <dd className="font-medium text-ink">{lead.next_step ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Огноо</dt>
                <dd className={lead.next_step_date && lead.next_step_date < today && isOpen ? "font-semibold text-rose-600" : "font-medium text-ink"}>
                  {lead.next_step_date ? fmtDate(lead.next_step_date) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Сүүлийн холболт</dt>
                <dd className="font-medium text-ink">{lead.last_contact_at ? fmtDateTime(lead.last_contact_at) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Эхний холболт</dt>
                <dd className="font-medium text-ink">
                  {lead.first_contact_at
                    ? fmtDateTime(lead.first_contact_at)
                    : lead.first_contact_due_at
                      ? `Хугацаа: ${fmtDateTime(lead.first_contact_due_at)}`
                      : "—"}
                </dd>
              </div>
              {lead.received_at && lead.received_at.slice(0, 16) !== lead.created_at.slice(0, 16) ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Мэдээлэл авсан</dt>
                  <dd className="font-medium text-ink">{fmtDateTime(lead.received_at)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Идэвхгүй хоног</dt>
                <dd className="font-medium text-ink">{lead.inactivity_days}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <Tabs
        items={[
          { value: "history", label: `Түүх (${data.activities.length})` },
          { value: "needs", label: `Хэрэгцээ (${activeProfiles.length})` },
          { value: "matches", label: `Тохируулга (${totalMatches})` },
          { value: "score", label: "Оноо" },
          { value: "ownership", label: "Эзэмшил" },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {tab === "history" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div id="lead-composer">
            {isOpen || lead.status === "inactive" ? (
              <ActivityComposer
                key={composerKey}
                contactId={lead.contact.id}
                leadId={lead.id}
                leadActive={lead.status === "active"}
                objections={data.objections}
                title={lead.first_contact_at ? "Үйл ажиллагаа бүртгэх" : "Эхний холболтын үр дүн бүртгэх"}
              />
            ) : (
              <EmptyState compact title="Сэжим хаагдсан" description="Энэ төлөвт шинэ үйл ажиллагаа бүртгэхгүй." />
            )}
          </div>
          <ActivityTimeline
            rows={data.activities}
            currentProfileId={me}
            emptyAction={isOpen ? { label: "Үр дүн бүртгэх", onClick: () => setQuickOpen(true) } : undefined}
          />
        </div>
      ) : null}

      {tab === "needs" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setProfileEditId(null);
                setProfileOpen(true);
              }}
            >
              <Plus className="size-4" /> Хэрэгцээний профайл
            </Button>
            <Link href={`${basePath}/contacts/${lead.contact.id}`} className="inline-flex h-9 items-center px-3 text-sm font-semibold text-brand-700 hover:underline">
              Харилцагчийн бүх профайл →
            </Link>
          </div>
          {timelineMismatch ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Ангилал ба профайлын хугацаа зөрж байна — ангиллыг дахин нягтлах эсвэл шалтгааныг тэмдэглэнэ үү.
            </p>
          ) : null}
          {activeProfiles.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Хэрэгцээний профайл алга"
              description="Шалгаруулалтын ярилцлагаар төсөв, байршил, хугацаа, 3–5 шийдвэрлэх шаардлагыг бүртгэвэл оноо, тохируулга ажиллана."
              action={{
                label: "Профайл нэмэх",
                onClick: () => {
                  setProfileEditId(null);
                  setProfileOpen(true);
                },
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {activeProfiles.map((p) => (
                <Card key={p.id}>
                  <CardBody>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-ink">Бүрэн байдал {p.completeness_pct != null ? `${Number(p.completeness_pct).toFixed(0)}%` : "—"}</h3>
                        {p.updated_at ? <p className="text-xs text-subtle">Шинэчилсэн: {fmtDate(p.updated_at)}</p> : null}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Профайл засах"
                        onClick={() => {
                          setProfileEditId(p.id);
                          setProfileOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                    <NeedProfileSummary
                      profile={p}
                      lookups={data.lookups}
                      mustHavesMin={settings.mustHavesMin}
                      onEdit={() => {
                        setProfileEditId(p.id);
                        setProfileOpen(true);
                      }}
                    />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "matches" ? (
        <div className="space-y-4">
          {Object.keys(data.profileMatches).length === 0 ? (
            <EmptyState
              compact
              title="Тохируулга хийх профайл алга"
              description="Идэвхтэй хэрэгцээний профайл бүртгэхэд тохирох үл хөдлөх энд гарна."
              action={{ label: "Профайл нэмэх", onClick: () => setTab("needs") }}
            />
          ) : (
            Object.entries(data.profileMatches).map(([profileId, rows]) => (
              <Card key={profileId}>
                <CardBody>
                  <MatchList rows={rows} perspective="profile" targetId={profileId} basePath={basePath} />
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === "score" ? (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Сэжимийн оноо (100)</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-brand-700">{lead.score != null ? Number(lead.score).toFixed(0) : "—"}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Оноо шинэчлэх"
                  onClick={() => run(() => refreshLeadScore(lead.id), "Оноо шинэчлэгдлээ")}
                  disabled={pending}
                >
                  <RefreshCcw className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {SCORE_CRITERIA.map((key) => {
                const max = weights[key];
                const val = Number(breakdown[key] ?? 0);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">{SCORE_CRITERION_LABEL[key]}</span>
                      <span className="font-semibold text-ink">
                        {val.toFixed(1)} / {max}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${max > 0 ? Math.min(100, (val / max) * 100) : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
              <p>
                Системийн санал:{" "}
                <span className="font-semibold text-ink">{data.suggestedGrade ? LEAD_GRADE_LABEL[data.suggestedGrade].label : "оноо хангалтгүй"}</span>
                {activeProfiles.length === 0 ? " — хэрэгцээний профайл бүртгэгдээгүй тул оноо бага" : ""}
              </p>
              <p>Одоогийн ангилал: {lead.grade ? LEAD_GRADE_LABEL[lead.grade].label : "тодорхойгүй"}</p>
              {lead.grade_override_reason ? <p>Гар өөрчлөлтийн шалтгаан: {lead.grade_override_reason}</p> : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "ownership" ? (
        data.ownership ? (
          <OwnershipPanel ownership={data.ownership} me={me} roles={roles} agents={data.ownerCandidates} basePath={basePath} />
        ) : (
          <EmptyState compact title="Эзэмшлийн мэдээлэл ачаалагдсангүй" description="Хуудсыг дахин ачаална уу." />
        )
      ) : null}

      <QuickLogSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        contactId={lead.contact.id}
        leadId={lead.id}
        grade={lead.grade}
        leadIsNew={lead.status === "new"}
        retryHours={settings.retryHours}
        recontactRanges={settings.recontactRanges}
        onFull={openFullComposer}
      />

      <OpportunityCreateModal
        open={oppOpen}
        onClose={() => setOppOpen(false)}
        pipelines={data.pipelines}
        defaultPipelineCode={pipelineDefault}
        prefill={{ leadId: lead.id, contactId: lead.contact.id, label: lead.contact.display_name }}
        dealPath={basePath.startsWith("/office") ? "/office/crm/deals" : "/agent/crm/pipeline"}
      />

      <NeedProfileForm
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        contactId={lead.contact.id}
        initial={editingProfile}
        lookups={data.lookups}
        mustHavesMin={settings.mustHavesMin}
      />

      {/* Идэвхжүүлэх */}
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
              disabled={pending || !actGrade || !actCode || !actDate}
              onClick={() =>
                run(
                  () =>
                    activateLead(lead.id, {
                      grade: actGrade as LeadGrade,
                      gradeOverrideReason: actReason.trim() || null,
                      nextStep: actCode ? NEXT_STEP_LABEL[actCode] : "",
                      nextStepDate: actDate,
                    }),
                  "Сэжим идэвхжлээ",
                  () => setActivateOpen(false)
                )
              }
            >
              Идэвхжүүлэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Идэвхтэй сэжимд утга бүхий холболт, ангилал, дараагийн үйлдэл ба огноо заавал. Холболтоо эхлээд «Үр дүн
            бүртгэх»-ээр бүртгэнэ.
          </p>
          <Field
            label="Ангилал"
            hint={data.suggestedGrade ? `Системийн санал: ${LEAD_GRADE_LABEL[data.suggestedGrade].label}` : undefined}
          >
            <Select
              value={actGrade}
              onChange={(e) => {
                const g = e.target.value as LeadGrade | "";
                setActGrade(g);
                setActDate(suggestDate(g));
              }}
            >
              <option value="">— Сонгох —</option>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          {actGrade && data.suggestedGrade && actGrade !== data.suggestedGrade ? (
            <Field label="Ангиллын шалтгаан (заавал)">
              <Input value={actReason} onChange={(e) => setActReason(e.target.value)} />
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Дараагийн үйлдэл">
              <Select value={actCode} onChange={(e) => setActCode(e.target.value as NextStepCode | "")}>
                <option value="">— Сонгох —</option>
                {NEXT_STEP_CODES.map((c) => (
                  <option key={c} value={c}>
                    {NEXT_STEP_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Огноо" hint="Ангиллын эргэн холбогдох давтамжаар санал болгосон">
              <Input type="date" min={today} value={actDate} onChange={(e) => setActDate(e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Ангилал */}
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
              disabled={pending || !gradeVal}
              onClick={() =>
                run(
                  () => setLeadGrade(lead.id, gradeVal as LeadGrade, gradeReason.trim() || null),
                  "Ангилал хадгалагдлаа",
                  () => setGradeOpen(false)
                )
              }
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field
            label="Ангилал"
            hint={data.suggestedGrade ? `Системийн санал: ${LEAD_GRADE_LABEL[data.suggestedGrade].label}` : "Оноо хангалтгүй — профайлаа бөглөнө үү"}
          >
            <Select value={gradeVal} onChange={(e) => setGradeVal(e.target.value as LeadGrade | "")}>
              <option value="">— Сонгох —</option>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          {gradeVal ? (
            <p className="text-xs text-muted">
              Эргэн холбогдох санал болгох огноо: <span className="font-semibold text-ink">{fmtDate(suggestDate(gradeVal))}</span>
            </p>
          ) : null}
          {gradeVal && data.suggestedGrade && gradeVal !== data.suggestedGrade ? (
            <Field label="Шалтгаан (заавал)">
              <Input value={gradeReason} onChange={(e) => setGradeReason(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </Modal>

      {/* Идэвхгүй болгох */}
      <Modal
        open={inactiveOpen}
        onClose={() => setInactiveOpen(false)}
        title="Идэвхгүй болгох"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setInactiveOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              disabled={pending || inactiveReason.trim().length < 10}
              onClick={() =>
                run(() => setLeadStatus(lead.id, "inactive", inactiveReason.trim()), "Сэжим идэвхгүй боллоо", () => setInactiveOpen(false))
              }
            >
              Идэвхгүй болгох
            </Button>
          </div>
        }
      >
        <Field label="Шалтгаан (заавал)" hint="Яагаад идэвхгүй болгож байгаа, хэзээ эргэн холбогдох нь зүйтэй вэ">
          <textarea
            value={inactiveReason}
            onChange={(e) => setInactiveReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
      </Modal>

      {!isOpen && lead.status !== "inactive" ? (
        <p className="text-xs text-subtle">
          <PenLine className="mr-1 inline size-3.5" />
          Эргэлтэд оруулах, дахин хуваарилах үйлдлийг «Эзэмшил» хэсгээс хийнэ.
        </p>
      ) : null}
    </div>
  );
}

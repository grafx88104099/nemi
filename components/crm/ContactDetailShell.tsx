"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, KanbanSquare, ShieldQuestion, Handshake, Flame, Sparkles } from "lucide-react";

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
import { NeedProfileForm, NeedProfileSummary } from "@/components/crm/NeedProfileForm";
import { OwnerProfileForm } from "@/components/crm/OwnerProfileForm";
import { NpsPanel, type NpsSurveyRow } from "@/components/crm/NpsPanel";
import { ReferralPanel, type ReferralRow } from "@/components/crm/ReferralPanel";
import { MatchList } from "@/components/crm/MatchList";
import { ActivityComposer } from "@/components/crm/ActivityComposer";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { ContactActionBar } from "@/components/crm/ContactActionBar";
import { QuickLogSheet, markCallStarted, useReturnFromCall } from "@/components/crm/QuickLogSheet";
import { OpportunityCreateModal } from "@/components/crm/OpportunityCreateModal";
import { CoiDeclareModal } from "@/components/crm/OwnershipPanel";
import {
  addPhone,
  removePhone,
  addEmail,
  removeEmail,
  setConsent,
  addTags,
  removeTags,
  updateContact,
} from "@/lib/actions/crm-contacts";
import { createLead } from "@/lib/actions/crm-leads";
import { setNeedProfileStatus, setOwnerProfileStatus } from "@/lib/actions/crm-profiles";
import { createDataRequest } from "@/lib/actions/crm-ownership";
import { DATA_REQUEST_KINDS, DATA_REQUEST_KIND_LABEL, type DataRequestKind } from "@/lib/validation/crm-ownership";
import { fmtDate, fmtDateTime, fmtMNT } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import {
  NEXT_STEP_CODES,
  NEXT_STEP_LABEL,
  OWNER_URGENCY_LABEL,
  PRIVACY_LEVELS,
  PRIVACY_LEVEL_LABEL,
  ubToday,
  type NextStepCode,
  type OwnerUrgency,
  type PrivacyLevel,
} from "@/lib/crm/agent-core";
import type { ContactCardData } from "@/lib/queries-crm-lead-card";
import type { NeedProfileRow, OwnerProfileRow } from "@/lib/queries-crm-contacts";
import type { BranchRow } from "@/lib/queries-crm-core";
import {
  CONTACT_KIND_LABEL,
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  CRM_LIFECYCLE_LABEL,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
  KYC_STATUS_LABEL,
  LEAD_GRADE_LABEL,
  PROFILE_STATUSES,
  PROFILE_STATUS_LABEL,
  TAG_GROUPS,
  TAG_GROUP_LABEL,
  type ConsentStatus,
  type ContactType,
  type CrmRole,
  type ProfileStatus,
  type LeadGrade,
  type CrmLifecycle,
  type TagGroup,
} from "@/lib/constants-crm";
import {
  NEED_PROFILE_TYPE_LABEL,
  OWNER_GOAL_LABEL,
  LISTING_STATE_LABEL,
  DECISION_AUTHORITY_LABEL,
  type NeedProfileType,
} from "@/lib/validation/crm";

/**
 * Харилцагчийн 360° карт: холболтын мөр (Залгах/Мессеж/Загвар/Үр дүн),
 * үйл ажиллагааны бүртгэл + түүх (нээлттэй сэжимд автоматаар холбогдоно),
 * профайлууд (§6.7 бүх талбар, дутуу талбар), сэжим, боломж, тохируулга,
 * 7 бүлгийн шошго, нууцлал ба хувийн мэдээллийн хүсэлт, ашиг сонирхлын
 * мэдүүлэг, засах маягт.
 */
export function ContactDetailShell({
  card,
  me,
  roles,
  basePath,
  branches = [],
  npsSurveys = [],
  referrals = [],
}: {
  card: ContactCardData;
  me: string;
  roles: CrmRole[];
  basePath: string;
  branches?: BranchRow[];
  npsSurveys?: NpsSurveyRow[];
  referrals?: ReferralRow[];
}) {
  const { data, settings } = card;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState("history");

  const c = data.contact;
  const canMerge = roles.includes("ops_qc");
  const openLead = card.openLead;
  const primary = c.phones.find((p) => p.is_primary) ?? c.phones[0];

  const [quickOpen, setQuickOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [coiOpen, setCoiOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Профайлын маягтууд
  const [needFormOpen, setNeedFormOpen] = useState(false);
  const [needEdit, setNeedEdit] = useState<NeedProfileRow | null>(null);
  const [ownerFormOpen, setOwnerFormOpen] = useState(false);
  const [ownerEdit, setOwnerEdit] = useState<OwnerProfileRow | null>(null);

  // Профайлын төлөв
  const [statusTarget, setStatusTarget] = useState<{ kind: "need" | "owner"; id: string; from: ProfileStatus } | null>(null);
  const [statusVal, setStatusVal] = useState<ProfileStatus>("paused");
  const [pausedUntil, setPausedUntil] = useState("");
  const [lostReasonId, setLostReasonId] = useState("");
  const [fulfilledTxnId, setFulfilledTxnId] = useState("");

  // Мэдээлэл
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [consentVal, setConsentVal] = useState<ConsentStatus>(c.consent);
  const [consentChannel, setConsentChannel] = useState(c.consent_channel ?? "");

  // Засах
  const [eLast, setELast] = useState(c.last_name ?? "");
  const [eFirst, setEFirst] = useState(c.first_name ?? "");
  const [eOrg, setEOrg] = useState(c.org_name ?? "");
  const [eTypes, setETypes] = useState<ContactType[]>(c.contact_types);
  const [eSource, setESource] = useState(c.source_id ?? "");
  const [eSourceDetail, setESourceDetail] = useState(c.source_detail ?? "");
  const [eBranch, setEBranch] = useState(c.branch_id ?? "");
  const [ePrivacy, setEPrivacy] = useState<PrivacyLevel>((c.privacy_level as PrivacyLevel) ?? "standard");

  // Шинэ сэжим
  const [lSource, setLSource] = useState(c.source_id ?? "");
  const [lDetail, setLDetail] = useState("");
  const [lCode, setLCode] = useState<NextStepCode | "">("");
  const [lDate, setLDate] = useState("");

  // Хувийн мэдээллийн хүсэлт
  const [drKind, setDrKind] = useState<DataRequestKind | "">("");
  const [drChannel, setDrChannel] = useState("");
  const [drNote, setDrNote] = useState("");

  useReturnFromCall(c.id, () => setQuickOpen(true));

  function run(fn: () => Promise<{ ok?: boolean; error?: string; id?: string }>, okMsg: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(okMsg);
      onOk?.();
      router.refresh();
    });
  }

  function submitProfileStatus() {
    if (!statusTarget) return;
    const payload = {
      id: statusTarget.id,
      status: statusVal,
      pausedUntil: statusVal === "paused" ? pausedUntil || null : null,
      lostReasonId: statusVal === "lost" ? lostReasonId || null : null,
      fulfilledTxnId: statusVal === "fulfilled" ? fulfilledTxnId || null : null,
      nextStep: null,
    };
    run(
      () => (statusTarget.kind === "need" ? setNeedProfileStatus(payload) : setOwnerProfileStatus(payload)),
      "Профайлын төлөв хадгалагдлаа",
      () => setStatusTarget(null)
    );
  }

  function submitEdit() {
    run(
      () =>
        updateContact({
          id: c.id,
          kind: c.kind,
          lastName: eLast.trim() || null,
          firstName: eFirst.trim() || null,
          orgName: eOrg.trim() || null,
          contactTypes: eTypes,
          sourceId: eSource,
          sourceDetail: eSourceDetail.trim() || null,
          branchId: eBranch || null,
          phones: c.phones.map((p) => p.raw),
          emails: c.emails.map((e) => e.email),
          consent: c.consent,
          consentChannel: c.consent_channel,
          privacyLevel: ePrivacy,
        }).then((r) => (r.ok ? {} : { error: r.error ?? "Хадгалж чадсангүй." })),
      "Харилцагчийн мэдээлэл хадгалагдлаа",
      () => setEditOpen(false)
    );
  }

  function submitLead() {
    if (!lSource) {
      toast.error("Эх сурвалж сонгоно уу.");
      return;
    }
    run(
      () =>
        createLead({
          contactId: c.id,
          newContact: null,
          sourceId: lSource,
          sourceDetail: lDetail.trim() || null,
          campaignCode: null,
          channelRef: null,
          branchId: c.branch_id,
          grade: null,
          gradeOverrideReason: null,
          nextStep: lCode ? NEXT_STEP_LABEL[lCode] : null,
          nextStepDate: lCode ? lDate || null : null,
        }).then((r) => {
          if (r.id) router.push(`${basePath}/leads/${r.id}`);
          return r;
        }),
      "Сэжим нээгдлээ",
      () => setLeadOpen(false)
    );
  }

  function submitDataRequest() {
    if (!drKind) {
      toast.error("Хүсэлтийн төрлийг сонгоно уу.");
      return;
    }
    run(
      () => createDataRequest({ contactId: c.id, kind: drKind, channel: drChannel.trim() || undefined, note: drNote.trim() || undefined }),
      "Хүсэлт бүртгэгдэж, Үйл ажиллагаа-ЧМТ-д очлоо",
      () => {
        setPrivacyOpen(false);
        setDrKind("");
        setDrChannel("");
        setDrNote("");
      }
    );
  }

  const contactTagIds = new Set(c.tags.map((t) => t.lookup_id));
  const tagsByGroup = TAG_GROUPS.map((g) => ({ group: g, rows: card.tags.filter((t) => t.tag_group === g) }));
  const ungrouped = card.tags.filter((t) => !t.tag_group || !(TAG_GROUPS as readonly string[]).includes(t.tag_group));
  const totalMatches = Object.values(card.profileMatches).reduce((n, r) => n + r.length, 0);
  const openOpp = data.opportunities.find((o) => o.state === "open");

  return (
    <div className="space-y-4">
      <BackLink href={`${basePath}/contacts`} label="Харилцагчийн сан" />

      {c.merged_into_id ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Энэ бүртгэл нэгтгэгдсэн (архив).{" "}
          <Link href={`${basePath}/contacts/${c.merged_into_id}`} className="font-semibold underline">
            Үндсэн бүртгэл рүү очих
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{c.display_name}</h1>
            <Badge tone={CRM_LIFECYCLE_LABEL[c.lifecycle as CrmLifecycle].tone}>{CRM_LIFECYCLE_LABEL[c.lifecycle as CrmLifecycle].label}</Badge>
            {c.kyc_public_status !== "pending" ? (
              <Badge tone={KYC_STATUS_LABEL[c.kyc_public_status].tone}>{KYC_STATUS_LABEL[c.kyc_public_status].label}</Badge>
            ) : null}
            <Badge tone={CONSENT_STATUS_LABEL[c.consent].tone}>{CONSENT_STATUS_LABEL[c.consent].label}</Badge>
            {c.privacy_level === "restricted" ? <Badge tone="amber">Нууцлал: хязгаарлагдмал</Badge> : null}
            {c.is_repeat ? <Badge tone="brand">Давтан харилцагч</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-mono text-xs">{c.number}</span>
            <span>{CONTACT_KIND_LABEL[c.kind]}</span>
            <span>{c.contact_types.map((t) => CONTACT_TYPE_LABEL[t]).join(", ")}</span>
            {c.source_label ? (
              <span>
                Эх сурвалж: {c.source_label}
                {c.source_detail ? ` — ${c.source_detail}` : ""}
              </span>
            ) : null}
            <span>
              Анх бүртгэсэн: {c.created_by_name ?? "—"} · {fmtDate(c.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} disabled={!!c.merged_into_id}>
            <Pencil className="size-4" /> Засах
          </Button>
          {canMerge && !c.merged_into_id ? (
            <Button size="sm" variant="outline" onClick={() => router.push(`${basePath}/contacts/merge?a=${c.id}`)}>
              Нэгтгэх сонголт
            </Button>
          ) : null}
        </div>
      </div>

      {!c.merged_into_id ? (
        <ContactActionBar
          phone={primary?.raw ?? null}
          email={c.emails[0]?.email ?? null}
          name={c.display_name}
          onCall={() => markCallStarted(c.id)}
          onLog={() => setQuickOpen(true)}
        />
      ) : null}

      {!c.merged_into_id ? (
        <div className="flex flex-wrap items-center gap-2">
          {openLead ? (
            <Link
              href={`${basePath}/leads/${openLead.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100"
            >
              <Flame className="size-4" /> Нээлттэй сэжим
              {openLead.grade ? ` · ${openLead.grade.toUpperCase()}` : ""}
            </Link>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setLeadOpen(true)}>
              <Flame className="size-4" /> Сэжим нээх
            </Button>
          )}
          {openOpp ? null : (
            <Button size="sm" variant="outline" onClick={() => setOppOpen(true)}>
              <KanbanSquare className="size-4" /> Боломж үүсгэх
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCoiOpen(true)}>
            <Handshake className="size-4" /> Хамаарал мэдүүлэх
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPrivacyOpen(true)}>
            <ShieldQuestion className="size-4" /> Хувийн мэдээллийн хүсэлт
          </Button>
        </div>
      ) : null}

      <Tabs
        items={[
          { value: "history", label: `Түүх (${card.activities.length})` },
          { value: "profiles", label: `Профайл (${data.needProfiles.length + data.ownerProfiles.length})` },
          { value: "leads", label: `Сэжим, боломж (${data.leads.length + data.opportunities.length})` },
          { value: "matches", label: `Тохируулга (${totalMatches})` },
          { value: "postsale", label: `Сэтгэл ханамж (${npsSurveys.length + referrals.length})` },
          { value: "info", label: "Мэдээлэл" },
          { value: "merge", label: "Нэгтгэл" },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {tab === "history" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {!c.merged_into_id ? (
            <div>
              <ActivityComposer
                contactId={c.id}
                leadId={openLead?.id ?? null}
                leadActive={openLead?.status === "active"}
                objections={card.objections}
              />
              {!openLead ? (
                <p className="mt-2 text-xs text-muted">Нээлттэй сэжим байхгүй тул бүртгэл зөвхөн харилцагчид хадгалагдана.</p>
              ) : null}
            </div>
          ) : null}
          <ActivityTimeline
            rows={card.activities}
            currentProfileId={me}
            emptyAction={!c.merged_into_id ? { label: "Үр дүн бүртгэх", onClick: () => setQuickOpen(true) } : undefined}
          />
        </div>
      ) : null}

      {tab === "profiles" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setNeedEdit(null);
                setNeedFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Хэрэгцээний профайл
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOwnerEdit(null);
                setOwnerFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Өмчлөгчийн профайл
            </Button>
          </div>

          {data.needProfiles.length === 0 && data.ownerProfiles.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              compact
              title="Профайл бүртгэгдээгүй"
              description="Шалгаруулалтын дараа хэрэгцээний эсвэл өмчлөгчийн профайл үүсгэнэ."
            />
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.needProfiles.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">{NEED_PROFILE_TYPE_LABEL[p.profile_type as NeedProfileType] ?? "Хэрэгцээ"}</h3>
                        <Badge tone={PROFILE_STATUS_LABEL[p.status as ProfileStatus].tone}>{PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        Үүсгэсэн: {fmtDate(p.created_at)}
                        {p.updated_at ? ` · Шинэчилсэн: ${fmtDate(p.updated_at)}` : ""}
                        {p.completeness_pct != null ? ` · Бүрэн байдал ${Number(p.completeness_pct).toFixed(0)}%` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Засах"
                      onClick={() => {
                        setNeedEdit(p);
                        setNeedFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2">
                    <NeedProfileSummary
                      profile={p}
                      lookups={card.lookups}
                      mustHavesMin={settings.mustHavesMin}
                      onEdit={() => {
                        setNeedEdit(p);
                        setNeedFormOpen(true);
                      }}
                    />
                  </div>
                  {p.status === "paused" && p.paused_until ? (
                    <p className="mt-2 text-xs text-muted">Дахин идэвхжих: {fmtDate(p.paused_until)}</p>
                  ) : null}
                  {p.status === "active" || p.status === "paused" ? (
                    <div className="mt-3 border-t border-line pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStatusTarget({ kind: "need", id: p.id, from: p.status as ProfileStatus });
                          setStatusVal(p.status === "paused" ? "active" : "paused");
                          setPausedUntil("");
                          setLostReasonId("");
                          setFulfilledTxnId("");
                        }}
                      >
                        Төлөв өөрчлөх
                      </Button>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}

            {data.ownerProfiles.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">
                          Өмчлөгч — {OWNER_GOAL_LABEL[p.goal as keyof typeof OWNER_GOAL_LABEL] ?? ""}
                        </h3>
                        <Badge tone={PROFILE_STATUS_LABEL[p.status as ProfileStatus].tone}>{PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">Үүсгэсэн: {fmtDate(p.created_at)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Засах"
                      onClick={() => {
                        setOwnerEdit(p);
                        setOwnerFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <dl className="mt-2 divide-y divide-line text-sm">
                    {[
                      ["Үл хөдлөх", p.property_id ? "Холбогдсон" : "Холбогдоогүй"],
                      ["Хүсэж буй үнэ", fmtMNT(Number(p.asking_price))],
                      ["Хүсэж буй нөхцөл", p.terms],
                      ["Яаралтай эсэх", OWNER_URGENCY_LABEL[p.urgency as OwnerUrgency] ?? p.urgency],
                      ["Шалтгаан", p.urgency_note],
                      ["Шийдвэрлэх эрх", DECISION_AUTHORITY_LABEL[p.decision_authority as keyof typeof DECISION_AUTHORITY_LABEL] ?? null],
                      ["Листингийн төлөв", LISTING_STATE_LABEL[p.listing_state as keyof typeof LISTING_STATE_LABEL] ?? null],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex justify-between gap-3 py-1">
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-right font-medium text-ink">{v ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.status === "active" || p.status === "paused" ? (
                    <div className="mt-3 border-t border-line pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStatusTarget({ kind: "owner", id: p.id, from: p.status as ProfileStatus });
                          setStatusVal(p.status === "paused" ? "active" : "paused");
                          setPausedUntil("");
                          setLostReasonId("");
                          setFulfilledTxnId("");
                        }}
                      >
                        Төлөв өөрчлөх
                      </Button>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "leads" ? (
        <div className="space-y-4">
          <Card>
            <CardBody className="p-0">
              <h3 className="border-b border-line px-5 py-3 text-sm font-bold text-ink">Сэжим</h3>
              {data.leads.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-subtle">Сэжим бүртгэгдээгүй.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.leads.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`${basePath}/leads/${l.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
                          Сэжим · {fmtDate(l.created_at)}
                        </Link>
                        <Badge tone={CRM_LIFECYCLE_LABEL[l.status].tone}>{CRM_LIFECYCLE_LABEL[l.status].label}</Badge>
                        {l.grade ? <Badge tone={LEAD_GRADE_LABEL[l.grade as LeadGrade].tone}>{l.grade.toUpperCase()}</Badge> : null}
                      </div>
                      <div className="text-xs text-muted">
                        {l.owner_name ?? "Оноогдоогүй"} · {l.next_step ?? "дараагийн үйлдэлгүй"}
                        {l.next_step_date ? ` (${fmtDate(l.next_step_date)})` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="p-0">
              <h3 className="border-b border-line px-5 py-3 text-sm font-bold text-ink">Боломж</h3>
              {data.opportunities.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-subtle">Боломж үүсээгүй.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.opportunities.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <Link
                        href={basePath.startsWith("/office") ? `/office/crm/deals/${o.id}` : `${basePath}/pipeline/${o.id}`}
                        className="text-sm font-semibold text-brand-700 hover:underline"
                      >
                        {o.pipeline_name ?? "Боломж"} · {o.stage_name ?? "—"}
                      </Link>
                      <div className="text-xs text-muted">
                        {o.owner_name ?? "—"}
                        {o.amount ? ` · ${fmtMNT(Number(o.amount))}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "info" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardBody>
              <h3 className="text-sm font-bold text-ink">Утас</h3>
              <ul className="mt-2 space-y-1.5">
                {c.phones.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <a href={`tel:${p.raw.replace(/[^\d+]/g, "")}`} className="font-mono hover:text-brand-700">
                      {formatPhone(normalizePhone(p.raw)) || p.raw}
                    </a>
                    <span className="flex items-center gap-1.5">
                      {p.is_primary ? <Badge tone="brand">Үндсэн</Badge> : null}
                      <button
                        type="button"
                        aria-label="Хасах"
                        className="text-subtle hover:text-danger"
                        onClick={() => run(() => removePhone(p.id, c.id), "Утас хасагдлаа")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Шинэ дугаар" inputMode="tel" className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Утас нэмэх"
                  disabled={pending || !newPhone.trim()}
                  onClick={() => run(() => addPhone(c.id, newPhone), "Утас нэмэгдлээ", () => setNewPhone(""))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <h3 className="mt-4 text-sm font-bold text-ink">И-мэйл</h3>
              <ul className="mt-2 space-y-1.5">
                {c.emails.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono">{e.email}</span>
                    <span className="flex items-center gap-1.5">
                      {e.is_primary ? <Badge tone="brand">Үндсэн</Badge> : null}
                      <button
                        type="button"
                        aria-label="Хасах"
                        className="text-subtle hover:text-danger"
                        onClick={() => run(() => removeEmail(e.id, c.id), "И-мэйл хасагдлаа")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@mail.mn" inputMode="email" className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="И-мэйл нэмэх"
                  disabled={pending || !newEmail.trim()}
                  onClick={() => run(() => addEmail(c.id, newEmail), "И-мэйл нэмэгдлээ", () => setNewEmail(""))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="text-sm font-bold text-ink">Зөвшөөрөл ба нууцлал</h3>
              <p className="mt-1 text-xs text-muted">
                Нууцлалын төлөв: {PRIVACY_LEVEL_LABEL[(c.privacy_level as PrivacyLevel) ?? "standard"]}. Татгалзсан харилцагчид
                маркетингийн илгээлт хийгдэхгүй.
                {c.consent_at ? ` Сүүлд: ${fmtDateTime(c.consent_at)}${c.consent_channel ? ` (${c.consent_channel})` : ""}` : ""}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={consentVal} onChange={(e) => setConsentVal(e.target.value as ConsentStatus)}>
                  {CONSENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONSENT_STATUS_LABEL[s].label}
                    </option>
                  ))}
                </Select>
                <Input value={consentChannel} onChange={(e) => setConsentChannel(e.target.value)} placeholder="Суваг (утсаар / бичгээр)" />
              </div>
              <Button
                size="sm"
                className="mt-2"
                disabled={pending}
                onClick={() => run(() => setConsent(c.id, consentVal, consentChannel.trim() || null), "Зөвшөөрөл хадгалагдлаа")}
              >
                Зөвшөөрөл хадгалах
              </Button>

              <h3 className="mt-4 text-sm font-bold text-ink">Хэрэгцээний шошго</h3>
              <div className="mt-2 space-y-2">
                {[...tagsByGroup, { group: null as TagGroup | null, rows: ungrouped }]
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <div key={g.group ?? "other"}>
                      <div className="text-xs font-semibold text-subtle">{g.group ? TAG_GROUP_LABEL[g.group] : "Бусад"}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.rows.map((t) => {
                          const hasTag = contactTagIds.has(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={pending}
                              aria-pressed={hasTag}
                              onClick={() =>
                                run(
                                  () => (hasTag ? removeTags([c.id], [t.id]) : addTags([c.id], [t.id])),
                                  hasTag ? "Шошго хасагдлаа" : "Шошго нэмэгдлээ"
                                )
                              }
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                hasTag ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                {card.tags.length === 0 ? <span className="text-xs text-subtle">Шошгын лавлах хоосон.</span> : null}
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "matches" ? (
        <div className="space-y-4">
          {data.needProfiles.length === 0 ? (
            <EmptyState compact title="Хэрэгцээний профайл алга" description="Тохируулга профайл дээр суурилж тооцогдоно." />
          ) : (
            data.needProfiles.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <h3 className="mb-2 text-sm font-bold text-ink">
                    {NEED_PROFILE_TYPE_LABEL[p.profile_type as NeedProfileType] ?? "Хэрэгцээ"} — {PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}
                  </h3>
                  <MatchList rows={card.profileMatches[p.id] ?? []} perspective="profile" targetId={p.id} basePath={basePath} />
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === "postsale" ? (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <NpsPanel surveys={npsSurveys} canSend={false} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <ReferralPanel contactId={c.id} contactName={c.display_name} referrals={referrals} basePath={basePath} />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "merge" ? (
        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-ink">Нэгтгэлийн түүх</h3>
            {data.mergeHistory.length === 0 ? (
              <p className="mt-2 text-sm text-subtle">Нэгтгэл бүртгэгдээгүй.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.mergeHistory.map((m) => (
                  <li key={`${m.merged_id}-${m.created_at}`} className="text-muted">
                    {fmtDateTime(m.created_at)} — өөр бүртгэл энэ рүү нэгтгэгдсэн (анхны огноо, эх сурвалж хадгалагдсан).
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <QuickLogSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        contactId={c.id}
        leadId={openLead?.id ?? null}
        grade={openLead?.grade ?? null}
        leadIsNew={openLead?.status === "new"}
        retryHours={settings.retryHours}
        recontactRanges={settings.recontactRanges}
        onFull={() => setTab("history")}
      />

      <OpportunityCreateModal
        open={oppOpen}
        onClose={() => setOppOpen(false)}
        pipelines={card.pipelines}
        defaultPipelineCode={
          c.contact_types.includes("seller") || c.contact_types.includes("landlord")
            ? "PL-2"
            : c.contact_types.includes("tenant")
              ? "PL-3"
              : "PL-1"
        }
        prefill={{ leadId: openLead?.id ?? null, contactId: c.id, label: c.display_name }}
        dealPath={basePath.startsWith("/office") ? "/office/crm/deals" : "/agent/crm/pipeline"}
      />

      <CoiDeclareModal open={coiOpen} onClose={() => setCoiOpen(false)} contactId={c.id} agents={card.ownerCandidates} me={me} />

      <NeedProfileForm
        open={needFormOpen}
        onClose={() => setNeedFormOpen(false)}
        contactId={c.id}
        initial={needEdit}
        lookups={card.lookups}
        mustHavesMin={settings.mustHavesMin}
      />
      <OwnerProfileForm open={ownerFormOpen} onClose={() => setOwnerFormOpen(false)} contactId={c.id} initial={ownerEdit} />

      {/* Засах */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Харилцагчийн мэдээлэл засах"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitEdit} disabled={pending || eTypes.length === 0 || !eSource}>
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {c.kind === "person" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Овог">
                <Input value={eLast} onChange={(e) => setELast(e.target.value)} />
              </Field>
              <Field label="Нэр">
                <Input value={eFirst} onChange={(e) => setEFirst(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Байгууллагын нэр">
              <Input value={eOrg} onChange={(e) => setEOrg(e.target.value)} />
            </Field>
          )}
          <Field label="Харилцагчийн төрөл">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={eTypes.includes(t)}
                  onClick={() => setETypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    eTypes.includes(t) ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {CONTACT_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Эх сурвалж">
              <Select value={eSource} onChange={(e) => setESource(e.target.value)}>
                <option value="">— Сонгох —</option>
                {card.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Эх сурвалжийн дэлгэрэнгүй">
              <Input value={eSourceDetail} onChange={(e) => setESourceDetail(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {branches.length > 0 ? (
              <Field label="Салбар">
                <Select value={eBranch} onChange={(e) => setEBranch(e.target.value)}>
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Нууцлалын төлөв">
              <Select value={ePrivacy} onChange={(e) => setEPrivacy(e.target.value as PrivacyLevel)}>
                {PRIVACY_LEVELS.map((p) => (
                  <option key={p} value={p}>
                    {PRIVACY_LEVEL_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-muted">Бүртгэсэн огноо, харилцагчийн дугаар өөрчлөгдөхгүй. Утас, и-мэйлийг «Мэдээлэл» табаас засна.</p>
        </div>
      </Modal>

      {/* Сэжим нээх */}
      <Modal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        title="Энэ харилцагч дээр сэжим нээх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setLeadOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitLead} disabled={pending}>
              Сэжим нээх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Эх сурвалж (заавал)">
            <Select value={lSource} onChange={(e) => setLSource(e.target.value)}>
              <option value="">— Сонгох —</option>
              {card.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Эх сурвалжийн дэлгэрэнгүй" hint={card.sources.find((s) => s.id === lSource)?.requires_note ? "Заавал" : undefined}>
            <Input value={lDetail} onChange={(e) => setLDetail(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Дараагийн үйлдэл">
              <Select value={lCode} onChange={(e) => setLCode(e.target.value as NextStepCode | "")}>
                <option value="">Эхний холболт</option>
                {NEXT_STEP_CODES.map((code) => (
                  <option key={code} value={code}>
                    {NEXT_STEP_LABEL[code]}
                  </option>
                ))}
              </Select>
            </Field>
            {lCode ? (
              <Field label="Огноо">
                <Input type="date" min={ubToday()} value={lDate} onChange={(e) => setLDate(e.target.value)} />
              </Field>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Хувийн мэдээллийн хүсэлт (§6.32) */}
      <Modal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="Хувийн мэдээллийн хүсэлт бүртгэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setPrivacyOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitDataRequest} disabled={pending || !drKind}>
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">Харилцагч өөрийн мэдээлэлтэй танилцах, засуулах, устгуулахыг хүсвэл энд бүртгэнэ — Үйл ажиллагаа-ЧМТ шийдвэрлэнэ.</p>
          <Field label="Хүсэлтийн төрөл">
            <Select value={drKind} onChange={(e) => setDrKind(e.target.value as DataRequestKind | "")}>
              <option value="">— Сонгох —</option>
              {DATA_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATA_REQUEST_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хүлээн авсан суваг">
            <Input value={drChannel} onChange={(e) => setDrChannel(e.target.value)} placeholder="Утсаар / бичгээр / оффист биечлэн" />
          </Field>
          <Field label="Тайлбар">
            <Input value={drNote} onChange={(e) => setDrNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Профайлын төлөвийн шилжилт */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title="Профайлын төлөв өөрчлөх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusTarget(null)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitProfileStatus} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Шинэ төлөв">
            <Select value={statusVal} onChange={(e) => setStatusVal(e.target.value as ProfileStatus)}>
              {PROFILE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROFILE_STATUS_LABEL[s].label}
                </option>
              ))}
            </Select>
          </Field>
          {statusVal === "paused" ? (
            <Field label="Дахин идэвхжүүлэх огноо (заавал)" hint="Энэ огноонд сануулга ирнэ">
              <Input type="date" min={ubToday()} value={pausedUntil} onChange={(e) => setPausedUntil(e.target.value)} />
            </Field>
          ) : null}
          {statusVal === "lost" ? (
            <Field label="Алдсан шалтгаан (заавал)">
              <Select value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
                <option value="">— Сонгох —</option>
                {card.lostReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {statusVal === "fulfilled" ? (
            <Field label="Амжилттай хаагдсан хэлцэл (заавал)" hint="Хэлцлийн хавтасны холбоосоос ID-г хуулж оруулна">
              <Input value={fulfilledTxnId} onChange={(e) => setFulfilledTxnId(e.target.value)} placeholder="Хэлцлийн ID" />
            </Field>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

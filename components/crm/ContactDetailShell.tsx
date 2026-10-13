"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { BackLink } from "@/components/ui/back-link";
import { NeedProfileForm } from "@/components/crm/NeedProfileForm";
import { OwnerProfileForm } from "@/components/crm/OwnerProfileForm";
import { NpsPanel, type NpsSurveyRow } from "@/components/crm/NpsPanel";
import { ReferralPanel, type ReferralRow } from "@/components/crm/ReferralPanel";
import { MatchList } from "@/components/crm/MatchList";
import type { MatchRow } from "@/lib/queries-crm-matching";
import {
  addPhone,
  removePhone,
  addEmail,
  removeEmail,
  setConsent,
  addTags,
  removeTags,
} from "@/lib/actions/crm-contacts";
import { setNeedProfileStatus, setOwnerProfileStatus } from "@/lib/actions/crm-profiles";
import { fmtDate, fmtDateTime, fmtMNT } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import type { Contact360, NeedProfileRow, OwnerProfileRow } from "@/lib/queries-crm-contacts";
import type { LookupRow } from "@/lib/queries-crm-core";
import {
  CONTACT_KIND_LABEL,
  CONTACT_TYPE_LABEL,
  CRM_LIFECYCLE_LABEL,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
  KYC_STATUS_LABEL,
  LEAD_GRADE_LABEL,
  PROFILE_STATUSES,
  PROFILE_STATUS_LABEL,
  type ConsentStatus,
  type CrmRole,
  type ProfileStatus,
  type LeadGrade,
  type CrmLifecycle,
} from "@/lib/constants-crm";
import {
  NEED_PROFILE_TYPE_LABEL,
  OWNER_GOAL_LABEL,
  TIMELINE_LABEL,
  FINANCING_LABEL,
  LISTING_STATE_LABEL,
  type NeedProfileType,
} from "@/lib/validation/crm";

/**
 * 360° карт (F-119, DESIGN §4.1): профайлууд (F-150–162), сэжим, мэдээлэл
 * (утас/и-мэйл/шошго/зөвшөөрөл), merge түүх. Боломж/хэлцэл/түрээсийн табууд
 * U4–U6 нэгжүүдийн дэлгэцээс холбогдоно.
 */
export function ContactDetailShell({
  data,
  goals,
  lostReasons,
  tags,
  roles,
  basePath,
  npsSurveys = [],
  referrals = [],
  profileMatches = {},
}: {
  data: Contact360;
  goals: LookupRow[];
  lostReasons: LookupRow[];
  tags: LookupRow[];
  roles: CrmRole[];
  basePath: string;
  /** P-09/F-751: энэ харилцагчийн NPS судалгаанууд (U8 mount). */
  npsSurveys?: NpsSurveyRow[];
  /** F-752/753: энэ харилцагчийн санал болгосон рефералууд (U8 mount). */
  referrals?: ReferralRow[];
  /** F-250+: хэрэгцээний профайл бүрийн тохируулга (need_profile_id → matches). */
  profileMatches?: Record<string, MatchRow[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("profiles");

  const c = data.contact;
  const canMerge = roles.includes("ops_qc");

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

  // Мэдээлэл таб
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [consentVal, setConsentVal] = useState<ConsentStatus>(c.consent);
  const [consentChannel, setConsentChannel] = useState(c.consent_channel ?? "");

  function run(fn: () => Promise<{ ok?: boolean; error?: string } | { id?: string; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
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
      () => setStatusTarget(null)
    );
  }

  const contactTagIds = new Set(c.tags.map((t) => t.lookup_id));

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
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{c.display_name}</h1>
            <Badge tone={CRM_LIFECYCLE_LABEL[c.lifecycle as CrmLifecycle].tone}>
              {CRM_LIFECYCLE_LABEL[c.lifecycle as CrmLifecycle].label}
            </Badge>
            <Badge tone={KYC_STATUS_LABEL[c.kyc_public_status].tone}>KYC: {KYC_STATUS_LABEL[c.kyc_public_status].label}</Badge>
            <Badge tone={CONSENT_STATUS_LABEL[c.consent].tone}>{CONSENT_STATUS_LABEL[c.consent].label}</Badge>
            {c.is_repeat ? <Badge tone="brand">Давтан харилцагч</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-mono text-xs">{c.number}</span>
            <span>{CONTACT_KIND_LABEL[c.kind]}</span>
            <span>{c.contact_types.map((t) => CONTACT_TYPE_LABEL[t]).join(", ")}</span>
            {c.source_label ? <span>Эх сурвалж: {c.source_label}</span> : null}
            <span>Бүртгэсэн: {fmtDate(c.created_at)} (өөрчлөх хориотой — F-106)</span>
          </div>
        </div>
        {canMerge && !c.merged_into_id ? (
          <Button size="sm" variant="outline" onClick={() => router.push(`${basePath}/contacts/merge?a=${c.id}`)}>
            Нэгтгэх сонголт
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <Tabs
        items={[
          { value: "profiles", label: `Профайл (${data.needProfiles.length + data.ownerProfiles.length})` },
          { value: "leads", label: `Сэжим (${data.leads.length})` },
          { value: "matches", label: `Тохируулга (${Object.values(profileMatches).reduce((n, r) => n + r.length, 0)})` },
          { value: "postsale", label: `Сэтгэл ханамж (${npsSurveys.length + referrals.length})` },
          { value: "info", label: "Мэдээлэл" },
          { value: "history", label: "Түүх" },
        ]}
        value={tab}
        onValueChange={setTab}
      />

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
            <p className="text-sm text-subtle">
              Профайл бүртгэгдээгүй — шалгаруулалтын дараа хэрэгцээний эсвэл өмчлөгчийн профайл үүсгэнэ (F-150).
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.needProfiles.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">
                          {NEED_PROFILE_TYPE_LABEL[p.profile_type as NeedProfileType] ?? p.profile_type}
                        </h3>
                        <Badge tone={PROFILE_STATUS_LABEL[p.status as ProfileStatus].tone}>
                          {PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">Үүсгэсэн: {fmtDate(p.created_at)}</p>
                    </div>
                    <div className="flex gap-1">
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
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Төсөв</dt>
                      <dd className="font-medium text-ink">
                        {p.budget_min != null ? `${fmtMNT(Number(p.budget_min))} – ` : ""}
                        {fmtMNT(Number(p.budget_max))}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Санхүүжилт / Хугацаа</dt>
                      <dd className="font-medium text-ink">
                        {FINANCING_LABEL[p.financing as keyof typeof FINANCING_LABEL] ?? p.financing} ·{" "}
                        {TIMELINE_LABEL[p.timeline as keyof typeof TIMELINE_LABEL] ?? p.timeline}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Байршил</dt>
                      <dd className="max-w-[60%] truncate font-medium text-ink">
                        {Array.isArray(p.locations) ? (p.locations as string[]).join(", ") : "—"}
                      </dd>
                    </div>
                    {p.status === "paused" && p.paused_until ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Дахин идэвхжих</dt>
                        <dd className="font-medium text-ink">{fmtDate(p.paused_until)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {/* Бүрэн байдал (F-159) */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Бүрэн байдал (F-159)</span>
                      <span className="font-semibold text-ink">
                        {p.completeness_pct != null ? `${Number(p.completeness_pct).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.min(100, Number(p.completeness_pct ?? 0))}%` }}
                      />
                    </div>
                  </div>
                  {(p.status === "active" || p.status === "paused") && (
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
                  )}
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
                          Өмчлөгч — {OWNER_GOAL_LABEL[p.goal as keyof typeof OWNER_GOAL_LABEL] ?? p.goal}
                        </h3>
                        <Badge tone={PROFILE_STATUS_LABEL[p.status as ProfileStatus].tone}>
                          {PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}
                        </Badge>
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
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Хүсэж буй үнэ</dt>
                      <dd className="font-medium text-ink">{fmtMNT(Number(p.asking_price))}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Листингийн төлөв</dt>
                      <dd className="font-medium text-ink">
                        {LISTING_STATE_LABEL[p.listing_state as keyof typeof LISTING_STATE_LABEL] ?? p.listing_state}
                      </dd>
                    </div>
                  </dl>
                  {(p.status === "active" || p.status === "paused") && (
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
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "leads" ? (
        <Card>
          <CardBody className="p-0">
            {data.leads.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Сэжим бүртгэгдээгүй.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`${basePath}/leads/${l.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
                        Сэжим · {fmtDate(l.created_at)}
                      </Link>
                      <Badge tone={CRM_LIFECYCLE_LABEL[l.status].tone}>{CRM_LIFECYCLE_LABEL[l.status].label}</Badge>
                      {l.grade ? (
                        <Badge tone={LEAD_GRADE_LABEL[l.grade as LeadGrade].tone}>{l.grade.toUpperCase()}</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">
                      {l.owner_name ?? "Оноогдоогүй"} · {l.next_step ?? "алхамгүй"}
                      {l.next_step_date ? ` (${fmtDate(l.next_step_date)})` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "info" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody>
              <h3 className="text-sm font-bold text-ink">Утас (F-102)</h3>
              <ul className="mt-2 space-y-1.5">
                {c.phones.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono">{formatPhone(normalizePhone(p.raw)) || p.raw}</span>
                    <span className="flex items-center gap-1.5">
                      {p.is_primary ? <Badge tone="brand">Үндсэн</Badge> : null}
                      <button
                        type="button"
                        aria-label="Хасах"
                        className="text-subtle hover:text-danger"
                        onClick={() => run(() => removePhone(p.id, c.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Шинэ дугаар" className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !newPhone.trim()}
                  onClick={() => run(() => addPhone(c.id, newPhone), () => setNewPhone(""))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <h3 className="mt-4 text-sm font-bold text-ink">И-мэйл (F-103)</h3>
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
                        onClick={() => run(() => removeEmail(e.id, c.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@mail.mn" className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !newEmail.trim()}
                  onClick={() => run(() => addEmail(c.id, newEmail), () => setNewEmail(""))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="text-sm font-bold text-ink">Зөвшөөрөл, нууцлал (F-114)</h3>
              <p className="mt-1 text-xs text-muted">
                Татгалзсан харилцагчид маркетингийн автомат илгээлт хийгдэхгүй.
                {c.consent_at ? ` Сүүлд: ${fmtDateTime(c.consent_at)}${c.consent_channel ? ` (${c.consent_channel})` : ""}` : ""}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Select value={consentVal} onChange={(e) => setConsentVal(e.target.value as ConsentStatus)}>
                  {CONSENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONSENT_STATUS_LABEL[s].label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={consentChannel}
                  onChange={(e) => setConsentChannel(e.target.value)}
                  placeholder="Суваг (утсаар / бичгээр)"
                />
              </div>
              <Button
                size="sm"
                className="mt-2"
                disabled={pending}
                onClick={() => run(() => setConsent(c.id, consentVal, consentChannel.trim() || null))}
              >
                Зөвшөөрөл хадгалах
              </Button>

              <h3 className="mt-4 text-sm font-bold text-ink">Сегментийн шошго (F-118)</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const has = contactTagIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => (has ? removeTags([c.id], [t.id]) : addTags([c.id], [t.id])))}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        has ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {tags.length === 0 ? <span className="text-xs text-subtle">Шошгоны лавлах хоосон.</span> : null}
              </div>

              <h3 className="mt-4 text-sm font-bold text-ink">Эх сурвалж</h3>
              <p className="mt-1 text-sm text-muted">
                {c.source_label ?? "—"}
                {c.source_detail ? ` · ${c.source_detail}` : ""}
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "matches" ? (
        <div className="space-y-4">
          {data.needProfiles.length === 0 ? (
            <p className="text-sm text-subtle">
              Хэрэгцээний профайл бүртгэгдээгүй — тохируулга профайл дээр суурилж тооцогдоно (F-250).
            </p>
          ) : (
            data.needProfiles.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <h3 className="mb-2 text-sm font-bold text-ink">
                    {NEED_PROFILE_TYPE_LABEL[p.profile_type as NeedProfileType] ?? p.profile_type} —{" "}
                    {PROFILE_STATUS_LABEL[p.status as ProfileStatus].label}
                  </h3>
                  <MatchList
                    rows={profileMatches[p.id] ?? []}
                    perspective="profile"
                    targetId={p.id}
                    basePath={basePath}
                  />
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
              <ReferralPanel
                contactId={c.id}
                contactName={c.display_name}
                referrals={referrals}
                basePath={basePath}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "history" ? (
        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-ink">Нэгтгэлийн түүх (F-109 — устгагдахгүй)</h3>
            {data.mergeHistory.length === 0 ? (
              <p className="mt-2 text-sm text-subtle">Нэгтгэл бүртгэгдээгүй.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.mergeHistory.map((m) => (
                  <li key={`${m.merged_id}-${m.created_at}`} className="text-muted">
                    {fmtDateTime(m.created_at)} — <span className="font-mono text-xs">{m.merged_id}</span> бүртгэл энэ рүү
                    нэгтгэгдсэн (анхны огноо, эх сурвалж merge түүхэд хадгалагдсан).
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <NeedProfileForm open={needFormOpen} onClose={() => setNeedFormOpen(false)} contactId={c.id} initial={needEdit} goals={goals} />
      <OwnerProfileForm open={ownerFormOpen} onClose={() => setOwnerFormOpen(false)} contactId={c.id} initial={ownerEdit} />

      {/* Профайлын төлөвийн шилжилт (F-155/156) */}
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
            <Field label="Дахин идэвхжүүлэх огноо (заавал)" hint="Энэ огноонд сануулга ирнэ (F-160)">
              <Input type="date" value={pausedUntil} onChange={(e) => setPausedUntil(e.target.value)} />
            </Field>
          ) : null}
          {statusVal === "lost" ? (
            <Field label="Алдсан шалтгаан (заавал — F-156)">
              <Select value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
                <option value="">— Сонгох —</option>
                {lostReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {statusVal === "fulfilled" ? (
            <Field label="Амжилттай хаагдсан хэлцлийн ID (заавал — F-156)" hint="Хэлцэлгүйгээр Хангагдсан болохгүй">
              <Input value={fulfilledTxnId} onChange={(e) => setFulfilledTxnId(e.target.value)} placeholder="Хэлцлийн UUID" />
            </Field>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

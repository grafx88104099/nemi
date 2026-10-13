"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Tags, Download, GitMerge } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { DuplicateHint } from "@/components/crm/DuplicateHint";
import {
  addTags,
  removeTags,
  createContact,
  exportContacts,
  findDuplicatesAction,
} from "@/lib/actions/crm-contacts";
import { fmtDate } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import type { ContactRow, DuplicateHit } from "@/lib/queries-crm-contacts";
import type { LookupRow, BranchRow } from "@/lib/queries-crm-core";
import {
  CONTACT_KINDS,
  CONTACT_KIND_LABEL,
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  CRM_LIFECYCLES,
  CRM_LIFECYCLE_LABEL,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
  KYC_STATUS_LABEL,
  type ContactKind,
  type ContactType,
  type ConsentStatus,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Харилцагчийн мастер сан (F-100, F-118–123): глобал хайлт, олон талбарын
 * шүүлт, багц шошго (F-122), merge сонголт (ops_qc, F-108), экспорт аудиттай
 * (F-123). basePath-аар оффис/агент dual-mount.
 */
export function ContactsPageShell({
  rows,
  sources,
  branches,
  tags,
  roles,
  basePath,
}: {
  rows: ContactRow[];
  sources: LookupRow[];
  branches: BranchRow[];
  tags: LookupRow[];
  roles: CrmRole[];
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canExport = roles.includes("sales_director") || roles.includes("ops_qc");
  const canMerge = roles.includes("ops_qc");

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const [formOpen, setFormOpen] = useState(false);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitTags() {
    if (tagIds.length === 0) {
      setError("Шошго сонгоно уу.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = tagMode === "add" ? await addTags(selected, tagIds) : await removeTags(selected, tagIds);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setTagOpen(false);
      setTagIds([]);
      setSelected([]);
      router.refresh();
    });
  }

  function doExport() {
    setError(null);
    startTransition(async () => {
      const filters = {
        q: sp.get("q") ?? undefined,
        lifecycle: (sp.get("lifecycle") as ContactRow["lifecycle"]) ?? undefined,
        kind: (sp.get("kind") as ContactKind) ?? undefined,
        contactType: (sp.get("type") as ContactType) ?? undefined,
        branchId: sp.get("branch") ?? undefined,
        sourceId: sp.get("source") ?? undefined,
        tagId: sp.get("tag") ?? undefined,
        consent: (sp.get("consent") as ConsentStatus) ?? undefined,
      };
      const res = await exportContacts(filters);
      if (res.error || !res.csv) {
        setError(res.error ?? "Экспорт амжилтгүй.");
        return;
      }
      const blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const mergeReady = canMerge && selected.length === 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Харилцагч</h1>
          <p className="text-sm text-muted">Нэг этгээд = нэг бүртгэл (F-100) · Нийт {rows.length}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setTagOpen(true)}>
              <Tags className="size-4" /> Шошго ({selected.length})
            </Button>
          ) : null}
          {mergeReady ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`${basePath}/contacts/merge?a=${selected[0]}&b=${selected[1]}`)}
            >
              <GitMerge className="size-4" /> Нэгтгэх
            </Button>
          ) : null}
          {canExport ? (
            <Button size="sm" variant="outline" onClick={doExport} disabled={pending}>
              <Download className="size-4" /> Экспорт
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Шинэ харилцагч
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {/* Шүүлт (F-119/120) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParam({ q })}
            onBlur={() => setParam({ q })}
            placeholder="Нэр, утас, дугаар…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={sp.get("lifecycle") ?? ""} onChange={(e) => setParam({ lifecycle: e.target.value || null })} className="w-40">
          <option value="">Бүх төлөв</option>
          {CRM_LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              {CRM_LIFECYCLE_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("kind") ?? ""} onChange={(e) => setParam({ kind: e.target.value || null })} className="w-40">
          <option value="">Хэлбэр</option>
          {CONTACT_KINDS.map((k) => (
            <option key={k} value={k}>
              {CONTACT_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select value={sp.get("type") ?? ""} onChange={(e) => setParam({ type: e.target.value || null })} className="w-44">
          <option value="">Бүх төрөл</option>
          {CONTACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTACT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select value={sp.get("tag") ?? ""} onChange={(e) => setParam({ tag: e.target.value || null })} className="w-44">
          <option value="">Бүх шошго</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("consent") ?? ""} onChange={(e) => setParam({ consent: e.target.value || null })} className="w-40">
          <option value="">Зөвшөөрөл</option>
          {CONSENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONSENT_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("branch") ?? ""} onChange={(e) => setParam({ branch: e.target.value || null })} className="w-40">
          <option value="">Бүх салбар</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-4 py-2.5 font-medium">Дугаар</th>
                  <th className="px-4 py-2.5 font-medium">Нэр</th>
                  <th className="px-4 py-2.5 font-medium">Утас / И-мэйл</th>
                  <th className="px-4 py-2.5 font-medium">Төрөл</th>
                  <th className="px-4 py-2.5 font-medium">Шошго</th>
                  <th className="px-4 py-2.5 font-medium">Төлөв</th>
                  <th className="px-4 py-2.5 font-medium">Сэжим</th>
                  <th className="px-4 py-2.5 font-medium">Бүртгэсэн</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-subtle">
                      Шүүлтэд тохирох харилцагч алга.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => {
                  const primary = r.phones.find((p) => p.is_primary) ?? r.phones[0];
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Сонгох"
                          checked={selected.includes(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="size-4 rounded border-line"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.number}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`${basePath}/contacts/${r.id}`} className="font-semibold text-ink hover:text-brand-700">
                          {r.display_name}
                        </Link>
                        <div className="text-xs text-subtle">{CONTACT_KIND_LABEL[r.kind]}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">
                        <div>{primary ? formatPhone(normalizePhone(primary.raw)) || primary.raw : "—"}</div>
                        {r.emails[0] ? <div className="text-subtle">{r.emails[0].email}</div> : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {r.contact_types.map((t) => CONTACT_TYPE_LABEL[t]).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.slice(0, 3).map((t) => (
                            <Badge key={t.lookup_id} tone="blue">
                              {t.label}
                            </Badge>
                          ))}
                          {r.tags.length > 3 ? <span className="text-xs text-subtle">+{r.tags.length - 3}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={CRM_LIFECYCLE_LABEL[r.lifecycle].tone}>{CRM_LIFECYCLE_LABEL[r.lifecycle].label}</Badge>
                          {r.kyc_public_status !== "pending" ? (
                            <Badge tone={KYC_STATUS_LABEL[r.kyc_public_status].tone}>
                              {KYC_STATUS_LABEL[r.kyc_public_status].label}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-muted">{r.lead_count}</td>
                      <td className="px-4 py-2.5 text-xs text-subtle">{fmtDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {canMerge && selected.length > 2 ? (
        <p className="text-xs text-amber-700">Нэгтгэхийн тулд яг 2 бүртгэл сонгоно (F-108).</p>
      ) : null}

      {/* Багц шошго (F-122) */}
      <Modal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        title={`Багц шошго (${selected.length} бүртгэл)`}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setTagOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitTags} disabled={pending}>
              {tagMode === "add" ? "Шошго нэмэх" : "Шошго хасах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
            {(["add", "remove"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTagMode(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tagMode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {m === "add" ? "Нэмэх" : "Хасах"}
              </button>
            ))}
          </div>
          <Field label="Шошго (олон сонголт)">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTagIds((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]))
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    tagIds.includes(t.id)
                      ? "bg-brand-600 text-white"
                      : "border border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {tags.length === 0 ? (
                <span className="text-xs text-subtle">Шошгоны лавлах хоосон — Тохиргоо → Лавлахаас нэмнэ.</span>
              ) : null}
            </div>
          </Field>
        </div>
      </Modal>

      <ContactFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        basePath={basePath}
        sources={sources}
        branches={branches}
      />
    </div>
  );
}

/** Шинэ харилцагч бүртгэх модал — F-107 давхардлын live анхааруулгатай. */
function ContactFormModal({
  open,
  onClose,
  basePath,
  sources,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  basePath: string;
  sources: LookupRow[];
  branches: BranchRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ContactKind>("person");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [types, setTypes] = useState<ContactType[]>(["buyer"]);
  const [sourceId, setSourceId] = useState("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [branchId, setBranchId] = useState("");
  const [consent, setConsent] = useState<ConsentStatus>("not_asked");
  const [consentChannel, setConsentChannel] = useState("");
  const [dupHits, setDupHits] = useState<DuplicateHit[]>([]);
  const [dupOverride, setDupOverride] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (dupTimer.current) clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(async () => {
      const name = kind === "person" ? firstName : orgName;
      if (phone.trim().length < 6 && email.trim().length < 5 && name.trim().length < 3) {
        setDupHits([]);
        return;
      }
      const res = await findDuplicatesAction({
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        name: name.trim() || undefined,
      });
      setDupHits(res.hits);
    }, 400);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [phone, email, firstName, orgName, kind, open]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createContact({
        kind,
        lastName: lastName.trim() || null,
        firstName: firstName.trim() || null,
        orgName: orgName.trim() || null,
        contactTypes: types,
        sourceId,
        sourceDetail: sourceDetail.trim() || null,
        branchId: branchId || null,
        phones: phone.trim() ? [phone.trim()] : [],
        emails: email.trim() ? [email.trim()] : [],
        consent,
        consentChannel: consentChannel.trim() || null,
        duplicateOverride: dupOverride,
      });
      if (res.error) {
        setError(res.error);
        if (res.duplicates?.length) setDupHits(res.duplicates);
        return;
      }
      onClose();
      if (res.id) router.push(`${basePath}/contacts/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Шинэ харилцагч бүртгэх"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Хадгалж байна…" : "Бүртгэх"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Хэлбэр">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContactKind)}>
              {CONTACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTACT_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "person" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Овог">
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Нэр">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Байгууллагын нэр">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Утас" hint="Утас эсвэл и-мэйлийн дор хаяж нэг нь заавал">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="И-мэйл">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </Field>
        </div>

        <Field label="Харилцагчийн төрөл">
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  types.includes(t) ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {CONTACT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        {dupHits.length > 0 ? (
          <div className="space-y-2">
            <DuplicateHint hits={dupHits} basePath={basePath} />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={dupOverride}
                onChange={(e) => setDupOverride(e.target.checked)}
                className="size-4 rounded border-line"
              />
              Давхардлын анхааруулгыг үл хэрэгсэж үргэлжлүүлнэ (аудит логт бүртгэгдэнэ)
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Эх сурвалж (заавал)">
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Эх сурвалжийн дэлгэрэнгүй">
            <Input value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Салбар">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— Автомат —</option>
              {branches
                .filter((b) => b.is_active)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Зөвшөөрлийн төлөв (F-114)">
            <Select value={consent} onChange={(e) => setConsent(e.target.value as ConsentStatus)}>
              {CONSENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONSENT_STATUS_LABEL[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {consent !== "not_asked" ? (
          <Field label="Зөвшөөрлийн суваг">
            <Input value={consentChannel} onChange={(e) => setConsentChannel(e.target.value)} placeholder="утсаар / бичгээр" />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

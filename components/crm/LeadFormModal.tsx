"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DuplicateHint } from "@/components/crm/DuplicateHint";
import { createLead } from "@/lib/actions/crm-leads";
import { findDuplicatesAction } from "@/lib/actions/crm-contacts";
import type { DuplicateHit } from "@/lib/queries-crm-contacts";
import type { LookupRow, BranchRow } from "@/lib/queries-crm-core";
import {
  CONTACT_KINDS,
  CONTACT_KIND_LABEL,
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
  LEAD_GRADES,
  LEAD_GRADE_LABEL,
  type ContactKind,
  type ContactType,
  type ConsentStatus,
  type LeadGrade,
} from "@/lib/constants-crm";

/**
 * Сэжим үүсгэх маягт (P-01 алхам 1–3): шинэ харилцагч эсвэл байгаа бүртгэл
 * дээр; утас/и-мэйл/нэрээр бодит цагийн давхардлын анхааруулга (F-107,
 * DuplicateHint) — үл хэрэгсэж үргэлжлүүлбэл аудит логт бүртгэгдэнэ.
 */
export function LeadFormModal({
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

  // Харилцагч
  const [existingContact, setExistingContact] = useState<DuplicateHit | null>(null);
  const [kind, setKind] = useState<ContactKind>("person");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [types, setTypes] = useState<ContactType[]>(["buyer"]);
  const [consent, setConsent] = useState<ConsentStatus>("not_asked");
  const [consentChannel, setConsentChannel] = useState("");
  // Сэжим
  const [sourceId, setSourceId] = useState("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [branchId, setBranchId] = useState("");
  const [campaignCode, setCampaignCode] = useState("");
  const [grade, setGrade] = useState<"" | LeadGrade>("");
  const [gradeReason, setGradeReason] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  // Давхардал (F-107)
  const [dupHits, setDupHits] = useState<DuplicateHit[]>([]);
  const [dupOverride, setDupOverride] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSource = sources.find((s) => s.id === sourceId);
  const detailRequired = !!selectedSource?.requires_note;

  // Бодит цагийн давхардлын шалгалт — debounce.
  useEffect(() => {
    if (!open || existingContact) return;
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
  }, [phone, email, firstName, orgName, kind, open, existingContact]);

  function toggleType(t: ContactType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function reset() {
    setError(null);
    setExistingContact(null);
    setKind("person");
    setLastName("");
    setFirstName("");
    setOrgName("");
    setPhone("");
    setEmail("");
    setTypes(["buyer"]);
    setConsent("not_asked");
    setConsentChannel("");
    setSourceId("");
    setSourceDetail("");
    setBranchId("");
    setCampaignCode("");
    setGrade("");
    setGradeReason("");
    setNextStep("");
    setNextStepDate("");
    setDupHits([]);
    setDupOverride(false);
  }

  function submit() {
    setError(null);
    if (!existingContact && !sourceId) {
      setError("Эх сурвалж сонгоно уу — эх сурвалжгүй сэжим үүсгэхийг хориглоно (P-01).");
      return;
    }
    if (detailRequired && !sourceDetail.trim()) {
      setError("Энэ эх сурвалжид дэлгэрэнгүй тайлбар заавал (F-104).");
      return;
    }
    startTransition(async () => {
      const res = await createLead({
        contactId: existingContact?.contact_id ?? null,
        newContact: existingContact
          ? null
          : {
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
            },
        sourceId: sourceId || null,
        campaignCode: campaignCode.trim() || null,
        channelRef: null,
        branchId: branchId || null,
        grade: grade || null,
        gradeOverrideReason: gradeReason.trim() || null,
        nextStep: nextStep.trim() || null,
        nextStepDate: nextStepDate || null,
        duplicateOverride: dupOverride,
      });
      if (res.error) {
        setError(res.error);
        if (res.duplicates?.length) setDupHits(res.duplicates);
        return;
      }
      reset();
      onClose();
      if (res.id) router.push(`${basePath}/leads/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Шинэ сэжим бүртгэх"
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

        {existingContact ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
            <div className="text-sm">
              <span className="font-semibold text-ink">{existingContact.display_name}</span>{" "}
              <span className="font-mono text-xs text-muted">{existingContact.number}</span>
              <Badge tone="brand" className="ml-2">
                Байгаа харилцагч дээр
              </Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setExistingContact(null)}>
              Болих
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Харилцагчийн хэлбэр">
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
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Овог" />
                  </Field>
                  <Field label="Нэр">
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Нэр" />
                  </Field>
                </div>
              ) : (
                <Field label="Байгууллагын нэр">
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Албан ёсны нэр" />
                </Field>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Утас" hint="Утас эсвэл и-мэйлийн дор хаяж нэг нь заавал">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9911-2233" inputMode="tel" />
              </Field>
              <Field label="И-мэйл">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.mn" inputMode="email" />
              </Field>
            </div>

            <Field label="Харилцагчийн төрөл (олон сонголт)">
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      types.includes(t)
                        ? "bg-brand-600 text-white"
                        : "border border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {CONTACT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Зөвшөөрлийн төлөв (F-114)">
                <Select value={consent} onChange={(e) => setConsent(e.target.value as ConsentStatus)}>
                  {CONSENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONSENT_STATUS_LABEL[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              {consent !== "not_asked" ? (
                <Field label="Зөвшөөрлийн суваг">
                  <Input
                    value={consentChannel}
                    onChange={(e) => setConsentChannel(e.target.value)}
                    placeholder="утсаар / бичгээр / чатаар"
                  />
                </Field>
              ) : null}
            </div>
          </>
        )}

        {dupHits.length > 0 && !existingContact ? (
          <div className="space-y-2">
            <DuplicateHint hits={dupHits} basePath={basePath} />
            <div className="flex flex-wrap gap-1.5">
              {dupHits.map((h) => (
                <Button
                  key={h.contact_id}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExistingContact(h);
                    setDupHits([]);
                  }}
                >
                  «{h.display_name}» дээр сэжим нэмэх
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={dupOverride}
                onChange={(e) => setDupOverride(e.target.checked)}
                className="size-4 rounded border-line"
              />
              Давхардлын анхааруулгыг үл хэрэгсэж ШИНЭ бүртгэл үүсгэнэ (аудит логт бүртгэгдэнэ)
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Эх сурвалж" hint="Эх сурвалжгүй сэжим үүсгэхийг хориглоно">
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Эх сурвалжийн дэлгэрэнгүй"
            hint={detailRequired ? "Энэ эх сурвалжид заавал (аян, санал болгогч, листингийн дугаар)" : undefined}
          >
            <Input
              value={sourceDetail}
              onChange={(e) => setSourceDetail(e.target.value)}
              placeholder="Аян / санал болгогч / листингийн №"
            />
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
          <Field label="Аяны код">
            <Input value={campaignCode} onChange={(e) => setCampaignCode(e.target.value)} placeholder="FB-2026-09" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ангилал (систем санал болгоно)">
            <Select value={grade} onChange={(e) => setGrade(e.target.value as "" | LeadGrade)}>
              <option value="">— Системд үлдээх —</option>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          {grade ? (
            <Field label="Ангиллын шалтгаан" hint="Системийн саналаас зөрвөл заавал (F-113)">
              <Input value={gradeReason} onChange={(e) => setGradeReason(e.target.value)} placeholder="Шалтгаан" />
            </Field>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Дараагийн алхам">
            <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Эхний холболт" />
          </Field>
          <Field label="Алхмын огноо">
            <Input type="date" value={nextStepDate} onChange={(e) => setNextStepDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

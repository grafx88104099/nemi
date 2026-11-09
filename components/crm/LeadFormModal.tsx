"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ClaimCard } from "@/components/crm/ClaimCard";
import { QuickCapture } from "@/components/crm/QuickCapture";
import { ListingPicker } from "@/components/crm/ListingPicker";
import { createLead } from "@/lib/actions/crm-leads";
import { findDuplicatesMasked, type MaskedDuplicate } from "@/lib/actions/crm-ownership";
import { LISTING_UNAVAILABLE_ERR, type LeadListingOption } from "@/lib/crm/lead-listing";
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
import { DEFAULT_REGISTRAR_SOURCES, NEXT_STEP_CODES, NEXT_STEP_LABEL, ubToday, type NextStepCode } from "@/lib/crm/agent-core";

/**
 * Сэжим бүртгэх (§6.3, §6.4, §6.26): чатаас наах, оффисын хэмжээний масктай
 * давхардал (өөр агентынх бол маргааны зам), эх сурвалж («Бусад»-д тайлбар
 * заавал), реферал/хувийн сүлжээнд мэдээлэл авсан огноо, ангиллын систем
 * санал. Реферал, хувийн сүлжээ, идэвхтэй хайлт, листингийн лавлагаагаар
 * бүртгэвэл та өөрөө эзэмшигч болно.
 */

const SAME_DAY_SOURCES = ["referral", "personal_network"];

function localNowValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LeadFormModal({
  open,
  onClose,
  basePath,
  sources,
  branches,
  registrarSources,
}: {
  open: boolean;
  onClose: () => void;
  basePath: string;
  sources: LookupRow[];
  branches: BranchRow[];
  /** Бүртгэгч эзэмшигч болох эх сурвалжийн кодууд (тохиргоо). */
  registrarSources?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [listing, setListing] = useState<LeadListingOption | null>(null);
  const [noListing, setNoListing] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const listingSection = useRef<HTMLDivElement>(null);

  const [existing, setExisting] = useState<MaskedDuplicate | null>(null);
  const [kind, setKind] = useState<ContactKind>("person");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [types, setTypes] = useState<ContactType[]>([]);
  const [consent, setConsent] = useState<ConsentStatus>("not_asked");
  const [consentChannel, setConsentChannel] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [branchId, setBranchId] = useState("");
  const [campaignCode, setCampaignCode] = useState("");
  const [grade, setGrade] = useState<"" | LeadGrade>("");
  const [gradeReason, setGradeReason] = useState("");
  const [nextCode, setNextCode] = useState<NextStepCode | "">("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [hits, setHits] = useState<MaskedDuplicate[]>([]);
  const [dupOverride, setDupOverride] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSource = sources.find((s) => s.id === sourceId);
  const detailRequired = !!selectedSource?.requires_note;
  const sameDay = !!selectedSource && SAME_DAY_SOURCES.includes(selectedSource.code);
  const regList = registrarSources ?? (DEFAULT_REGISTRAR_SOURCES as readonly string[]);
  const iOwn = !!selectedSource && regList.includes(selectedSource.code);
  const blocking = hits.some(
    (h) => (h.match_kind === "phone" || h.match_kind === "email") && !!h.open_lead_id && h.has_owner && !h.owner_is_me
  );

  // Оффисын хэмжээний давхардлын шалгалт (масктай) — debounce.
  useEffect(() => {
    if (!open || existing) return;
    if (dupTimer.current) clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(async () => {
      const name = kind === "person" ? firstName : orgName;
      if (phone.trim().length < 6 && email.trim().length < 5 && name.trim().length < 3) {
        setHits([]);
        return;
      }
      const res = await findDuplicatesMasked({
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        name: name.trim().length >= 3 ? name.trim() : undefined,
      });
      setHits(res.hits ?? []);
    }, 400);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [phone, email, firstName, orgName, kind, open, existing]);

  function toggleType(t: ContactType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function showListingError(message: string) {
    setListingError(message);
    // Товч footer-т байдаг тул маягт доош гүйлгэгдсэн үед алдаа харагдахгүй үлдэж болно.
    listingSection.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function reset() {
    setError(null);
    setListing(null);
    setNoListing(false);
    setListingError(null);
    setExisting(null);
    setKind("person");
    setLastName("");
    setFirstName("");
    setOrgName("");
    setPhone("");
    setEmail("");
    setTypes([]);
    setConsent("not_asked");
    setConsentChannel("");
    setSourceId("");
    setSourceDetail("");
    setReceivedAt("");
    setBranchId("");
    setCampaignCode("");
    setGrade("");
    setGradeReason("");
    setNextCode("");
    setNextStepDate("");
    setHits([]);
    setDupOverride(false);
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    setError(null);
    setListingError(null);
    if (!listing && !noListing) {
      showListingError("Зар сонгоно уу, эсвэл «Тодорхой зар байхгүй»-г тэмдэглэнэ үү.");
      return;
    }
    if (!sourceId) {
      setError("Эх сурвалж сонгоно уу — эх сурвалжгүй сэжим бүртгэхгүй.");
      return;
    }
    if (detailRequired && !sourceDetail.trim()) {
      setError("Энэ эх сурвалжид тайлбар заавал.");
      return;
    }
    if (!existing && types.length === 0) {
      setError("Харилцагчийн төрлийг сонгоно уу.");
      return;
    }
    if (nextCode && !nextStepDate) {
      setError("Дараагийн үйлдлийн огноог сонгоно уу.");
      return;
    }
    startTransition(async () => {
      const res = await createLead({
        contactId: existing?.contact_id ?? null,
        listingId: listing?.id ?? null,
        newContact: existing
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
        sourceId,
        sourceDetail: sourceDetail.trim() || null,
        campaignCode: campaignCode.trim() || null,
        channelRef: null,
        branchId: branchId || null,
        grade: grade || null,
        gradeOverrideReason: gradeReason.trim() || null,
        nextStep: nextCode ? NEXT_STEP_LABEL[nextCode] : null,
        nextStepDate: nextCode ? nextStepDate || null : null,
        receivedAt: sameDay && receivedAt ? new Date(receivedAt).toISOString() : null,
        duplicateOverride: dupOverride,
      });
      if (res.error === LISTING_UNAVAILABLE_ERR) {
        setListing(null);
        showListingError(res.error);
        return;
      }
      if (res.error) {
        setError(res.error);
        if (res.maskedDuplicates?.length) setHits(res.maskedDuplicates);
        return;
      }
      toast.success("Сэжим бүртгэгдлээ", {
        description: res.ownedByRegistrar
          ? "Та эзэмшигч боллоо — эхний холболтын хугацаа эхэлсэн."
          : res.queued
            ? "Ажлын цагаар хуваарилагдана."
            : "Хуваарилалтын дүрмээр эзэмшигч оноогдлоо.",
      });
      const id = res.id;
      close();
      if (id) router.push(`${basePath}/leads/${id}`);
      else router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Шинэ сэжим бүртгэх"
      footer={
        <div className="flex w-full items-center justify-end gap-2 border-t border-line p-4">
          <Button variant="ghost" onClick={close} disabled={pending}>
            Болих
          </Button>
          <Button onClick={submit} disabled={pending || (blocking && !existing)}>
            {pending ? "Хадгалж байна…" : "Бүртгэх"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div ref={listingSection} className="space-y-2">
          {noListing ? null : (
            <Field label="Зар (заавал)" hint="Сэжим nemi.mn-ийн аль зартай холбоотойг сонгоно.">
              <ListingPicker
                value={listing}
                onChange={(next) => {
                  setListing(next);
                  setListingError(null);
                }}
                disabled={pending}
              />
            </Field>
          )}
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={noListing}
              disabled={pending}
              onChange={(e) => {
                setNoListing(e.target.checked);
                setListing(null);
                setListingError(null);
              }}
              className="mt-0.5 size-4 shrink-0 rounded border-line"
            />
            <span>
              <span className="font-medium">Тодорхой зар байхгүй</span>
              <span className="block text-xs text-muted">Зараа зарах эзэмшигч, эсвэл тодорхой зар сонгоогүй худалдан авагч</span>
            </span>
          </label>
          {listingError ? (
            <p className="text-xs text-danger" role="alert">
              {listingError}
            </p>
          ) : null}
        </div>

        {existing ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
            <div className="text-sm">
              <span className="font-semibold text-ink">{existing.display_name}</span>
              <Badge tone="brand" className="ml-2">
                Байгаа харилцагч дээр
              </Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setExisting(null)}>
              Болих
            </Button>
          </div>
        ) : (
          <>
            <QuickCapture
              onParsed={(p) => {
                if (p.phone) setPhone(p.phone.replace(/^976/, ""));
                if (p.email) setEmail(p.email);
                if (p.firstName) setFirstName(p.firstName);
                if (p.lastName) setLastName(p.lastName);
                if (p.channelHint) {
                  const digital = sources.find((s) => s.code === "digital");
                  if (digital && !sourceId) setSourceId(digital.id);
                  if (!sourceDetail) setSourceDetail(p.channelHint);
                }
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    aria-pressed={types.includes(t)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      types.includes(t) ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {CONTACT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Зөвшөөрлийн төлөв">
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
                  <Input value={consentChannel} onChange={(e) => setConsentChannel(e.target.value)} placeholder="утсаар / бичгээр / чатаар" />
                </Field>
              ) : null}
            </div>
          </>
        )}

        {hits.length > 0 && !existing ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-800">Ижил төстэй бүртгэл олдлоо ({hits.length})</p>
            {hits.map((h) => (
              <div key={`${h.contact_id}-${h.match_kind}`} className="space-y-1.5">
                <ClaimCard hit={h} basePath={basePath} />
                {h.can_view && !(h.open_lead_id && h.has_owner && !h.owner_is_me) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExisting(h);
                      setHits([]);
                    }}
                  >
                    <UserCheck className="size-4" /> Энэ харилцагч дээр сэжим нээх
                  </Button>
                ) : null}
              </div>
            ))}
            {blocking ? (
              <p className="text-xs text-rose-700">
                Утас/и-мэйл нь өөр агентын нээлттэй сэжимтэй таарч байна — шинэ бүртгэл үүсгэхгүй. Харилцагч тантай
                өөрөө холбогдсон бол дээрх картаас эзэмшлийн маргаан нээнэ үү.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={dupOverride}
                  onChange={(e) => setDupOverride(e.target.checked)}
                  className="size-4 rounded border-line"
                />
                Өөр хүн гэдгийг шалгасан — шинэ бүртгэл үүсгэнэ (аудитад бүртгэгдэнэ)
              </label>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Field
            label={detailRequired ? "Эх сурвалжийн тайлбар (заавал)" : "Эх сурвалжийн дэлгэрэнгүй"}
            hint="Аян, санал болгогч, листингийн дугаар, суваг"
          >
            <Input value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="Жишээ: Facebook аян, Бат-ын санал болголт" />
          </Field>
        </div>
        {selectedSource ? (
          <p className="text-xs text-muted">
            {iOwn
              ? "Энэ эх сурвалжаар бүртгэсэн тул та өөрөө эзэмшигч болно."
              : "Эзэмшигч хуваарилалтын дүрмээр оноогдоно; ажлын бус цагт ажлын цаг эхлэхэд хуваарилагдана."}
          </p>
        ) : null}
        {sameDay ? (
          <Field label="Мэдээлэл авсан огноо, цаг" hint="Тухайн өдөрт нь бүртгэх ёстой — өнгөрсөн бол бодит огноог оруулна">
            <Input type="datetime-local" value={receivedAt} max={localNowValue()} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Салбар">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— Миний салбар —</option>
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
            <Input value={campaignCode} onChange={(e) => setCampaignCode(e.target.value)} placeholder="Жишээ: FB-2026-11" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ангилал" hint="Хоосон бол систем оноогоор санал болгож бичнэ">
            <Select value={grade} onChange={(e) => setGrade(e.target.value as "" | LeadGrade)}>
              <option value="">Системийн санал</option>
              {LEAD_GRADES.map((g) => (
                <option key={g} value={g}>
                  {LEAD_GRADE_LABEL[g].label}
                </option>
              ))}
            </Select>
          </Field>
          {grade ? (
            <Field label="Ангиллын шалтгаан" hint="Системийн саналаас зөрвөл заавал">
              <Input value={gradeReason} onChange={(e) => setGradeReason(e.target.value)} placeholder="Шалтгаан" />
            </Field>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Дараагийн үйлдэл">
            <Select value={nextCode} onChange={(e) => setNextCode(e.target.value as NextStepCode | "")}>
              <option value="">Эхний холболт</option>
              {NEXT_STEP_CODES.map((c) => (
                <option key={c} value={c}>
                  {NEXT_STEP_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          {nextCode ? (
            <Field label="Огноо">
              <Input type="date" min={ubToday()} value={nextStepDate} onChange={(e) => setNextStepDate(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

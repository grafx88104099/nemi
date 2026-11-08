"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Flame, Search, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import {
  createOpportunity,
  searchOpportunitySources,
  searchOpportunityProperties,
  listContactNeedProfiles,
} from "@/lib/actions/crm-opportunities";
import type { DealSourceOption, PropertyOption, NeedProfileOption } from "@/lib/queries-crm-pipeline";
import { CRM_PROPERTY_STATUS_LABEL, PL_LABEL, type PlCode } from "@/lib/constants-crm";
import { fmtMNT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * «Боломж үүсгэх» (§6.13, §6.14): сэжим эсвэл харилцагчаас, урсгал,
 * хэрэгцээний профайл, үл хөдлөх, дүн, хүлээгдэж буй хөлс, хаагдах огноо,
 * дараагийн үйлдэл + огноо (эхний шатны шилжих шалгуур). Канбан болон
 * сэжим, харилцагчийн картаас нээгдэнэ (prefill).
 */

const PROFILE_TYPE_LABEL: Record<string, string> = {
  buyer: "Худалдан авагч",
  tenant: "Түрээслэгч",
  investor: "Хөрөнгө оруулагч",
  intl_buyer: "Гадаад худалдан авагч",
};

export type OpportunityCreatePrefill = {
  leadId?: string | null;
  contactId: string;
  label: string;
};

function todayIso(): string {
  return toIsoDate(new Date());
}

export function OpportunityCreateModal({
  open,
  onClose,
  pipelines,
  defaultPipelineCode,
  prefill,
  dealPath,
}: {
  open: boolean;
  onClose: () => void;
  pipelines: { code: string; name: string }[];
  defaultPipelineCode?: string;
  prefill?: OpportunityCreatePrefill | null;
  /** Үүссэний дараа нээх картын угтвар (/agent/crm/pipeline эсвэл /office/crm/deals). */
  dealPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const selectable = pipelines.filter((p) => p.code !== "PL-6");
  const [pipelineCode, setPipelineCode] = useState(
    defaultPipelineCode && selectable.some((p) => p.code === defaultPipelineCode)
      ? defaultPipelineCode
      : (selectable[0]?.code ?? "PL-1")
  );
  const [source, setSource] = useState<DealSourceOption | null>(
    prefill
      ? {
          kind: prefill.leadId ? "lead" : "contact",
          id: prefill.leadId ?? prefill.contactId,
          contact_id: prefill.contactId,
          label: prefill.label,
          sub: null,
        }
      : null
  );
  const [sourceQ, setSourceQ] = useState("");
  const [sourceResults, setSourceResults] = useState<DealSourceOption[]>([]);
  const [profiles, setProfiles] = useState<NeedProfileOption[] | null>(null);
  const [needProfileId, setNeedProfileId] = useState("");
  const [property, setProperty] = useState<PropertyOption | null>(null);
  const [propertyQ, setPropertyQ] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertyOption[]>([]);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [closeOn, setCloseOn] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [gateMissing, setGateMissing] = useState<string[] | null>(null);
  const sourceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propertyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profilesLoadedFor = useRef<string | null>(null);

  const isListing = pipelineCode === "PL-2";

  function loadProfiles(contactId: string) {
    if (profilesLoadedFor.current === contactId) return;
    profilesLoadedFor.current = contactId;
    startSearch(async () => {
      const list = await listContactNeedProfiles(contactId);
      setProfiles(list);
      const active = list.find((p) => p.status === "active");
      setNeedProfileId(active?.id ?? "");
    });
  }

  // Урьдчилан бөглөсөн харилцагчийн профайлуудыг модал нээгдэхэд ачаална.
  const prefillContactId = prefill?.contactId ?? null;
  useEffect(() => {
    if (!open || !prefillContactId || profilesLoadedFor.current === prefillContactId) return;
    profilesLoadedFor.current = prefillContactId;
    startSearch(async () => {
      const list = await listContactNeedProfiles(prefillContactId);
      setProfiles(list);
      setNeedProfileId(list.find((p) => p.status === "active")?.id ?? "");
    });
  }, [open, prefillContactId]);

  function onSourceQuery(q: string) {
    setSourceQ(q);
    if (sourceTimer.current) clearTimeout(sourceTimer.current);
    sourceTimer.current = setTimeout(() => {
      startSearch(async () => setSourceResults(await searchOpportunitySources(q)));
    }, 250);
  }

  function onPropertyQuery(q: string) {
    setPropertyQ(q);
    if (propertyTimer.current) clearTimeout(propertyTimer.current);
    propertyTimer.current = setTimeout(() => {
      startSearch(async () => setPropertyResults(await searchOpportunityProperties(q)));
    }, 250);
  }

  function pickSource(s: DealSourceOption) {
    setSource(s);
    setSourceResults([]);
    setSourceQ("");
    setProfiles(null);
    loadProfiles(s.contact_id);
  }

  function pickProperty(p: PropertyOption) {
    setProperty(p);
    setPropertyResults([]);
    setPropertyQ("");
    if (!amount) {
      const price = p.service_kind === "sale" ? p.price : p.rent_price;
      if (price) setAmount(String(price));
    }
  }

  function reset() {
    setSource(
      prefill
        ? {
            kind: prefill.leadId ? "lead" : "contact",
            id: prefill.leadId ?? prefill.contactId,
            contact_id: prefill.contactId,
            label: prefill.label,
            sub: null,
          }
        : null
    );
    setProperty(null);
    setAmount("");
    setFee("");
    setCloseOn("");
    setNextStep("");
    setNextStepDate(todayIso());
    setError(null);
    profilesLoadedFor.current = null;
  }

  function submit() {
    setError(null);
    if (!source) {
      setError("Сэжим эсвэл харилцагч сонгоно уу.");
      return;
    }
    if (nextStep.trim().length < 2 || !nextStepDate) {
      setError("Дараагийн үйлдэл, огноог заавал бичнэ үү.");
      return;
    }
    const amt = amount.trim() ? Number(amount) : null;
    const feeAmt = fee.trim() ? Number(fee) : null;
    if ((amt != null && (Number.isNaN(amt) || amt < 0)) || (feeAmt != null && (Number.isNaN(feeAmt) || feeAmt < 0))) {
      setError("Дүн буруу байна.");
      return;
    }
    startTransition(async () => {
      const res = await createOpportunity({
        pipelineCode: pipelineCode as PlCode,
        leadId: source.kind === "lead" ? source.id : null,
        contactId: source.contact_id,
        needProfileId: !isListing && needProfileId ? needProfileId : null,
        propertyId: property?.id ?? null,
        amount: amt,
        expectedFeeMnt: feeAmt,
        expectedCloseOn: closeOn || null,
        nextStep: nextStep.trim(),
        nextStepDate,
      });
      if (res.missing?.length) {
        setGateMissing(res.missing);
        return;
      }
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Боломж үүслээ");
      reset();
      onClose();
      router.push(`${dealPath}/${res.id}`);
    });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Боломж үүсгэх"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Болих
            </Button>
            <Button disabled={pending || !source} onClick={submit}>
              {pending ? "Үүсгэж байна…" : "Үүсгэх"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Урсгал" htmlFor="opp-new-pl">
            <Select id="opp-new-pl" value={pipelineCode} onChange={(e) => setPipelineCode(e.target.value)}>
              {selectable.map((p) => (
                <option key={p.code} value={p.code}>
                  {PL_LABEL[p.code as PlCode] ?? p.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* Сэжим / харилцагч */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">
              {isListing ? "Өмчлөгч (сэжим эсвэл харилцагч)" : "Харилцагч (сэжим эсвэл харилцагч)"}
            </p>
            {source ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                  {source.kind === "lead" ? (
                    <Flame className="size-4 shrink-0 text-brand-600" />
                  ) : (
                    <User className="size-4 shrink-0 text-brand-600" />
                  )}
                  <span className="truncate font-medium">{source.label}</span>
                  {source.sub ? <span className="text-xs text-muted">{source.sub}</span> : null}
                </span>
                {!prefill ? (
                  <button
                    type="button"
                    onClick={() => setSource(null)}
                    className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
                    aria-label="Сонголтыг арилгах"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <Input
                    value={sourceQ}
                    onChange={(e) => onSourceQuery(e.target.value)}
                    onFocus={() => {
                      if (!sourceResults.length) onSourceQuery(sourceQ);
                    }}
                    placeholder="Нэр эсвэл дугаараар хайх…"
                    className="pl-9"
                    aria-label="Сэжим, харилцагч хайх"
                  />
                </div>
                {sourceResults.length > 0 ? (
                  <ul className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface">
                    {sourceResults.map((s) => (
                      <li key={`${s.kind}-${s.id}`}>
                        <button
                          type="button"
                          onClick={() => pickSource(s)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                        >
                          {s.kind === "lead" ? (
                            <Flame className="size-4 shrink-0 text-amber-600" />
                          ) : (
                            <User className="size-4 shrink-0 text-subtle" />
                          )}
                          <span className="truncate text-ink">{s.label}</span>
                          {s.sub ? <span className="ml-auto shrink-0 text-xs text-muted">{s.sub}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : sourceQ.trim() && !searching ? (
                  <p className="mt-1 text-xs text-muted">Олдсонгүй. Эхлээд сэжим эсвэл харилцагчаа бүртгэнэ үү.</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Хэрэгцээний профайл (худалдан авагч тал) */}
          {source && !isListing ? (
            <Field
              label="Хэрэгцээний профайл"
              htmlFor="opp-new-profile"
              hint={
                profiles && profiles.length === 0
                  ? "Профайл алга — харилцагчийн карт дээр бөглөөгүй бол «Шалгуур хангасан» шатанд шилжихгүй."
                  : undefined
              }
            >
              <Select id="opp-new-profile" value={needProfileId} onChange={(e) => setNeedProfileId(e.target.value)}>
                <option value="">— Сонгоогүй —</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {PROFILE_TYPE_LABEL[p.profile_type] ?? "Профайл"}
                    {p.budget_max ? ` · ${fmtMNT(p.budget_max)} хүртэл` : ""}
                    {p.completeness_pct != null ? ` · бүрэн ${Math.round(p.completeness_pct)}%` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {/* Үл хөдлөх */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">
              Үл хөдлөх <span className="font-normal text-muted">(сонгох боломжтой бол)</span>
            </p>
            {property ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Building2 className="size-4 shrink-0 text-subtle" />
                  <span className="truncate font-medium text-ink">{property.name}</span>
                  <span className="font-mono text-xs text-subtle">{property.number}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setProperty(null)}
                  className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
                  aria-label="Үл хөдлөхийг арилгах"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <Input
                    value={propertyQ}
                    onChange={(e) => onPropertyQuery(e.target.value)}
                    placeholder="Листингийн дугаар эсвэл нэрээр…"
                    className="pl-9"
                    aria-label="Үл хөдлөх хайх"
                  />
                </div>
                {propertyResults.length > 0 ? (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface">
                    {propertyResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => pickProperty(p)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                        >
                          <span className="font-mono text-xs text-subtle">{p.number}</span>
                          <span className="truncate text-ink">{p.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted">
                            {CRM_PROPERTY_STATUS_LABEL[p.status as keyof typeof CRM_PROPERTY_STATUS_LABEL]?.label ?? ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Хэлцлийн дүн (₮)" htmlFor="opp-new-amount">
              <Input
                id="opp-new-amount"
                type="number"
                inputMode="numeric"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Хүлээгдэж буй цэвэр хөлс (₮)" htmlFor="opp-new-fee" hint="Компанид орох зуучлалын хөлс">
              <Input
                id="opp-new-fee"
                type="number"
                inputMode="numeric"
                min="0"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Хаагдах төлөвлөсөн огноо" htmlFor="opp-new-close">
            <Input id="opp-new-close" type="date" value={closeOn} onChange={(e) => setCloseOn(e.target.value)} />
          </Field>

          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="mb-2 text-sm font-semibold text-ink">Дараагийн үйлдэл (заавал)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
              <Input
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder={isListing ? "Жишээ: өмчлөгчтэй уулзалт товлох" : "Жишээ: хэрэгцээг тодруулах дуудлага"}
                aria-label="Дараагийн үйлдэл"
              />
              <Input
                type="date"
                min={todayIso()}
                value={nextStepDate}
                onChange={(e) => setNextStepDate(e.target.value)}
                aria-label="Дараагийн үйлдлийн огноо"
              />
            </div>
          </div>

          {error ? <p className={cn("text-sm text-danger")}>{error}</p> : null}
        </div>
      </Modal>

      <GateErrorDialog
        open={gateMissing !== null}
        missing={gateMissing ?? []}
        stageName={isListing ? "Өмчлөгчийн сэжим" : "Шинэ"}
        onClose={() => setGateMissing(null)}
      />
    </>
  );
}

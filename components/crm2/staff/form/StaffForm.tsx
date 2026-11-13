"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, FileSignature, Images, KeyRound, MapPinned, Ruler, ScrollText, Send, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createBrokerageDraft, submitBrokerage } from "@/lib/crm2/actions/brokerage";
import { addPropertyVideoLink } from "@/lib/crm2/actions/media";
import { createProperty, updateProperty, updatePropertyPrivate } from "@/lib/crm2/actions/properties";
import { ubToday } from "@/lib/crm2/datetime";
import { validateDocFile } from "@/lib/crm2/files";
import {
  categoryLabel,
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOL,
  PRICE_BASES,
  PRICE_BASIS_LABEL,
  PRICE_PERIOD_LABEL,
  PROPERTY_AGENT_ROLE_LABEL,
  PROPERTY_AGENT_ROLES,
  PROPERTY_CATEGORIES,
  type PropertyAgentRole,
} from "@/lib/crm2/labels";
import { formatPrice } from "@/lib/crm2/money";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { PropertyDetail, PropertyPrivate } from "@/lib/crm2/queries/properties";
import {
  brokerageCreateSchema,
  type PropertyCreateInput,
  type PropertyPrivateInput,
  type PropertyUpdateInput,
} from "@/lib/crm2/schemas";
import { fileLimits, settingOptions, type Crm2Settings } from "@/lib/crm2/settings";
import { uploadBrokerageFile, uploadMany, uploadPropertyMedia } from "@/lib/crm2/storage";
import type { Crm2Currency, Crm2PriceBasis, Crm2PricePeriod, Crm2StaffMember } from "@/lib/crm2/types";

import { AgentSelect } from "./AgentSelect";
import { brokerageResponsibleAllowed, type BrokerageResponsibleCtx } from "@/components/crm2/deals/types";

import { BrokerageFields, DocList } from "./BrokerageFields";
import { ChoiceChips, FieldNote, FormAlert, FormField, FormSection, Textarea, ToggleChips } from "./fields";
import {
  brokerageHasInput,
  brokeragePayload,
  brokerageSubmitMissing,
  diffPayload,
  emptyBrokerageForm,
  emptyPrivateForm,
  emptyPropertyForm,
  fieldErrors,
  missingSentence,
  newLocalId,
  omitKey,
  parseNumberInput,
  previewTotal,
  pricePeriodMismatch,
  pricePeriodOptions,
  privatePayload,
  projectChange,
  projectForCreate,
  propertyInputErrors,
  propertyPayload,
  propertyToForm,
  sameAgentConflict,
  withCategory,
  type BrokerageFormState,
  type FieldNoteKey,
  type OwnerRef,
  type PrivateFormState,
  type PropertyFormState,
} from "./form-model";
import { OwnerPicker } from "./OwnerPicker";
import { EMPTY_MEDIA_QUEUE, MediaQueue, queueCoverId, type MediaQueueValue } from "./MediaQueue";
import { PinField } from "./PinField";
import { SuggestInput } from "./SuggestInput";
import { loadLocationSuggestions, loadProjectSuggestions } from "./suggest-loaders";

/** Схемийн шалгалтад (property_id үүсээгүй үед) түр id. */
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

type EditProperty = PropertyDetail["property"];

type CommonProps = {
  panel: Crm2Panel;
  officeId: string;
  me: string;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  /** Томилогдсон үүрэгт агентыг солих (менежер/ахлагч) — идэвхжсэн хөрөнгөд. */
  canReassign: boolean;
  /** Гэрээний хариуцагч сонгогчийн хүрээ (менежер/ахлагч/өөрөө + 3 үүргийн агент). */
  responsibleCtx: BrokerageResponsibleCtx;
};

type Props =
  | (CommonProps & { mode: "create" })
  | (CommonProps & {
      mode: "edit";
      property: EditProperty;
      private: PropertyPrivate | null;
      /** Эзэн, үзүүлэх заавар засах (хувийн талбар харах + хөрөнгө засах эрх). */
      canEditPrivate: boolean;
    });

function ownerFromPrivate(p: PropertyPrivate | null): OwnerRef | null {
  if (!p?.owner_contact_id) return null;
  if (!p.owner) return { id: p.owner_contact_id, name: "Харилцагч" };
  return { id: p.owner.id, name: p.owner.full_name, code: p.owner.code, phone: p.owner.phones[0]?.phone ?? null };
}

function privateToForm(p: PropertyPrivate | null): PrivateFormState {
  if (!p) return emptyPrivateForm();
  return { owner: ownerFromPrivate(p), owner_note: p.owner_note ?? "", showing_instructions: p.showing_instructions ?? "" };
}

const fid = (key: string) => `sf-${key.replace(/^private\./, "").replace(/\./g, "-")}`;

/**
 * S02 — Staff хөрөнгө нэмэх ба засах маягт. Шинэ хөрөнгө үргэлж НООРОГ болж
 * үүснэ; медиа, зуучлалын гэрээ хөрөнгө үүссэний дараа дарааллаар хадгалагдана.
 * Засах горимд зөвхөн өөрчлөгдсөн талбарыг илгээнэ; медиа, гэрээ тусдаа хэсэгт.
 */
export function StaffForm(props: Props) {
  const { panel, officeId, me, settings, staff, canReassign, responsibleCtx } = props;
  const router = useRouter();
  const paths = crm2Paths(panel);
  const isEdit = props.mode === "edit";
  const editProperty = isEdit ? props.property : null;
  const editPrivate = isEdit ? props.private : null;
  const canEditPrivate = isEdit ? props.canEditPrivate : true;

  const [form, setForm] = React.useState<PropertyFormState>(() =>
    editProperty ? propertyToForm(editProperty) : emptyPropertyForm(me)
  );
  const [priv, setPriv] = React.useState<PrivateFormState>(() => privateToForm(editPrivate));
  const [baseline, setBaseline] = React.useState(() => ({ form, priv }));

  // Хадгалсны дараа серверээс шинэ мөр ирэхэд маягтыг түүгээр сэргээнэ.
  const [syncedAt, setSyncedAt] = React.useState(editProperty?.updated_at ?? null);
  const [privSyncedAt, setPrivSyncedAt] = React.useState(editPrivate?.updated_at ?? null);
  if (editProperty && editProperty.updated_at !== syncedAt) {
    const next = propertyToForm(editProperty);
    setSyncedAt(editProperty.updated_at);
    setForm(next);
    setBaseline((b) => ({ ...b, form: next }));
  }
  if (isEdit && (editPrivate?.updated_at ?? null) !== privSyncedAt) {
    const next = privateToForm(editPrivate);
    setPrivSyncedAt(editPrivate?.updated_at ?? null);
    setPriv(next);
    setBaseline((b) => ({ ...b, priv: next }));
  }

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);

  // Зөвхөн шинэ хөрөнгөд: медиа ба гэрээ хөрөнгө үүссэний дараа хадгалагдана.
  const [media, setMedia] = React.useState<MediaQueueValue>(EMPTY_MEDIA_QUEUE);
  const [brokerage, setBrokerage] = React.useState<BrokerageFormState>(emptyBrokerageForm);
  const [bOwner, setBOwner] = React.useState<OwnerRef | null>(null);
  const [bOwnerTouched, setBOwnerTouched] = React.useState(false);
  const [docs, setDocs] = React.useState<{ id: string; file: File }[]>([]);
  const [docErrors, setDocErrors] = React.useState<string[]>([]);
  const [bErrors, setBErrors] = React.useState<Record<string, string>>({});

  const limits = fileLimits(settings);
  const required = new Set(settings["property.activation_required"]);
  const catLabels = settings["property.category_labels"];
  const typeOptions = settingOptions(settings["property.types"]);
  const featureOptions = settingOptions(settings["property.features"]);
  const districts = settings["property.districts"];
  const districtOptions = form.district && !districts.includes(form.district) ? [...districts, form.district] : districts;
  const brokerageOwner = bOwnerTouched ? bOwner : priv.owner;
  const hasContractInput = brokerageHasInput(brokerage, docs.length);
  const busy = saving;

  const set = <K extends keyof PropertyFormState>(key: K, value: PropertyFormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
    if (errors[key as string]) setErrors((e) => omitKey(e, key as string));
  };
  const setNote = (key: FieldNoteKey, value: string) =>
    setForm((s) => ({ ...s, field_notes: { ...s.field_notes, [key]: value } }));
  const note = (key: FieldNoteKey, label: string) => (
    <FieldNote value={form.field_notes[key] ?? ""} onChange={(v) => setNote(key, v)} label={label} />
  );
  const err = (key: string) => errors[key] ?? null;

  function showErrors(errs: Record<string, string>, general?: string) {
    setErrors(errs);
    const first = Object.keys(errs)[0];
    setServerError(general ?? (first ? `Алдаатай талбарыг засна уу: ${errs[first]}` : null));
    if (first) window.requestAnimationFrame(() => document.getElementById(fid(first))?.focus());
  }

  /** Бүх талбарыг шалгана (засах горимд ч бүтэн төлвөөр — DB-ийн нөхцөлтэй ижил). */
  function validate(): PropertyCreateInput | null {
    const payload = propertyPayload(form);
    const input = {
      ...payload,
      ...projectForCreate(form),
      ...(canEditPrivate ? { private: privatePayload(priv) } : {}),
    } as PropertyCreateInput;
    const errs = propertyInputErrors(input);
    const conflict = sameAgentConflict(payload, settings["property.same_agent_multi_role"]);
    if (conflict && !errs[conflict]) errs[conflict] = "Нэг агент хэд хэдэн үүрэг давхар авахгүй (оффисын тохиргоо).";
    if (Object.keys(errs).length) {
      showErrors(errs);
      return null;
    }
    setErrors({});
    return input;
  }

  // ── Шинэ хөрөнгө ─────────────────────────────────────────────────────────
  async function onCreate(submit: boolean) {
    setServerError(null);
    setBErrors({});
    const input = validate();
    if (!input) return;

    const wantContract = submit || hasContractInput;
    const bInput = brokeragePayload(brokerage, brokerageOwner?.id ?? null);
    if (wantContract) {
      const parsed = brokerageCreateSchema.safeParse({ property_id: PLACEHOLDER_ID, ...bInput });
      if (!parsed.success) {
        const be = fieldErrors(parsed.error);
        setBErrors(be);
        setServerError("Зуучлалын гэрээний алдаатай талбаруудыг засна уу.");
        return;
      }
      if (submit) {
        const missing = brokerageSubmitMissing(brokerage, {
          ownerId: brokerageOwner?.id ?? null,
          fileCount: docs.length,
          requireOwner: settings["brokerage.require_owner"],
          requireFile: settings["brokerage.require_file"],
          today: ubToday(),
        });
        if (missing.length) {
          setServerError(`Батлуулахаар илгээхэд дутуу: ${missingSentence(missing)}. Эсвэл «Ноорог хадгалах»-аар хадгалаад дараа нь илгээнэ үү.`);
          return;
        }
      }
    }

    setSaving(true);
    const warnings: string[] = [];
    let submitted = false;
    try {
      setStep("Хөрөнгийг бүртгэж байна…");
      const created = await createProperty(input);
      if (!created.ok) {
        setServerError(created.error);
        return;
      }
      const { id, code, warning } = created.data;
      if (warning) warnings.push(warning);

      // Медиа: зураг (дарааллаар), дараа нь бичлэг; нүүр зураг — сонгосон эсвэл эхнийх.
      const files = [...media.files.filter((f) => f.kind === "image"), ...media.files.filter((f) => f.kind === "video")];
      if (files.length) {
        const cover = queueCoverId(media);
        setStep(`Медиа хуулж байна (0/${files.length})…`);
        const res = await uploadMany(
          files.map((f) => f.file),
          (file, i) =>
            uploadPropertyMedia({ file, officeId, propertyId: id, limits, sortOrder: i, isCover: files[i].id === cover }),
          (done, total) => setStep(`Медиа хуулж байна (${done}/${total})…`)
        );
        warnings.push(...res.errors);
      }
      for (const l of media.links) {
        const res = await addPropertyVideoLink({ property_id: id, external_url: l.url });
        if (!res.ok) warnings.push(`Бичлэгийн холбоос: ${res.error}`);
      }

      if (wantContract) {
        setStep("Зуучлалын гэрээг бүртгэж байна…");
        const b = await createBrokerageDraft({ property_id: id, ...bInput });
        if (!b.ok) {
          warnings.push(`Зуучлалын гэрээ бүртгэгдсэнгүй: ${b.error}`);
        } else {
          let uploaded = 0;
          if (docs.length) {
            setStep(`Гэрээний файл хуулж байна (0/${docs.length})…`);
            const res = await uploadMany(
              docs.map((d) => d.file),
              (file) => uploadBrokerageFile({ file, officeId, contractId: b.data.id, limits }),
              (done, total) => setStep(`Гэрээний файл хуулж байна (${done}/${total})…`)
            );
            uploaded = res.ok.length;
            warnings.push(...res.errors);
          }
          if (submit) {
            if (settings["brokerage.require_file"] && uploaded === 0) {
              warnings.push("Гэрээний файл хуулагдаагүй тул батлуулахаар илгээсэнгүй — файлаа нэмээд илгээнэ үү.");
            } else {
              setStep("Батлуулахаар илгээж байна…");
              const s = await submitBrokerage(b.data.id);
              if (!s.ok) warnings.push(`Гэрээг батлуулахаар илгээж чадсангүй: ${s.error}`);
              else submitted = true;
            }
          }
        }
      }

      toast.success(`${code} ноорог бүртгэгдлээ`, {
        description: submitted ? "Зуучлалын гэрээ батлуулахаар илгээгдлээ." : undefined,
      });
      if (warnings.length) {
        toast.error("Зарим зүйл хадгалагдсангүй", { description: warnings.join(" "), durationMs: 0 });
      }
      router.replace(`${paths.propertyEdit(id)}?created=1`);
    } catch (e) {
      console.error("StaffForm create:", e);
      setServerError("Хадгалахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  // ── Засах ────────────────────────────────────────────────────────────────
  async function onSave() {
    if (!editProperty) return;
    setServerError(null);
    if (!validate()) return;

    const diff = diffPayload(propertyPayload(baseline.form), propertyPayload(form));
    const patch = { ...diff, ...projectChange(baseline.form, form) } as PropertyUpdateInput;
    const privDiff = canEditPrivate ? diffPayload(privatePayload(baseline.priv), privatePayload(priv)) : {};
    if (Object.keys(patch).length === 0 && Object.keys(privDiff).length === 0) {
      toast.info("Өөрчлөлт алга");
      return;
    }

    setSaving(true);
    try {
      if (Object.keys(patch).length) {
        setStep("Хадгалж байна…");
        const res = await updateProperty(editProperty.id, patch);
        if (!res.ok) {
          setServerError(res.error);
          return;
        }
        setBaseline((b) => ({ ...b, form }));
      }
      if (Object.keys(privDiff).length) {
        setStep("Эзний мэдээллийг хадгалж байна…");
        const res = await updatePropertyPrivate(editProperty.id, privDiff as PropertyPrivateInput);
        if (!res.ok) {
          setServerError(`Хөрөнгийн мэдээлэл хадгалагдсан ч эзний хэсэг хадгалагдсангүй: ${res.error}`);
          router.refresh();
          return;
        }
        setBaseline((b) => ({ ...b, priv }));
      }
      toast.success("Хадгалагдлаа");
      router.refresh();
    } catch (e) {
      console.error("StaffForm save:", e);
      setServerError("Хадгалахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  // ── Харагдац ─────────────────────────────────────────────────────────────
  const periodOptions = pricePeriodOptions(form.category, form.price_period);
  const mismatch = pricePeriodMismatch(form.category, form.price_period);
  const priceNum = parseNumberInput(form.price);
  const pricePreview =
    typeof priceNum === "number"
      ? formatPrice({ amount: priceNum, currency: form.currency, period: form.price_period, basis: form.price_basis })
      : "";
  const totalPreview = form.price_basis === "per_m2" ? previewTotal(form) : null;
  const lockedRole = (role: PropertyAgentRole) =>
    !!editProperty && editProperty.status !== "draft" && !canReassign && !!editProperty[role];
  const agentName = (role: PropertyAgentRole) => {
    const ref = role === "listing_agent_id" ? editProperty?.listing_agent : role === "contract_agent_id" ? editProperty?.contract_agent : editProperty?.photo_agent;
    return ref?.full_name ?? null;
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-4" aria-busy={busy}>
      <p className="text-xs text-muted">
        <span className="font-semibold text-brand-600">*</span> — хөрөнгийг идэвхжүүлэхэд заавал бөглөх талбар (оффисын тохиргоо).
      </p>

      {/* 1. Ангилал */}
      <FormSection id="staff-kind" title="Ангилал ба төрөл" icon={Building2}>
        <FormField label="Ангилал" error={err("category")}>
          <div id={fid("category")} tabIndex={-1} className="outline-none">
            <ChoiceChips
              label="Ангилал"
              value={form.category}
              invalid={!!err("category")}
              disabled={busy}
              options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, catLabels) }))}
              onChange={(c) => {
                setForm((s) => withCategory(s, c));
                setErrors((e) => omitKey(e, "category"));
              }}
            />
          </div>
        </FormField>
        <FormField label="Хөрөнгийн төрөл" htmlFor={fid("property_type")} required={required.has("property_type")} error={err("property_type")}>
          <Select
            id={fid("property_type")}
            value={form.property_type}
            disabled={busy}
            onChange={(e) => set("property_type", e.target.value)}
          >
            <option value="">— Сонгоогүй —</option>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {form.property_type && !settings["property.types"][form.property_type] ? (
              <option value={form.property_type}>{form.property_type}</option>
            ) : null}
          </Select>
        </FormField>
      </FormSection>

      {/* 2. Төсөл ба байршил */}
      <FormSection id="staff-place" title="Төсөл ба байршил" icon={MapPinned}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Төслийн нэр"
            htmlFor={fid("project_name")}
            required={required.has("project")}
            error={err("project_name")}
            hint={
              form.project_name.trim() && !form.project_id
                ? "Жагсаалтад байхгүй бол хадгалахад шинэ төсөл болж бүртгэгдэнэ."
                : "Өмнө бүртгэсэн төслүүдээс санал болгоно."
            }
          >
            <SuggestInput
              id={fid("project_name")}
              value={form.project_name}
              maxLength={120}
              disabled={busy}
              placeholder="Төсөл, хотхоны нэр"
              load={loadProjectSuggestions}
              emptyText={null}
              onValueChange={(v) => setForm((s) => ({ ...s, project_name: v, project_id: null }))}
              onPick={(it) => setForm((s) => ({ ...s, project_name: it.label, project_id: it.key }))}
            />
            {note("project", "төсөл")}
          </FormField>
          <FormField label="Дүүрэг" htmlFor={fid("district")} required={required.has("district")} error={err("district")}>
            <Select id={fid("district")} value={form.district} disabled={busy} onChange={(e) => set("district", e.target.value)}>
              <option value="">— Сонгоогүй —</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Байршил"
            htmlFor={fid("location_text")}
            required={required.has("location_text")}
            error={err("location_text")}
            hint="Хороолол, гудамж, ойролцоох газар."
            className="sm:col-span-2"
          >
            <SuggestInput
              id={fid("location_text")}
              value={form.location_text}
              maxLength={200}
              disabled={busy}
              invalid={!!err("location_text")}
              placeholder="жишээ: 19-р хороолол, Зайсан"
              load={loadLocationSuggestions}
              emptyText={null}
              onValueChange={(v) => set("location_text", v)}
              onPick={(it) => set("location_text", it.label)}
            />
            {note("location_text", "байршил")}
          </FormField>
          <FormField
            label="Байршлын дэлгэрэнгүй"
            htmlFor={fid("address_detail")}
            required={required.has("address_detail")}
            error={err("address_detail")}
            className="sm:col-span-2"
          >
            <Textarea
              id={fid("address_detail")}
              rows={2}
              maxLength={1000}
              value={form.address_detail}
              disabled={busy}
              placeholder="Байр, орц, давхар, тоот, хаалганы код гэх мэт"
              onChange={(e) => set("address_detail", e.target.value)}
            />
          </FormField>
        </div>
        <div id={fid("lat")} tabIndex={-1} className="outline-none">
          <PinField
            idPrefix="sf"
            lat={form.lat}
            lng={form.lng}
            address={form.pin_address}
            disabled={busy}
            required={required.has("pin")}
            onPin={(lat, lng) => setForm((s) => ({ ...s, lat, lng }))}
            onAddress={(v) => set("pin_address", v)}
          />
          {err("lat") ? <p className="mt-1 text-xs text-danger">{err("lat")}</p> : null}
          {err("pin_address") ? <p className="mt-1 text-xs text-danger">{err("pin_address")}</p> : null}
        </div>
      </FormSection>

      {/* 3. Хэмжээс ба үнэ */}
      <FormSection id="staff-size" title="Хэмжээс ба үнэ" icon={Ruler}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Хэмжээ (м²)" htmlFor={fid("area_m2")} required={required.has("area_m2")} error={err("area_m2")}>
            <Input
              id={fid("area_m2")}
              inputMode="decimal"
              value={form.area_m2}
              disabled={busy}
              aria-invalid={!!err("area_m2") || undefined}
              onChange={(e) => set("area_m2", e.target.value)}
            />
            {note("area_m2", "хэмжээ")}
          </FormField>
          <FormField label="Өрөөний тоо" htmlFor={fid("rooms")} required={required.has("rooms")} error={err("rooms")}>
            <Input
              id={fid("rooms")}
              inputMode="numeric"
              value={form.rooms}
              disabled={busy}
              aria-invalid={!!err("rooms") || undefined}
              onChange={(e) => set("rooms", e.target.value)}
            />
            {note("rooms", "өрөө")}
          </FormField>
          <FormField label="Давхар" htmlFor={fid("floor")} required={required.has("floor")} error={err("floor")} hint="Подвал бол хасах тоо.">
            <Input
              id={fid("floor")}
              inputMode="numeric"
              value={form.floor}
              disabled={busy}
              aria-invalid={!!err("floor") || undefined}
              onChange={(e) => set("floor", e.target.value)}
            />
            {note("floor", "давхар")}
          </FormField>
          <FormField label="Барилгын давхар" htmlFor={fid("building_floors")} error={err("building_floors")}>
            <Input
              id={fid("building_floors")}
              inputMode="numeric"
              value={form.building_floors}
              disabled={busy}
              aria-invalid={!!err("building_floors") || undefined}
              onChange={(e) => set("building_floors", e.target.value)}
            />
          </FormField>
        </div>

        <div className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Үнэ" htmlFor={fid("price")} required={required.has("price")} error={err("price")} hint={pricePreview || undefined}>
              <div className="flex gap-2">
                <Input
                  id={fid("price")}
                  inputMode="decimal"
                  value={form.price}
                  disabled={busy}
                  aria-invalid={!!err("price") || undefined}
                  onChange={(e) => set("price", e.target.value)}
                />
                <Select
                  aria-label="Үнийн валют"
                  value={form.currency}
                  disabled={busy}
                  className="w-28 shrink-0"
                  onChange={(e) => set("currency", e.target.value as Crm2Currency)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_SYMBOL[c]}
                    </option>
                  ))}
                </Select>
              </div>
            </FormField>
            <FormField
              label="Үнийн хугацаа"
              htmlFor={fid("price_period")}
              error={err("price_period")}
              hint={
                mismatch ? (
                  <span className="text-amber-700">Энэ ангилалд таарахгүй — идэвхжүүлэхэд саад болно.</span>
                ) : (
                  "Зарах = нийт үнэ; түрээс = сар эсвэл өдрийн үнэ."
                )
              }
            >
              <Select
                id={fid("price_period")}
                value={form.price_period}
                disabled={busy}
                onChange={(e) => set("price_period", e.target.value as Crm2PricePeriod)}
              >
                {periodOptions.map((p) => (
                  <option key={p} value={p}>
                    {PRICE_PERIOD_LABEL[p]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Үнийн суурь" error={err("price_basis")}>
            <ChoiceChips
              label="Үнийн суурь"
              value={form.price_basis}
              disabled={busy}
              options={PRICE_BASES.map((b) => ({ value: b, label: PRICE_BASIS_LABEL[b] }))}
              onChange={(b: Crm2PriceBasis) => set("price_basis", b)}
            />
          </FormField>
          {form.price_basis === "per_m2" ? (
            <p className="text-sm text-muted">
              Нийт дүн:{" "}
              <span className="font-semibold tabular-nums text-ink">
                {totalPreview !== null
                  ? formatPrice({ amount: totalPreview, currency: form.currency, period: form.price_period })
                  : "хэмжээг оруулахад тооцоологдоно"}
              </span>
            </p>
          ) : null}
          {note("price", "үнэ")}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Ашиглалтад орсон он" htmlFor={fid("year_in_use")} required={required.has("year_in_use")} error={err("year_in_use")}>
            <Input
              id={fid("year_in_use")}
              inputMode="numeric"
              maxLength={4}
              value={form.year_in_use}
              disabled={busy}
              placeholder="жишээ: 2018"
              aria-invalid={!!err("year_in_use") || undefined}
              onChange={(e) => set("year_in_use", e.target.value)}
            />
            {note("year_in_use", "он")}
          </FormField>
          <FormField label="Ашиглалтын зардал" htmlFor={fid("operating_cost")} error={err("operating_cost")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
              <Input
                className="col-span-2 sm:col-span-1"
                id={fid("operating_cost")}
                inputMode="decimal"
                value={form.operating_cost}
                disabled={busy}
                aria-invalid={!!err("operating_cost") || undefined}
                onChange={(e) => set("operating_cost", e.target.value)}
              />
              <Select
                aria-label="Зардлын валют"
                value={form.operating_cost_currency}
                disabled={busy}
                onChange={(e) => set("operating_cost_currency", e.target.value as Crm2Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABEL[c]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Зардлын хугацаа"
                value={form.operating_cost_period}
                disabled={busy}
                onChange={(e) => set("operating_cost_period", e.target.value as Crm2PricePeriod)}
              >
                {(["month", "day", "total"] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRICE_PERIOD_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            {note("operating_cost", "зардал")}
          </FormField>
          <FormField label="Зардлын тайлбар" htmlFor={fid("operating_cost_note")} error={err("operating_cost_note")} className="sm:col-span-2">
            <Input
              id={fid("operating_cost_note")}
              maxLength={1000}
              value={form.operating_cost_note}
              disabled={busy}
              placeholder="СӨХ, дулаан, цахилгаан орсон эсэх г.м."
              onChange={(e) => set("operating_cost_note", e.target.value)}
            />
          </FormField>
        </div>
      </FormSection>

      {/* 4. Тайлбар */}
      <FormSection id="staff-describe" title="Хөрөнгийн тайлбар" icon={ScrollText}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Нөхцөл" htmlFor={fid("condition")} error={err("condition")}>
            <Textarea
              id={fid("condition")}
              maxLength={4000}
              value={form.condition}
              disabled={busy}
              placeholder="Засвар, тавилга, техникийн байдал"
              onChange={(e) => set("condition", e.target.value)}
            />
          </FormField>
          <FormField label="Харууц" htmlFor={fid("view_note")} error={err("view_note")}>
            <Textarea
              id={fid("view_note")}
              maxLength={4000}
              value={form.view_note}
              disabled={busy}
              placeholder="Цонхны харагдах байдал, нар тусах тал"
              onChange={(e) => set("view_note", e.target.value)}
            />
          </FormField>
          <FormField label="Давуу тал" htmlFor={fid("advantages")} error={err("advantages")}>
            <Textarea
              id={fid("advantages")}
              maxLength={4000}
              value={form.advantages}
              disabled={busy}
              onChange={(e) => set("advantages", e.target.value)}
            />
          </FormField>
          <FormField label="Нэмэлт тайлбар" htmlFor={fid("notes")} error={err("notes")}>
            <Textarea id={fid("notes")} maxLength={8000} value={form.notes} disabled={busy} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
        </div>
        {featureOptions.length ? (
          <FormField label="Онцлог" error={err("features")}>
            <ToggleChips label="Онцлог" values={form.features} options={featureOptions} disabled={busy} onChange={(v) => set("features", v)} />
          </FormField>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Хэзээнээс боломжтой" htmlFor={fid("available_from")} error={err("available_from")}>
            <Input
              id={fid("available_from")}
              type="date"
              value={form.available_from}
              disabled={busy}
              onChange={(e) => set("available_from", e.target.value)}
            />
            {note("available_from", "боломжтой огноо")}
          </FormField>
          <FormField label="Боломжийн тайлбар" htmlFor={fid("availability_note")} error={err("availability_note")}>
            <Input
              id={fid("availability_note")}
              maxLength={1000}
              value={form.availability_note}
              disabled={busy}
              placeholder="жишээ: одоогийн түрээслэгч 12-р сард гарна"
              onChange={(e) => set("availability_note", e.target.value)}
            />
          </FormField>
        </div>
      </FormSection>

      {/* 5. Агентын 3 үүрэг */}
      <FormSection
        id="staff-agents"
        title="Агентын үүрэг"
        icon={UsersRound}
        description="Листлэгч, гэрээ хийсэн, зураг авсан агент — хэлцлийн хариуцагчаас тусдаа."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PROPERTY_AGENT_ROLES.map((role) => {
            const locked = lockedRole(role);
            return (
              <FormField
                key={role}
                label={PROPERTY_AGENT_ROLE_LABEL[role]}
                htmlFor={fid(role)}
                required={required.has(role)}
                error={err(role)}
                hint={locked ? "Томилогдсон агентыг багийн ахлагч эсвэл менежер солино." : undefined}
              >
                <AgentSelect
                  id={fid(role)}
                  value={form[role]}
                  staff={staff}
                  me={me}
                  disabled={busy || locked}
                  currentName={agentName(role)}
                  invalid={!!err(role)}
                  onChange={(v) => set(role, v)}
                />
              </FormField>
            );
          })}
        </div>
      </FormSection>

      {/* 6. Хувийн хэсэг */}
      {canEditPrivate ? (
        <FormSection
          id="staff-private"
          title="Эзэн ба үзүүлэх заавар"
          icon={KeyRound}
          locked
          description="Зөвхөн хөрөнгийн үүрэгт агент, гэрээний хариуцагч, ахлагч, менежерт харагдана."
        >
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink">
              Эзэн
              {required.has("owner") ? (
                <span className="ml-0.5 text-brand-600" title="Идэвхжүүлэхэд заавал">
                  *
                </span>
              ) : null}
            </span>
            <OwnerPicker idPrefix="sf-private" value={priv.owner} onChange={(o) => setPriv((s) => ({ ...s, owner: o }))} disabled={busy} />
            {err("private.owner_contact_id") ? <p className="text-xs text-danger">{err("private.owner_contact_id")}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Эзний тэмдэглэл" htmlFor={fid("owner_note")} error={err("private.owner_note")}>
              <Textarea
                id={fid("owner_note")}
                maxLength={4000}
                value={priv.owner_note}
                disabled={busy}
                placeholder="Холбогдох цаг, нөхцөл, хүсэлт"
                onChange={(e) => setPriv((s) => ({ ...s, owner_note: e.target.value }))}
              />
            </FormField>
            <FormField
              label="Үзүүлэх заавар"
              htmlFor={fid("showing_instructions")}
              required={required.has("showing_instructions")}
              error={err("private.showing_instructions")}
            >
              <Textarea
                id={fid("showing_instructions")}
                maxLength={4000}
                value={priv.showing_instructions}
                disabled={busy}
                placeholder="Түлхүүр хаана, хэнтэй холбогдох, орох журам"
                onChange={(e) => setPriv((s) => ({ ...s, showing_instructions: e.target.value }))}
              />
            </FormField>
          </div>
        </FormSection>
      ) : (
        <FormAlert tone="info">Эзэн ба үзүүлэх зааврыг зөвхөн эрх бүхий ажилтан засна.</FormAlert>
      )}

      {/* 7–8. Шинэ хөрөнгөд: медиа ба зуучлалын гэрээ */}
      {!isEdit ? (
        <>
          <FormSection
            id="staff-media-new"
            title="Зураг, бичлэг"
            icon={Images}
            description={`Хөрөнгийг хадгалахад дарааллаар нь хуулагдана.${required.has("images") ? " Идэвхжүүлэхэд дор хаяж нэг зураг заавал." : ""}`}
          >
            <MediaQueue value={media} onChange={setMedia} limits={limits} disabled={busy} />
          </FormSection>

          <FormSection
            id="staff-brokerage-new"
            title="Зуучлалын гэрээ"
            icon={FileSignature}
            locked
            description="Эзэнтэй байгуулсан зуучлалын гэрээ батлагдмагц хөрөнгө Staff-д идэвхтэй болно."
          >
            <BrokerageFields
              idPrefix="sfb"
              value={brokerage}
              onChange={(v) => {
                setBrokerage(v);
                setBErrors({});
              }}
              owner={brokerageOwner}
              onOwnerChange={(o) => {
                setBOwnerTouched(true);
                setBOwner(o);
              }}
              ownerNote={
                !bOwnerTouched
                  ? priv.owner
                    ? "Хөрөнгийн эзэнтэй ижил."
                    : "Дээрх «Эзэн» хэсэгт сонгосон эзэн энд орно."
                  : undefined
              }
              requireOwner={settings["brokerage.require_owner"]}
              staff={staff}
              responsibleStaff={staff.filter((s) =>
                brokerageResponsibleAllowed(responsibleCtx, [form.listing_agent_id, form.contract_agent_id, form.photo_agent_id])({
                  id: s.profile_id,
                  teamId: s.team_id,
                })
              )}
              me={me}
              errors={bErrors}
              disabled={busy}
            />
            <DocList
              items={docs.map((d) => ({ id: d.id, name: d.file.name, size: d.file.size }))}
              disabled={busy}
              canAdd={docs.length < limits.maxDocsPerContract}
              onAdd={(files) => {
                const problems: string[] = [];
                const next = [...docs];
                for (const file of files) {
                  const e = validateDocFile(file, limits, next.length);
                  if (e) problems.push(e);
                  else next.push({ id: newLocalId(), file });
                }
                setDocErrors(problems);
                setDocs(next);
              }}
              onRemove={(item) => setDocs((list) => list.filter((d) => d.id !== item.id))}
              hint={`PDF, JPEG, PNG, WebP, ≤${limits.maxDocMb} МБ. ${
                settings["brokerage.require_file"] ? "Батлуулахад дор хаяж нэг файл заавал." : ""
              }`}
            />
            {docErrors.length ? (
              <FormAlert tone="warn">
                <ul className="list-inside list-disc space-y-0.5">
                  {docErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </FormAlert>
            ) : null}
          </FormSection>
        </>
      ) : null}

      {/* Хадгалах */}
      <div className="sticky bottom-0 z-20 -mx-4 space-y-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn("text-xs text-muted", step && "font-medium text-brand-700")} aria-live="polite">
            {step ?? (isEdit ? "Медиа, гэрээг доорх хэсгүүдэд тус тусад нь хадгална." : "Хадгалахад хөрөнгө НООРОГ болж бүртгэгдэнэ.")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isEdit ? (
              <Button type="button" onClick={() => void onSave()} disabled={busy}>
                {busy ? "Хадгалж байна…" : "Хадгалах"}
              </Button>
            ) : (
              <>
                <Button type="button" variant={hasContractInput ? "outline" : "primary"} onClick={() => void onCreate(false)} disabled={busy}>
                  {busy ? "Хадгалж байна…" : "Ноорог хадгалах"}
                </Button>
                <Button
                  type="button"
                  variant={hasContractInput ? "primary" : "outline"}
                  onClick={() => void onCreate(true)}
                  disabled={busy || !hasContractInput}
                  title={hasContractInput ? undefined : "Эхлээд зуучлалын гэрээний мэдээллийг бөглөнө үү"}
                >
                  <Send className="size-4" aria-hidden />
                  Хадгалаад гэрээг батлуулахаар илгээх
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

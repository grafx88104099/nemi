"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { trackUi } from "@/components/crm2/staff/form/useCreateDraft";
import {
  fieldErrors,
  parseRecent,
  propertyPayload,
  propertyToForm,
  pushRecent,
  recentDistrictsKey,
  sameAgentConflict,
  validationInput,
  type PropertyFormState,
} from "@/components/crm2/staff/form/form-model";
import { markPropertyVerified, updateProperty } from "@/lib/crm2/actions/properties";
import { issuesByField, validateFields } from "@/lib/crm2/field-validation";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { dbErrorField } from "@/lib/crm2/result";
import { propertyUpdateSchema } from "@/lib/crm2/schemas";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2StaffMember } from "@/lib/crm2/types";
import { fmtDate } from "@/lib/format";

import { DetailsFields, LocationFields, PriceFields, RolesFields, SizeFields, type SheetFormApi } from "./property-fields";
import {
  SHEET_FORM_KEYS,
  SHEET_TITLE,
  isEmptyPatch,
  mergeSheetDraft,
  roleLocked,
  sheetFieldKey,
  sheetPatch,
  splitPrivate,
  withEdited,
  type PropertyFormSheet,
  type SheetDraftPart,
} from "./sheet-model";
import { OFFLINE_SAVE_TEXT, SheetShell, focusSheetField } from "./SheetShell";
import { useSheetDraft } from "./use-sheet-draft";

type Property = PropertyDetail["property"];

/** localStorage-оос хэрэглэгчийн сүүлийн дүүргүүд (клиент дээр л). */
function readRecent(me: string | null, districts: readonly string[]): string[] {
  if (!me || typeof window === "undefined") return [];
  try {
    return parseRecent(window.localStorage.getItem(recentDistrictsKey(me)), districts);
  } catch {
    return [];
  }
}

function rememberDistrict(me: string | null, districts: readonly string[], district: string) {
  if (!me || !district) return;
  try {
    const next = pushRecent(parseRecent(window.localStorage.getItem(recentDistrictsKey(me)), districts), district);
    window.localStorage.setItem(recentDistrictsKey(me), JSON.stringify(next));
  } catch {
    /* localStorage алга */
  }
}

function pickPart(form: PropertyFormState, keys: readonly (keyof PropertyFormState)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = form[k];
  return out;
}

/**
 * Хөрөнгийн талбарын цонх (байршил, хэмжээ, үнэ, үүрэг, ангилал/тайлбар): зөвхөн өөрчлөгдсөн
 * талбарыг (diff) updateProperty-аар илгээнэ; DB алдааг талбарт нь (dbErrorField) харуулж фокуслана.
 * Бичсэн бүхэн утсан дээр (IDB) автоматаар хадгалагдаж, байршлын дэлгэрэнгүй vault-аар битүүмжлэгдэнэ.
 */
export function PropertyFieldSheet({
  sheet,
  property,
  settings,
  me,
  staff,
  teamIds,
  canReassign,
  focusField,
  onClose,
  onOpenSheet,
}: {
  sheet: PropertyFormSheet;
  property: Property;
  settings: Crm2Settings;
  me: string | null;
  staff: Crm2StaffMember[];
  teamIds: string[];
  canReassign: boolean;
  focusField: string | null;
  onClose: () => void;
  onOpenSheet: (sheet: "contract") => void;
}) {
  const router = useRouter();
  const keys = SHEET_FORM_KEYS[sheet];
  const [base] = React.useState(() => propertyToForm(property));
  const [form, setForm] = React.useState<PropertyFormState>(base);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [verifiedAt, setVerifiedAt] = React.useState<string | null>(property.last_verified_at);
  const [recent] = React.useState(() => readRecent(me, settings["property.districts"]));

  // Утсан дээрх ноорог: ил хэсэг + битүүмжлэх (address_detail).
  const values = splitPrivate(pickPart(form, keys));
  const baseVals = splitPrivate(pickPart(base, keys));
  const hasPriv = Object.keys(values.priv).length > 0;
  const draftPart: SheetDraftPart = { base: baseVals.pub, values: values.pub };
  const draftPriv: SheetDraftPart | null = hasPriv ? { base: baseVals.priv, values: values.priv } : null;

  const draft = useSheetDraft<SheetDraftPart>({
    profileId: me,
    propertyId: property.id,
    sheet,
    part: draftPart,
    priv: draftPriv,
    onLoaded: ({ part, priv, savedAt }) => {
      const merged: SheetDraftPart | null =
        part || priv
          ? { base: { ...(part?.base ?? {}), ...(priv?.base ?? {}) }, values: { ...(part?.values ?? {}), ...(priv?.values ?? {}) } }
          : null;
      if (!merged) return;
      const res = mergeSheetDraft(base, merged, keys);
      if (res.restored.length) {
        setForm(res.form);
        setRestoredAt(savedAt);
      }
    },
  });

  const patch = sheetPatch(sheet, base, form);
  const dirty = !isEmptyPatch(patch);

  const issues = validateFields(validationInput(form));
  const blurErrors = issuesByField(issues, "error");
  const blurWarnings = issuesByField(issues, "warning");
  const shown = (key: string) => touched.has(key) || touched.has(sheetFieldKey(key));

  const api: SheetFormApi = {
    form,
    set: (key, value) => {
      setForm((s) => withEdited({ ...s, [key]: value }, [key]));
      setErrors((e) => {
        if (!(key in e)) return e;
        const next = { ...e };
        delete next[key];
        return next;
      });
    },
    update: (fn, edited) => {
      setForm((s) => withEdited(fn(s), edited));
      setErrors((e) => {
        const next = { ...e };
        for (const k of edited) delete next[k];
        return next;
      });
    },
    err: (key) => errors[key] ?? (shown(key) ? blurErrors[key] : undefined),
    warn: (key) => blurWarnings[key],
    auto: (...ks) => ks.some((k) => form.unconfirmed.includes(k === "project_name" || k === "project_id" ? "project" : k === "lng" ? "lat" : k)),
    confirm: (...ks) => setForm((s) => withEdited(s, ks)),
    disabled: saving || !draft.ready,
    settings,
  };

  function onBlurCapture(e: React.FocusEvent<HTMLDivElement>) {
    const id = (e.target as HTMLElement).id;
    if (!id?.startsWith("cs-")) return;
    const key = id.slice(3);
    if (!touched.has(key)) setTouched((t) => new Set(t).add(key));
  }

  function showError(text: string, field: string | null) {
    setError(text);
    if (!field) return;
    const key = sheetFieldKey(field);
    setErrors((e) => ({ ...e, [key]: text }));
    focusSheetField(key);
  }

  async function dropRestored() {
    setForm(base);
    setRestoredAt(null);
    await draft.discard();
  }

  async function save() {
    setError(null);
    if (!dirty) {
      await draft.discard();
      onClose();
      return;
    }
    const parsed = propertyUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      setError(first ? `Алдаатай талбарыг засна уу: ${errs[first]}` : "Оролт буруу байна.");
      if (first) focusSheetField(first);
      return;
    }
    if (sheet === "roles") {
      const conflict = sameAgentConflict(propertyPayload(form), settings["property.same_agent_multi_role"]);
      if (conflict) {
        showError("Нэг агент хэд хэдэн үүрэг давхар авахгүй (оффисын тохиргоо).", conflict === "contract_agent_id" ? "listing_agent_id" : conflict);
        return;
      }
    }
    // DB-ийн хязгаартай ижил алдаа (давхар > барилгын давхар, м²-ийн үнэ талбайгүй) — хадгалахгүй.
    const firstBlur = (["floor", "area_m2"] as const).find((k) => blurErrors[k] && keys.some((x) => x === k || x === "price"));
    if (firstBlur) {
      showError(blurErrors[firstBlur]!, firstBlur);
      return;
    }

    setSaving(true);
    try {
      const res = await updateProperty(property.id, patch);
      if (!res.ok) {
        showError(res.error, res.field ?? dbErrorField({ message: res.error }).field);
        return;
      }
      await draft.discard();
      if (sheet === "location") rememberDistrict(me, settings["property.districts"], form.district);
      trackUi({ event: "sheet_saved", flow: "card", property_id: property.id, meta: { fields: Object.keys(patch).length } });
      toast.success("Хадгалагдлаа");
      router.refresh();
      onClose();
    } catch {
      // Сүлжээгүй — ноорог утсан дээр үлдсэн.
      await draft.flush();
      setError(OFFLINE_SAVE_TEXT);
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setVerifying(true);
    try {
      const res = await markPropertyVerified(property.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setVerifiedAt(res.data.verifiedAt);
      toast.success("Эзэнтэй тулгасныг тэмдэглэлээ");
      router.refresh();
    } catch {
      toast.error("Сүлжээ алга — дараа дахин оролдоно уу.");
    } finally {
      setVerifying(false);
    }
  }

  const contractName = property.contract_agent?.full_name ?? null;

  return (
    <SheetShell
      title={SHEET_TITLE[sheet]}
      onClose={onClose}
      onSave={() => void save()}
      saving={saving}
      ready={draft.ready}
      dirty={dirty}
      error={error}
      savedAt={draft.savedAt}
      draftError={draft.error}
      restoredAt={restoredAt}
      onDropRestored={() => void dropRestored()}
      focusField={focusField}
    >
      <div onBlurCapture={onBlurCapture} className="min-w-0 space-y-4">
        {form.unconfirmed.some((k) => keys.includes((k === "project" ? "project_name" : k) as keyof PropertyFormState)) ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Шараар тэмдэглэсэн утгыг автоматаар бөглөсөн — шалгаад «Зөв» дарж эсвэл засаад хадгална уу.
          </p>
        ) : null}

        {sheet === "location" ? <LocationFields api={api} recentDistricts={recent} /> : null}
        {sheet === "size" ? <SizeFields api={api} /> : null}
        {sheet === "price" ? (
          <>
            <PriceFields api={api} />
            <div id="cs-last_verified_at" className="space-y-2 rounded-xl border border-line p-3">
              <p className="text-sm font-medium text-ink">Эзэнтэй мэдээлэл тулгасан</p>
              <p className="text-xs text-muted">
                {verifiedAt ? `Сүүлд: ${fmtDate(verifiedAt)}` : "Одоогоор тулгаагүй."} Үнэ, боломжтой эсэхийг эзэнтэй шалгасны дараа дарна.
              </p>
              <Button type="button" variant="secondary" size="md" className="w-full sm:w-auto" disabled={verifying || saving} onClick={() => void verify()}>
                {verifying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BadgeCheck className="size-4" aria-hidden />}
                Эзэнтэй тулгасан
              </Button>
            </div>
          </>
        ) : null}
        {sheet === "roles" ? (
          <>
            <RolesFields
              api={api}
              staff={staff}
              meId={me}
              teamIds={teamIds}
              locked={(role) => roleLocked(property.status, property[role], canReassign)}
              names={{ listing_agent_id: property.listing_agent?.full_name ?? null, photo_agent_id: property.photo_agent?.full_name ?? null }}
            />
            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="text-sm font-medium text-ink">Гэрээ байгуулсан агент</p>
              <p className="text-sm text-muted">{contractName ?? "Сонгоогүй"} — зуучлалын гэрээний цонхонд баталгаажуулна.</p>
              <Button type="button" variant="outline" size="md" className="w-full sm:w-auto" onClick={() => onOpenSheet("contract")}>
                Гэрээний цонх нээх
              </Button>
            </div>
          </>
        ) : null}
        {sheet === "details" ? <DetailsFields api={api} /> : null}
      </div>
    </SheetShell>
  );
}

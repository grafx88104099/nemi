"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import type { OwnerDraft } from "@/components/crm2/staff/owner/owner-model";
import { logUiEvent } from "@/lib/crm2/actions/events";
import {
  canViewRestrictedBrokerage,
  createBrokerageDraft,
  submitBrokerage,
  updateBrokerageDraft,
} from "@/lib/crm2/actions/brokerage";
import { updateProperty } from "@/lib/crm2/actions/properties";
import {
  draftKey,
  hardDeleteDraft,
  loadDraft,
  sheetScope,
  shouldAutoRestore,
  useDraftAutosave,
  type LoadedDraft,
} from "@/lib/crm2/device/draft-store";
import { enqueue, startQueue } from "@/lib/crm2/device/upload-queue";
import { validateDocFile } from "@/lib/crm2/files";
import type { Crm2BrokerageFileKindKey } from "@/lib/crm2/labels";
import { panelFromPathname, type Crm2Panel } from "@/lib/crm2/paths";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";
import { uploadBrokerageFile } from "@/lib/crm2/storage";
import type { Crm2BrokerageRow, Crm2StaffMember } from "@/lib/crm2/types";
import { fmtTime } from "@/lib/format";

import { loadContractContext } from "./actions";
import {
  STEP1_MISSING,
  applyCommission,
  commissionRecalc,
  commissionWarning,
  composeSignerNote,
  confirmPrefilled,
  contractAgentPatch,
  contractDirty,
  contractDraftFields,
  contractFormErrors,
  contractMissing,
  editContractField,
  fileCounts,
  initialContractForm,
  initialStep,
  parseSignerNote,
  setAutoNumber,
  termEndDate,
  type ContractFieldErrors,
  type ContractForm,
  type SignerContact,
} from "./contract-model";
import type { ContractContext } from "./contract-types";
import { ContractDraftStep } from "./ContractDraftStep";
import { ContractFilesStep } from "./ContractFilesStep";
import { DocPagesSheet, useContractUploads } from "./DocPagesSheet";
import { MissingList } from "./parts";

export type ContractSheetProps = {
  propertyId: string;
  officeId: string;
  /** Засах ноорог; null бол шинэ ноорог үүсгэнэ. */
  contract: Crm2BrokerageRow | null;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  onClose: () => void;
  /** Картаас (AgreementTab) бэлэн өгөгдөл; өгөхгүй бол loadContractContext()-оор ачаална. */
  context?: ContractContext | null;
  /** Өгөхгүй бол URL-аас. */
  panel?: Crm2Panel;
  open?: boolean;
  initialStep?: 1 | 2;
};

type DraftPublic = Omit<ContractForm, "signer_relation"> & { forContract: string | null };
type DraftPrivate = { signer_relation: string; signer: OwnerDraft | null };

/**
 * Зуучлалын гэрээний доод цонх (P7) — урьдчилан бөглөсөн, 2 алхамтай:
 *   1 «Гэрээний ноорог үүсгэх»: эзэн (хөрөнгөөс), гарын үсэг зурагч, дугаар, хугацаа, шимтгэл, онцгой нөхцөл, агент.
 *   2 «Батлуулахаар илгээх»: камераар хуудас → нэг PDF, файл/галерей, өмчлөлийн баримт, илгээх.
 * Маягт утсан дээр автоматаар хадгалагдана (зурагчийн утас vault-д), апп солиход алдагдахгүй.
 */
export function ContractSheet(props: ContractSheetProps) {
  const { propertyId, onClose } = props;
  const open = props.open ?? true;
  const router = useRouter();
  const pathname = usePathname();
  const panel = props.panel ?? panelFromPathname(pathname);
  const [loaded, setLoaded] = React.useState<ContractContext | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [stepHint, setStepHint] = React.useState<1 | 2 | undefined>(props.initialStep);
  const ctx = loaded ?? props.context ?? null;

  const reload = React.useCallback(async () => {
    const res = await loadContractContext(propertyId);
    if (res.ok) {
      setLoaded(res.data);
      setLoadError(null);
    } else setLoadError(res.error);
  }, [propertyId]);

  const needLoad = open && !props.context && !loaded;
  React.useEffect(() => {
    if (!needLoad) return;
    let cancelled = false;
    loadContractContext(propertyId).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setLoaded(res.data);
        else setLoadError(res.error);
      },
      () => {
        if (!cancelled) setLoadError("Гэрээний мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needLoad, propertyId]);

  const refresh = React.useCallback(async () => {
    router.refresh();
    await reload();
  }, [router, reload]);

  const currentId = savedId ?? props.contract?.id ?? null;
  const item = ctx && currentId ? (ctx.contracts.find((c) => c.id === currentId) ?? null) : null;
  const waiting = !ctx || (currentId !== null && !item);

  if (waiting) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Зуучлалын гэрээ">
        {loadError ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {loadError}
            </p>
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => {
                setLoadError(null);
                void reload();
              }}
            >
              Дахин оролдох
            </Button>
          </div>
        ) : (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Ачаалж байна…
          </p>
        )}
      </BottomSheet>
    );
  }

  return (
    <ContractEditor
      key={item?.id ?? "new"}
      {...props}
      open={open}
      panel={panel}
      ctx={ctx}
      item={item}
      stepHint={stepHint}
      onCreated={(id) => {
        setSavedId(id);
        setStepHint(2);
      }}
      onStep={setStepHint}
      refresh={refresh}
    />
  );
}

function ContractEditor({
  propertyId,
  officeId,
  settings,
  staff,
  onClose,
  open,
  panel,
  ctx,
  item,
  stepHint,
  onCreated,
  onStep,
  refresh,
}: ContractSheetProps & {
  open: boolean;
  panel: Crm2Panel;
  ctx: ContractContext;
  item: ContractContext["contracts"][number] | null;
  stepHint: 1 | 2 | undefined;
  onCreated: (id: string) => void;
  onStep: (s: 1 | 2) => void;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const meId = ctx.meId;
  const limits = React.useMemo(() => {
    const l = fileLimits(settings);
    return { maxDocMb: l.maxDocMb, maxDocsPerContract: l.maxDocsPerContract };
  }, [settings]);
  const termMonths = settings["brokerage.default_term_months"];
  const sources = settings["contact.sources"];

  const baseline = React.useMemo(
    () => initialContractForm({ contract: item, property: ctx.property, settings, today: ctx.today, meId }),
    [item, ctx.property, settings, ctx.today, meId]
  );
  const baselineSigner = React.useMemo<OwnerDraft | null>(() => {
    const s = parseSignerNote(item?.signer_note).signer;
    return s ? { phone: s.phone, name: s.name, source: null, sourceGuessed: false, sourceNote: "", chosenContactId: null, allowDuplicate: false } : null;
  }, [item?.signer_note]);

  const [form, setForm] = React.useState<ContractForm>(baseline);
  const [signer, setSigner] = React.useState<OwnerDraft | null>(baselineSigner);
  const [signerKey, setSignerKey] = React.useState(0);
  const [errors, setErrors] = React.useState<ContractFieldErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  const [restoreChecked, setRestoreChecked] = React.useState(false);
  const [pagesOpen, setPagesOpen] = React.useState(false);
  const [canRestricted, setCanRestricted] = React.useState<boolean | null>(null);
  const [fileAtOffice, setFileAtOffice] = React.useState(!!item?.file_at_office);
  const [submitting, setSubmitting] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const editable = !item || (item.status === "draft" && item.canEditDraft);
  const scope = sheetScope(propertyId, "contract");

  // 12 цагаас хуучин (гэхдээ энэ гэрээнийх, серверээс шинэ) ноорог — асууна, асуухгүйгээр устгахгүй.
  const [offer, setOffer] = React.useState<LoadedDraft<DraftPublic, DraftPrivate> | null>(null);

  function applyDraft(d: LoadedDraft<DraftPublic, DraftPrivate>) {
    const { forContract: _ignored, ...rest } = d.form;
    void _ignored;
    setForm({ ...baseline, ...rest, prefilled: rest.prefilled.filter((k) => baseline.prefilled.includes(k) || !item), signer_relation: d.private?.signer_relation ?? baseline.signer_relation });
    if (d.private?.signer) {
      setSigner(d.private.signer);
      setSignerKey((k) => k + 1);
    }
    setRestoredAt(d.record.savedAt);
  }

  // ── Утсан дээрх ноорог ──
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await loadDraft<DraftPublic, DraftPrivate>(meId, scope);
        if (cancelled || !d) return;
        const fresh = d.record.savedAt > (item ? Date.parse(item.updated_at) || 0 : 0);
        const mine = d.form.forContract === (item?.id ?? null);
        if (mine && fresh && shouldAutoRestore(d.record.savedAt)) {
          applyDraft(d);
          logUiEvent({ event: "draft_restored_auto", flow: "card", property_id: propertyId, meta: { contract: true } });
        } else if (mine && fresh) {
          setOffer(d);
          logUiEvent({ event: "draft_restore_offer", flow: "card", property_id: propertyId, meta: { contract: true } });
        } else {
          // Өөр гэрээнийх эсвэл серверийн хувилбар нь шинэ — утсан дээрх хуучин ноорог хэрэггүй.
          await hardDeleteDraft(draftKey(meId, scope));
        }
      } catch {
        /* IndexedDB боломжгүй — зөвхөн санах ойд */
      } finally {
        if (!cancelled) setRestoreChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // зөвхөн нээхэд
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { signer_relation, ...publicRest } = form;
  const autosave = useDraftAutosave<DraftPublic, DraftPrivate>(
    { form: { ...publicRest, forContract: item?.id ?? null }, private: { signer_relation, signer } },
    { profileId: meId, scope, enabled: restoreChecked && editable && !offer }
  );

  async function resolveOffer(keep: boolean) {
    const d = offer;
    if (!d) return;
    if (keep) {
      applyDraft(d);
      logUiEvent({ event: "draft_restored", flow: "card", property_id: propertyId, meta: { contract: true } });
    } else {
      await hardDeleteDraft(draftKey(meId, scope)).catch(() => {});
      logUiEvent({ event: "draft_discarded", flow: "card", property_id: propertyId, meta: { contract: true } });
    }
    setOffer(null);
  }

  // ── Өмчлөлийн баримт хавсаргах эрх ──
  React.useEffect(() => {
    if (!item) return;
    let cancelled = false;
    void canViewRestrictedBrokerage(item.id).then((r) => {
      if (!cancelled) setCanRestricted(r.ok ? r.data : false);
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const uploads = useContractUploads(meId, propertyId, item?.id ?? null);

  const signerContact: SignerContact | null = signer ? { name: signer.name, phone: signer.phone } : null;
  const owner = ctx.owner === "hidden" ? "hidden" : ctx.owner ? { id: ctx.owner.id, nameUnverified: ctx.owner.name_unverified, source: ctx.owner.source } : null;
  const missing = contractMissing(ctx.checklist, form, {
    status: "draft",
    owner,
    files: fileCounts(item?.files),
    fileAtOffice,
    signerNote: composeSignerNote(form.signer_relation, signerContact),
    confirmsAgent: ctx.canEditProperty,
  });
  const step1Missing = missing.filter((m) => STEP1_MISSING.has(m));
  const step: 1 | 2 = !item ? 1 : (stepHint ?? initialStep(true, missing));
  const dirty = contractDirty(
    form,
    baseline,
    signerContact,
    baselineSigner ? { name: baselineSigner.name, phone: baselineSigner.phone } : null,
    { property: ctx.property, canEdit: ctx.canEditProperty }
  );

  const recalc = editable ? commissionRecalc(form, ctx.property, settings) : null;
  const warning = commissionWarning(form, ctx.property.category);

  function edit<K extends keyof ContractForm>(key: K, value: ContractForm[K]) {
    setForm((f) => editContractField(f, key, value));
    const errKey = key === "signer_relation" ? "signer_note" : key;
    if (errKey in errors) setErrors((e) => ({ ...e, [errKey]: undefined }));
  }

  function focusField(field: string | null | undefined) {
    if (!field) return;
    const map: Record<string, string> = { number: "Гэрээний дугаар", end_date: "Гэрээний хугацаа", commission_value: "Шимтгэл", signer_note: "Гарын үсэг зурагч" };
    const label = map[field];
    const el = label ? bodyRef.current?.querySelector<HTMLElement>(`[aria-label="${label}"] input, [aria-label="${label}"] textarea`) : null;
    el?.focus();
  }

  async function saveStep1(): Promise<boolean> {
    // Хуучин ноорогийн асуултад хариулаагүй бол хадгалахгүй (хадгалалт ноорогийг устгадаг).
    if (saving || offer) return false;
    const errs = contractFormErrors(form, { isNew: !item });
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      onStep(1);
      requestAnimationFrame(() => focusField(first));
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const ownerId = ctx.owner && ctx.owner !== "hidden" ? ctx.owner.id : null;
      const fields = contractDraftFields(form, { ownerContactId: ownerId, signer: signerContact });
      const payload = { ...fields, owner_contact_id: ctx.owner === "hidden" ? undefined : fields.owner_contact_id };
      let id = item?.id ?? null;
      if (item) {
        const res = await updateBrokerageDraft({ contract_id: item.id, ...payload });
        if (!res.ok) {
          setSaveError(res.error);
          focusField(res.field);
          return false;
        }
      } else {
        const res = await createBrokerageDraft({ property_id: propertyId, ...payload });
        if (!res.ok) {
          setSaveError(res.error);
          focusField(res.field);
          return false;
        }
        id = res.data.id;
      }
      if (ctx.canEditProperty) {
        const patch = contractAgentPatch(form, ctx.property);
        if (patch) {
          const r = await updateProperty(propertyId, patch);
          if (!r.ok) toast.error("Гэрээ хадгалагдсан ч гэрээ байгуулсан агентыг бичиж чадсангүй", { description: r.error });
        }
      }
      autosave.cancel();
      await hardDeleteDraft(draftKey(meId, scope)).catch(() => {});
      logUiEvent({ event: "contract_draft_saved", flow: "card", property_id: propertyId, meta: { created: !item, prefilled: form.prefilled.length } });
      toast.success(item ? "Гэрээ хадгалагдлаа" : "Гэрээний ноорог үүслээ");
      await refresh();
      if (!item && id) onCreated(id);
      else onStep(2);
      return true;
    } catch (e) {
      console.error("ContractSheet save:", e);
      setSaveError("Алдаа гарлаа. Дахин оролдоно уу.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function pickFiles(kind: Crm2BrokerageFileKindKey, files: File[]) {
    if (!item) return;
    let existing = item.files.length + uploads.items.length;
    let queued = 0;
    for (const file of files) {
      const invalid = validateDocFile(file, limits, existing);
      if (invalid) {
        toast.error(invalid);
        continue;
      }
      try {
        await enqueue({ profileId: meId, target: { kind: "brokerage", contractId: item.id, fileKind: kind, officeId, limits }, blob: file, name: file.name });
        queued++;
      } catch {
        // Утсан дээр хадгалах боломжгүй — шууд хуулна.
        const r = await uploadBrokerageFile({ file, officeId, contractId: item.id, limits, existing, kind });
        if (!r.ok) toast.error(r.error);
        else router.refresh();
      }
      existing++;
    }
    if (queued) void startQueue(meId);
  }

  async function toggleFileAtOffice(v: boolean) {
    if (!item) return;
    setFileAtOffice(v);
    const r = await updateBrokerageDraft({ contract_id: item.id, file_at_office: v });
    if (!r.ok) {
      setFileAtOffice(!v);
      toast.error(r.error);
      return;
    }
    router.refresh();
  }

  async function submit() {
    if (!item || submitting) return;
    if (dirty) {
      const saved = await saveStep1();
      if (!saved) return;
    }
    setSubmitting(true);
    setSaveError(null);
    const r = await submitBrokerage(item.id);
    setSubmitting(false);
    if (!r.ok) {
      setSaveError(r.error);
      return;
    }
    logUiEvent({ event: "contract_submitted", flow: "card", property_id: propertyId, meta: { files: item.files.length } });
    toast.success("Батлуулахаар илгээлээ", { description: "Батлагч шалгаж батална." });
    router.refresh();
    onClose();
  }

  const busy = saving || submitting;
  const savedLine = restoredAt
    ? `Ноорог сэргээгдлээ ${fmtTime(restoredAt)}`
    : autosave.savedAt
      ? `Утсан дээр хадгалагдсан ${fmtTime(autosave.savedAt)}`
      : null;

  const footer = !editable ? null : step === 1 ? (
    <div className="space-y-1.5">
      {saveError ? (
        <p role="alert" className="text-sm text-rose-700">
          {saveError}
        </p>
      ) : null}
      <Button type="button" size="lg" className="w-full" disabled={busy || !restoreChecked || !!offer} onClick={() => void saveStep1()}>
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {item ? (dirty ? "Хадгалаад үргэлжлүүлэх" : "Үргэлжлүүлэх") : "Ноорог үүсгээд үргэлжлүүлэх"}
      </Button>
      {savedLine ? (
        <p role="status" aria-live="polite" className="text-center text-xs text-muted">
          {savedLine}
        </p>
      ) : null}
    </div>
  ) : (
    <div className="space-y-1.5">
      {saveError ? (
        <p role="alert" className="text-sm text-rose-700">
          {saveError}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={busy || missing.length > 0 || uploads.uploading}
        aria-describedby={missing.length ? "contract-missing" : undefined}
        onClick={() => void submit()}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {uploads.uploading ? "Гэрээ илгээгдэж байна" : "Батлуулахаар илгээх"}
      </Button>
      {missing.length ? (
        <p id="contract-missing" className="text-center text-xs text-muted">
          {missing.length} зүйл дутуу
        </p>
      ) : null}
    </div>
  );

  const title = item ? `Гэрээ · ${item.number}` : "Зуучлалын гэрээ";

  return (
    <>
      <BottomSheet open={open && !pagesOpen} onClose={() => !busy && onClose()} title={title} footer={footer}>
        <div ref={bodyRef} className="space-y-5">
          {offer && editable ? (
            <div role="group" aria-label="Утсан дээрх ноорог" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-950">
                Энэ гэрээний ноорог {fmtTime(offer.record.savedAt)}-д утсан дээр хадгалагдсан (12 цагаас өмнө). Үргэлжлүүлэх үү?
              </p>
              {offer.privateLost ? <p className="text-xs text-amber-900">Гарын үсэг зурагчийн утас сэргэхгүй — дахин оруулна уу.</p> : null}
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <Button type="button" size="lg" onClick={() => void resolveOffer(true)}>
                  Үргэлжлүүлэх
                </Button>
                <Button type="button" size="lg" variant="outline" onClick={() => void resolveOffer(false)}>
                  Хаях
                </Button>
              </div>
            </div>
          ) : null}
          {editable ? (
            <ol className="grid grid-cols-2 gap-2" aria-label="Алхам">
              {([1, 2] as const).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={step === s ? "step" : undefined}
                    disabled={busy || (s === 2 && !item)}
                    onClick={() => {
                      if (s === 2 && dirty) void saveStep1();
                      else onStep(s);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold disabled:opacity-50",
                      step === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-muted hover:bg-surface-2"
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs">{s}</span>
                    <span className="min-w-0 leading-tight">{s === 1 ? "Гэрээний ноорог үүсгэх" : "Батлуулахаар илгээх"}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              {item && item.status !== "draft"
                ? "Энэ гэрээ ноорог биш — илгээсэн/батлагдсан гэрээг картын «Гэрээ» хэсгээс харна."
                : "Энэ ноорог гэрээг засах эрхгүй."}
            </p>
          )}

          {editable && step === 1 ? (
            <>
              <ContractDraftStep
                key={signerKey}
                ctx={ctx}
                form={form}
                edit={edit}
                onConfirm={(k) => setForm((f) => confirmPrefilled(f, k))}
                onAutoNumber={(auto) => {
                  setForm((f) => setAutoNumber(f, auto));
                  setErrors((e) => ({ ...e, number: undefined }));
                }}
                errors={errors}
                isNew={!item}
                termMonths={termMonths}
                onStartToday={() => edit("start_date", ctx.today)}
                onEndTerm={() => {
                  const end = termEndDate(form.start_date, termMonths);
                  if (end) edit("end_date", end);
                }}
                recalc={recalc}
                onRecalc={() => recalc && setForm((f) => confirmPrefilled(applyCommission(f, recalc), "commission"))}
                warning={warning}
                signerInitial={signer}
                onSignerChange={setSigner}
                staff={staff}
                sources={sources}
                panel={panel}
                disabled={busy}
                onOwnerChanged={() => void refresh()}
              />
              <MissingList items={step1Missing} title="Батлуулахад дутуу (энэ алхамд):" />
            </>
          ) : null}

          {editable && step === 2 && item ? (
            <ContractFilesStep
              contract={item}
              uploads={uploads}
              canRestricted={canRestricted}
              fileAtOffice={fileAtOffice}
              onFileAtOffice={(v) => void toggleFileAtOffice(v)}
              missing={missing}
              onOpenPages={() => setPagesOpen(true)}
              onPickFiles={(kind, files) => void pickFiles(kind, files)}
              onRetry={(id) => void uploads.retry(id)}
              onRemove={(id) => void uploads.remove(id)}
              disabled={busy}
            />
          ) : null}
        </div>
      </BottomSheet>

      {item && editable ? (
        <DocPagesSheet
          open={open && pagesOpen}
          onClose={() => setPagesOpen(false)}
          profileId={meId}
          propertyId={propertyId}
          officeId={officeId}
          contractId={item.id}
          limits={limits}
          onQueued={(n) => toast.success(n > 1 ? `Гэрээ ${n} PDF болж илгээгдэж байна` : "Гэрээ PDF болж илгээгдэж байна")}
        />
      ) : null}
    </>
  );
}

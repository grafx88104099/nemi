"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, FileSignature, Images, KeyRound, Loader2, MapPinned, Ruler, ScrollText, UsersRound, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { DuplicateNotice } from "@/components/crm2/staff/duplicates/DuplicateNotice";
import { addPropertyVideoLink } from "@/lib/crm2/actions/media";
import { createProperty, updateProperty, updatePropertyPrivate } from "@/lib/crm2/actions/properties";
import { fieldStage } from "@/lib/crm2/checklist";
import { ubToday } from "@/lib/crm2/datetime";
import { getBlob, makeTitleHint, PRIVATE_LOST_TEXT, putBlob, type DraftMedia, type LoadedDraft } from "@/lib/crm2/device/draft-store";
import { enqueue, listQueue, startQueue, whenIdle } from "@/lib/crm2/device/upload-queue";
import { useKeyboardInset, useScrollFocusedIntoView } from "@/lib/crm2/device/viewport";
import { issuesByField, validateFields } from "@/lib/crm2/field-validation";
import {
  categoryLabel,
  CURRENCIES,
  CURRENCY_LABEL,
  PRICE_PERIOD_LABEL,
  PROPERTY_AGENT_ROLE_LABEL,
  PROPERTY_AGENT_ROLES,
  PROPERTY_CATEGORIES,
  SAVE_DRAFT_LABEL,
  STAGE_TAG_LABEL,
  VIEW_NOTE_LABEL,
  type PropertyAgentRole,
} from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone } from "@/lib/crm2/phone";
import type { PropertyDetail, PropertyPrivate } from "@/lib/crm2/queries/properties";
import { dbErrorField } from "@/lib/crm2/result";
import {
  type PropertyCreateInput,
  type PropertyPrivateInput,
  type PropertyUpdateInput,
} from "@/lib/crm2/schemas";
import { fileLimits, settingOptions, type Crm2Settings } from "@/lib/crm2/settings";
import { uploadMany, uploadPropertyMedia } from "@/lib/crm2/storage";
import type { Crm2Currency, Crm2PricePeriod, Crm2PropertyDuplicate, Crm2StaffMember } from "@/lib/crm2/types";
import { fmtShortDateTime, fmtTime } from "@/lib/format";

import { AgentSelect } from "./AgentSelect";
import {
  ChoiceChips,
  FieldNote,
  FormAlert,
  FormField,
  FormSection,
  StageTag,
  SuggestionChips,
  Textarea,
  ToggleChips,
} from "./fields";
import { FloorField } from "./FloorField";
import {
  confirmFields,
  diffPayload,
  draftTitleParts,
  emptyPrivateForm,
  emptyPropertyForm,
  fieldsFilled,
  fromCreateDraft,
  hasRentTerms,
  isUnconfirmed,
  omitKey,
  operatingCostIsSimple,
  parseRecent,
  pricePeriodMismatch,
  pricePeriodOptions,
  privatePayload,
  projectChange,
  projectForCreate,
  propertyInputErrors,
  propertyPayload,
  propertyToForm,
  pushRecent,
  recentDistrictsKey,
  sameAgentConflict,
  toCreateDraft,
  validationInput,
  withCategory,
  type CreateDraftForm,
  type CreateDraftPrivate,
  type FieldNoteKey,
  type OwnerRef,
  type PrivateFormState,
  type PropertyFormState,
} from "./form-model";
import { OwnerPicker } from "./OwnerPicker";
import { EMPTY_MEDIA_QUEUE, MediaQueue, queueCoverId, type MediaQueueValue, type QueuedFile } from "./MediaQueue";
import { PinField } from "./PinField";
import { PriceField } from "./PriceField";
import { SuggestInput } from "./SuggestInput";
import { loadLocationSuggestions, loadProjectSuggestions } from "./suggest-loaders";
import { trackUi, useCreateDraft, useStaffDraftKey } from "./useCreateDraft";

/** Хадгалсны дараа зураг хуулахыг хүлээх дээд хугацаа — дараа нь дараалал өөрөө үргэлжлүүлнэ. */
const UPLOAD_WAIT_MS = 90_000;

type EditProperty = PropertyDetail["property"];

type CommonProps = {
  panel: Crm2Panel;
  officeId: string;
  me: string;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  /** Томилогдсон үүрэгт агентыг солих (менежер/ахлагч) — идэвхжсэн хөрөнгөд. */
  canReassign: boolean;
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

type InnerProps = Props & { clientKey: string | null };

type CreateResultData = {
  id: string;
  code: string;
  warning: string | null;
  replayed?: boolean;
  duplicates?: Crm2PropertyDuplicate[];
};

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

/** DB-ийн алдааны талбар (dbErrorField) → маягтын алдааны түлхүүр. */
function formErrorKey(field: string): string {
  if (field === "owner" || field.startsWith("owner.")) return "private.owner_contact_id";
  if (field === "project_id" || field === "project") return "project_name";
  if (field === "lng") return "lat";
  if (field === "building_floors") return "floor";
  return field;
}

function focusField(key: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(fid(key));
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

/** Хэрэглэгч бүрийн сүүлийн дүүргүүд (localStorage — сервер дээр null). */
const noopSubscribe = () => () => undefined;
function useStoredString(key: string): string | null {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );
}

function blobsToQueue(list: DraftMedia[]): Promise<{ files: QueuedFile[]; blobs: Record<string, DraftMedia> }> {
  return Promise.all(
    list.map(async (m) => {
      const blob = await getBlob(m.blobKey).catch(() => null);
      if (!blob) return null;
      const file = blob instanceof File ? blob : new File([blob], m.name, { type: blob.type });
      const q: QueuedFile = { id: m.id, file, kind: m.kind, preview: URL.createObjectURL(file), w: m.w || undefined, h: m.h || undefined };
      return { q, m };
    })
  ).then((rows) => {
    const files: QueuedFile[] = [];
    const blobs: Record<string, DraftMedia> = {};
    for (const r of rows) {
      if (!r) continue;
      files.push(r.q);
      blobs[r.q.id] = r.m;
    }
    return { files, blobs };
  });
}

/**
 * S02 — Staff хөрөнгө нэмэх ба засах маягт. Шинэ хөрөнгө үргэлж НООРОГ болж
 * үүснэ; бөглөсөн бүхэн утсан дээр автоматаар хадгалагдана (P5). Медиа хөрөнгө үүссэний дараа
 * upload дараалалаар, гэрээ шууд хадгалагдана. Засах горимд зөвхөн өөрчлөгдсөн талбарыг илгээнэ.
 */
export function StaffForm(props: Props) {
  if (props.mode === "create") return <CreateGate {...props} />;
  return <StaffFormInner {...props} clientKey={null} />;
}

function CreateGate(props: Props & { mode: "create" }) {
  const paths = React.useMemo(() => crm2Paths(props.panel), [props.panel]);
  const clientKey = useStaffDraftKey(paths);
  if (!clientKey) {
    return (
      <p role="status" className="py-10 text-center text-sm text-muted">
        Маягтыг бэлдэж байна…
      </p>
    );
  }
  // Ноорог бүр (clientKey) өөрийн маягт — «Шинээр эхлэх» бүрэн цэвэр маягт өгнө.
  return <StaffFormInner key={clientKey} {...props} clientKey={clientKey} />;
}

/**
 * «Шуурхай бүртгэл» холбоос — ижил ноорогоор (?draft) шуурхай дэлгэц рүү (feature flag асаалттай
 * үед л StaffFormScreen харуулна).
 */
export function QuickAddLink({ panel }: { panel: Crm2Panel }) {
  const sp = useSearchParams();
  const draft = sp.get("draft");
  const href = crm2Paths(panel).staffNew(draft ? { draft } : undefined);
  return (
    <Link href={href} className={buttonClasses("outline", "touch")}>
      <Zap className="size-4" aria-hidden />
      Шуурхай бүртгэл
    </Link>
  );
}

function StaffFormInner(props: InnerProps) {
  const { panel, officeId, me, settings, staff, canReassign, clientKey } = props;
  const router = useRouter();
  const paths = React.useMemo(() => crm2Paths(panel), [panel]);
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
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(() => new Set());
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  /** Шинэ хөрөнгө: аль товч дарагдсан (ачаалж буй тэмдэг тэр товчон дээр). */
  const [createAction, setCreateAction] = React.useState<"draft" | "contract" | null>(null);
  const [step, setStep] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);

  // Зөвхөн шинэ хөрөнгөд: медиа хөрөнгө үүссэний дараа хадгалагдана (гэрээг картаас бүртгэнэ).
  const [media, setMedia] = React.useState<MediaQueueValue>(EMPTY_MEDIA_QUEUE);
  /** Дараалсан файл (QueuedFile.id) → утсан дээрх blob (ноорогт). */
  const [blobs, setBlobs] = React.useState<Record<string, DraftMedia>>({});
  /** Шуурхай бүртгэлд бичсэн эзний дугаар (эзэн сонгогдтол хадгална). */
  const [quickPhone, setQuickPhone] = React.useState<string | null>(null);
  /** Хадгалсан ч давхардал илэрсэн — DuplicateNotice + «Үргэлжлүүлэх» (гэрээ бүртгэх эсвэл засах руу). */
  const [saved, setSaved] = React.useState<{
    id: string;
    code: string;
    duplicates: Crm2PropertyDuplicate[];
    next: string;
    thenContract: boolean;
  } | null>(null);
  /** Давтан дарахад хөрөнгө/медиаг дахин үүсгэхгүй. */
  const progress = React.useRef<{ created: CreateResultData | null; mediaDone: boolean }>({
    created: null,
    mediaDone: false,
  });

  // ── Хэмжилт ──────────────────────────────────────────────────────────────
  const openedAt = React.useRef<number | null>(null);
  const firstInputAt = React.useRef<number | null>(null);
  const taps = React.useRef(0);
  React.useEffect(() => {
    openedAt.current = Date.now();
    trackUi({ event: "full_open", flow: "full", property_id: editProperty?.id ?? null, meta: { edit: isEdit } });
    // зөвхөн анх
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const markInput = () => {
    if (firstInputAt.current === null) firstInputAt.current = Date.now();
  };

  // ── Ноорог (зөвхөн шинэ хөрөнгө) ─────────────────────────────────────────
  const draftParts = toCreateDraft({ form, priv, links: media.links }, quickPhone);
  const draftMedia = media.files.map((f) => blobs[f.id]).filter((m): m is DraftMedia => !!m);
  const draft = useCreateDraft<CreateDraftForm, CreateDraftPrivate>({
    profileId: me,
    clientKey,
    paths,
    state: {
      form: draftParts.form,
      private: draftParts.private,
      media: draftMedia,
      coverId: queueCoverId(media),
      titleHint: makeTitleHint(draftTitleParts(form)),
    },
    onRestore: (d: LoadedDraft<CreateDraftForm, CreateDraftPrivate>) => {
      const r = fromCreateDraft(d.form, d.private, me);
      setForm(r.form);
      setPriv(r.priv);
      setQuickPhone(r.quickPhone);
      setMedia((m) => ({ ...m, links: r.links }));
      if (d.media.length) {
        void blobsToQueue(d.media).then(({ files, blobs: restored }) => {
          setBlobs((b) => ({ ...b, ...restored }));
          setMedia((m) => ({ ...m, files: [...files, ...m.files.filter((f) => !restored[f.id])], coverId: d.coverId }));
        });
      }
    },
  });

  // Шинэ медиа файлыг утсан дээр (IndexedDB) хадгална — апп солиход алдагдахгүй.
  const storing = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!clientKey) return;
    for (const f of media.files) {
      if (blobs[f.id] || storing.current.has(f.id)) continue;
      storing.current.add(f.id);
      putBlob(me, f.file, f.file.name)
        .then((blobKey) =>
          setBlobs((b) => ({
            ...b,
            [f.id]: { id: f.id, blobKey, name: f.file.name, kind: f.kind, bytes: f.file.size, w: f.w ?? 0, h: f.h ?? 0 },
          }))
        )
        .catch(() => undefined)
        .finally(() => storing.current.delete(f.id));
    }
  }, [media.files, blobs, me, clientKey]);

  // ── Тохиргоо ─────────────────────────────────────────────────────────────
  const limits = fileLimits(settings);
  const stageSettings = {
    activationRequired: settings["property.activation_required"],
    requireOwner: settings["brokerage.require_owner"],
  };
  const stage = (key: string) => fieldStage(key, stageSettings);
  const catLabels = settings["property.category_labels"];
  const catHints = settings["property.category_hints"] ?? {};
  const typeOptions = settingOptions(settings["property.types"]);
  const featureOptions = settingOptions(settings["property.features"]);
  const districts = settings["property.districts"];
  const districtOptions = form.district && !districts.includes(form.district) ? [...districts, form.district] : districts;
  const recentRaw = useStoredString(recentDistrictsKey(me));
  const recentDistricts = parseRecent(recentRaw, districts).filter((d) => d !== form.district);
  const busy = saving || !!saved;

  // Гар нээлттэй үед хадгалах мөр гарын дээр; идэвхтэй талбар голд гүйлгэгдэнэ.
  const formRef = React.useRef<HTMLFormElement>(null);
  const keyboardInset = useKeyboardInset();
  useScrollFocusedIntoView(formRef, 88);

  const set = <K extends keyof PropertyFormState>(key: K, value: PropertyFormState[K]) => {
    // Автоматаар бөглөгдсөн утгыг агент өөрчилбөл баталгаажсанд тооцно.
    setForm((s) => ({ ...s, [key]: value, unconfirmed: confirmFields(s.unconfirmed, [key as string]) }));
    if (errors[key as string]) setErrors((e) => omitKey(e, key as string));
  };
  const confirm = (...keys: string[]) => setForm((s) => ({ ...s, unconfirmed: confirmFields(s.unconfirmed, keys) }));
  const auto = (key: string) => isUnconfirmed(form.unconfirmed, key);
  const setNote = (key: FieldNoteKey, value: string) =>
    setForm((s) => ({ ...s, field_notes: { ...s.field_notes, [key]: value } }));
  const note = (key: FieldNoteKey, label: string) => (
    <FieldNote value={form.field_notes[key] ?? ""} onChange={(v) => setNote(key, v)} label={label} />
  );

  // Фокус алдахад (blur) шалгах — алдаа ба сануулга (хадгалахыг саатуулахгүй).
  const blurIssues = validateFields(validationInput(form)).filter((i) => touched.has(i.field));
  const blurErrors = issuesByField(blurIssues, "error");
  const blurWarnings = issuesByField(blurIssues, "warning");
  const err = (key: string) => errors[key] ?? blurErrors[key] ?? null;
  const warn = (key: string) => (errors[key] ? null : (blurWarnings[key] ?? null));

  function onBlurCapture(e: React.FocusEvent<HTMLFormElement>) {
    const id = (e.target as HTMLElement).id;
    if (!id?.startsWith("sf-")) return;
    const key = id.slice(3).replace(/-/g, ".");
    if (!touched.has(key)) setTouched((t) => new Set(t).add(key));
  }

  function showErrors(errs: Record<string, string>, general?: string) {
    setErrors(errs);
    const first = Object.keys(errs)[0];
    setServerError(general ?? (first ? `Алдаатай талбарыг засна уу: ${errs[first]}` : null));
    if (first) focusField(first);
  }

  /** Серверийн алдаа: талбарыг (dbErrorField) тодруулж фокуслана. */
  function showServerError(text: string, prefix = "") {
    setServerError(`${prefix}${text}`);
    const field = dbErrorField({ message: text }).field;
    if (!field) return;
    const key = formErrorKey(field);
    setErrors((e) => ({ ...e, [key]: text }));
    focusField(key);
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

  function rememberDistrict() {
    if (!form.district) return;
    try {
      const next = pushRecent(parseRecent(window.localStorage.getItem(recentDistrictsKey(me)), districts), form.district);
      window.localStorage.setItem(recentDistrictsKey(me), JSON.stringify(next));
    } catch {
      /* localStorage алга */
    }
  }

  async function ensureBlobKey(f: QueuedFile): Promise<string | null> {
    if (blobs[f.id]) return blobs[f.id].blobKey;
    try {
      return await putBlob(me, f.file, f.file.name);
    } catch {
      return null;
    }
  }

  /** Медиаг upload дараалалд шилжүүлнэ (эзэмшил шилжсэний дараа ноорог устгагдана). */
  async function queueMedia(propertyId: string, warnings: string[]): Promise<number> {
    const files = [...media.files.filter((f) => f.kind === "image"), ...media.files.filter((f) => f.kind === "video")];
    if (!files.length) return 0;
    const cover = queueCoverId(media);
    const ids: string[] = [];
    const direct: { f: QueuedFile; i: number }[] = [];
    for (const [i, f] of files.entries()) {
      const blobKey = clientKey ? await ensureBlobKey(f) : null;
      if (!blobKey || !clientKey) {
        direct.push({ f, i });
        continue;
      }
      try {
        const item = await enqueue({
          profileId: me,
          blobKey,
          name: f.file.name,
          target: {
            kind: "media",
            propertyId,
            clientKey,
            officeId,
            limits,
            sortOrder: i,
            isCover: f.id === cover,
          },
        });
        ids.push(item.id);
      } catch {
        direct.push({ f, i });
      }
    }
    // Утсан дээр хадгалах боломжгүй (IndexedDB алга) — шууд хуулна.
    if (direct.length) {
      setStep(`Медиа хуулж байна (0/${direct.length})…`);
      const res = await uploadMany(
        direct.map((d) => d.f.file),
        (file, j) =>
          uploadPropertyMedia({ file, officeId, propertyId, limits, sortOrder: direct[j].i, isCover: direct[j].f.id === cover }),
        (done, total) => setStep(`Медиа хуулж байна (${done}/${total})…`)
      );
      warnings.push(...res.errors);
    }
    return ids.length ? waitForUploads(ids, warnings) : 0;
  }

  /** Дараалал ажиллаж дуусах (эсвэл UPLOAD_WAIT_MS) хүртэл явцыг харуулна. Үлдсэнийг дараалал өөрөө үргэлжлүүлнэ. */
  async function waitForUploads(ids: string[], warnings: string[]): Promise<number> {
    const mine = new Set(ids);
    const count = async () => (await listQueue(me)).filter((i) => mine.has(i.id) && i.status === "done").length;
    setStep(`Медиа хуулж байна (0/${ids.length})…`);
    void startQueue(me);
    const timer = window.setInterval(() => {
      void count().then((n) => setStep(`Медиа хуулж байна (${n}/${ids.length})…`));
    }, 500);
    try {
      await Promise.race([whenIdle(), new Promise((r) => window.setTimeout(r, UPLOAD_WAIT_MS))]);
    } finally {
      window.clearInterval(timer);
    }
    const done = await count();
    const left = ids.length - done;
    if (left > 0) {
      warnings.push(`${left} файл утсан дээр хадгалагдсан — сүлжээ сайжрахад автоматаар хуулагдана.`);
    }
    return done;
  }

  // ── Шинэ хөрөнгө ─────────────────────────────────────────────────────────
  /**
   * Хадгалах. thenContract — «Хадгалаад гэрээ бүртгэх»: хадгалсны дараа картын «Гэрээ бүртгэх»
   * цонх (PMC тамгатай PDF) руу шилжинэ; эс бөгөөс засах хуудас руу (?created=1).
   */
  async function onCreate(thenContract: boolean) {
    setServerError(null);
    const input = validate();
    if (!input) return;

    setSaving(true);
    setCreateAction(thenContract ? "contract" : "draft");
    const warnings: string[] = [];
    let photos = 0;
    try {
      await draft.flush();
      let data = progress.current.created;
      if (!data) {
        setStep("Хөрөнгийг бүртгэж байна…");
        const source = draft.source === "paste" || draft.source === "share" ? draft.source : "manual";
        const created = await createProperty({ ...input, ...(clientKey ? { client_key: clientKey } : {}), source });
        if (!created.ok) {
          showServerError(created.error);
          return;
        }
        data = created.data as CreateResultData;
        progress.current.created = data;
        if (data.warning) warnings.push(data.warning);
      }
      const { id, code } = data;

      // Медиа: зураг (дарааллаар), дараа нь бичлэг; нүүр зураг — сонгосон эсвэл эхнийх.
      if (!progress.current.mediaDone) {
        progress.current.mediaDone = true;
        photos = media.files.length;
        const pending = queueMedia(id, warnings);
        for (const l of media.links) {
          const res = await addPropertyVideoLink({ property_id: id, external_url: l.url });
          if (!res.ok) warnings.push(`Бичлэгийн холбоос: ${res.error}`);
        }
        await pending;
      }

      // Хадгалагдсан — утсан дээрх ноорогийг устгана (дараалалд шилжсэн зураг үлдэнэ).
      await draft.discard();
      rememberDistrict();
      const duplicates = data.duplicates ?? [];
      const now = Date.now();
      trackUi({
        event: "full_save",
        flow: "full",
        property_id: id,
        duration_ms: openedAt.current ? now - openedAt.current : null,
        first_input_ms: firstInputAt.current ? now - firstInputAt.current : null,
        taps: Math.min(taps.current, 10_000),
        fields_filled: fieldsFilled(form),
        meta: {
          photos,
          restored: draft.restoredAt !== null,
          contract: thenContract,
          duplicates: duplicates.length,
          replayed: !!data.replayed,
        },
      });

      toast.success(`${code} ноорог бүртгэгдлээ`, {
        description: thenContract ? "Одоо PMC-ийн тамга, гарын үсэгтэй гэрээгээ PDF-ээр бүртгэнэ үү." : undefined,
      });
      if (warnings.length) {
        toast.error("Зарим зүйл хадгалагдсангүй", { description: warnings.join(" "), durationMs: 0 });
      }
      const next = thenContract ? paths.property(id, "agreement", { sheet: "contract" }) : `${paths.propertyEdit(id)}?created=1`;
      if (duplicates.length) {
        // Давхардал: хөрөнгө хадгалагдсан — мэдэгдлийг харуулж, агент өөрөө үргэлжлүүлнэ.
        setSaved({ id, code, duplicates, next, thenContract });
        window.requestAnimationFrame(() => document.getElementById("staff-saved")?.scrollIntoView({ block: "start" }));
        return;
      }
      router.replace(next);
    } catch (e) {
      console.error("StaffForm create:", e);
      setServerError("Хадгалахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
      setCreateAction(null);
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
          showServerError(res.error);
          return;
        }
        setBaseline((b) => ({ ...b, form }));
      }
      if (Object.keys(privDiff).length) {
        setStep("Эзний мэдээллийг хадгалж байна…");
        const res = await updatePropertyPrivate(editProperty.id, privDiff as PropertyPrivateInput);
        if (!res.ok) {
          showServerError(res.error, "Хөрөнгийн мэдээлэл хадгалагдсан ч эзний хэсэг хадгалагдсангүй: ");
          router.refresh();
          return;
        }
        setBaseline((b) => ({ ...b, priv }));
      }
      rememberDistrict();
      trackUi({
        event: "full_save",
        flow: "full",
        property_id: editProperty.id,
        duration_ms: openedAt.current ? Date.now() - openedAt.current : null,
        fields_filled: Object.keys(patch).length + Object.keys(privDiff).length,
        meta: { edit: true },
      });
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
  const lockedRole = (role: PropertyAgentRole) =>
    !!editProperty && editProperty.status !== "draft" && !canReassign && !!editProperty[role];
  const agentName = (role: PropertyAgentRole) => {
    const ref = role === "listing_agent_id" ? editProperty?.listing_agent : role === "contract_agent_id" ? editProperty?.contract_agent : editProperty?.photo_agent;
    return ref?.full_name ?? null;
  };
  const today = ubToday();
  const draftStatus =
    clientKey && draft.phase === "ready"
      ? draft.savedAt && draft.savedAt !== draft.restoredAt
        ? `Утсан дээр хадгалагдсан ${fmtTime(draft.savedAt)}`
        : draft.restoredAt
          ? `Ноорог сэргээгдлээ ${fmtTime(draft.restoredAt)}`
          : null
      : null;

  // Хуучин ноорог — үргэлжлүүлэх эсэхийг асууна.
  if (clientKey && draft.phase === "offer") {
    return (
      <div role="dialog" aria-labelledby="sf-offer-title" className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <h2 id="sf-offer-title" className="text-base font-bold text-ink">
          Дуусаагүй ноорог байна
        </h2>
        <p className="mt-1 text-sm text-muted">
          {draft.offerSavedAt ? `Сүүлд ${fmtShortDateTime(draft.offerSavedAt)}-д хадгалсан.` : null} Үргэлжлүүлэх үү, эсвэл шинээр эхлэх
          үү? Шинээр эхэлсэн ч энэ ноорог жагсаалтад үлдэнэ.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">
          <Button type="button" size="lg" onClick={draft.continueOffer}>
            Үргэлжлүүлэх
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={draft.startNew}>
            Шинээр эхлэх
          </Button>
        </div>
      </div>
    );
  }
  if (clientKey && draft.phase === "loading") {
    return (
      <p role="status" className="py-10 text-center text-sm text-muted">
        Ноорог шалгаж байна…
      </p>
    );
  }

  const categoryBlock = (
    <FormField label="Ангилал" error={err("category")} stage="start" unconfirmed={auto("category")} onConfirm={() => confirm("category")}>
      <div id={fid("category")} tabIndex={-1} className="outline-none">
        <ChoiceChips
          label="Ангилал"
          value={form.category}
          invalid={!!err("category")}
          disabled={busy}
          options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, catLabels), hint: catHints[c] ?? null }))}
          onChange={(c) => {
            markInput();
            setForm((s) => ({ ...withCategory(s, c), unconfirmed: confirmFields(s.unconfirmed, ["category"]) }));
            setErrors((e) => omitKey(e, "category"));
          }}
        />
      </div>
    </FormField>
  );

  return (
    <form
      ref={formRef}
      onSubmit={(e) => e.preventDefault()}
      onBlurCapture={onBlurCapture}
      onInputCapture={markInput}
      onPointerDownCapture={() => {
        taps.current++;
      }}
      noValidate
      aria-busy={busy}
      // Гар утсанд оролт 16px (iOS томруулахгүй).
      className="space-y-4 max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base"
    >
      <div className="space-y-1 text-xs text-muted">
        <p>
          Хадгалахад зөвхөн <span className="font-semibold text-ink">ангилал</span> заавал. Шошго нь талбар хэзээ хэрэгтэйг заана:{" "}
          <StageTag stage="start" /> <StageTag stage="contract" /> <StageTag stage="publish" />
          <span className="sr-only">
            {STAGE_TAG_LABEL.start}, {STAGE_TAG_LABEL.contract}, {STAGE_TAG_LABEL.publish}
          </span>
        </p>
        {draftStatus ? (
          <p role="status" aria-live="polite" className="font-medium text-emerald-700">
            {draftStatus}
          </p>
        ) : null}
        {draft.error ? <p className="text-amber-800">Утсан дээр хадгалж чадсангүй — хадгалах товчоор шууд илгээнэ үү.</p> : null}
      </div>

      {form.unconfirmed.length ? (
        <FormAlert tone="warn">
          Шараар тэмдэглэсэн утгыг автоматаар бөглөсөн — шалгаад «Зөв» дарна уу. Нийтлэхээс өмнө баталгаажуулна.
        </FormAlert>
      ) : null}

      {/* 1. Ангилал */}
      <FormSection id="staff-kind" title="Ангилал ба төрөл" icon={Building2}>
        {categoryBlock}
        <FormField
          label="Хөрөнгийн төрөл"
          htmlFor={fid("property_type")}
          stage={stage("property_type")}
          error={err("property_type")}
          unconfirmed={auto("property_type")}
          onConfirm={() => confirm("property_type")}
        >
          <div id={fid("property_type")} tabIndex={-1} className="outline-none">
            <ChoiceChips
              label="Хөрөнгийн төрөл"
              value={form.property_type}
              disabled={busy}
              options={[
                ...typeOptions,
                ...(form.property_type && !settings["property.types"][form.property_type]
                  ? [{ value: form.property_type, label: form.property_type }]
                  : []),
              ]}
              onChange={(v) => set("property_type", v)}
            />
          </div>
        </FormField>
      </FormSection>

      {/* 2. Төсөл ба байршил */}
      <FormSection id="staff-place" title="Төсөл ба байршил" icon={MapPinned}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Төсөл, хотхон"
            htmlFor={fid("project_name")}
            stage={stage("project")}
            error={err("project_name")}
            unconfirmed={auto("project_name")}
            onConfirm={() => confirm("project_name")}
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
              onValueChange={(v) =>
                setForm((s) => ({ ...s, project_name: v, project_id: null, unconfirmed: confirmFields(s.unconfirmed, ["project"]) }))
              }
              onPick={(it) =>
                setForm((s) => ({ ...s, project_name: it.label, project_id: it.key, unconfirmed: confirmFields(s.unconfirmed, ["project"]) }))
              }
            />
            {note("project", "төсөл")}
          </FormField>
          <FormField
            label="Дүүрэг"
            htmlFor={fid("district")}
            stage={stage("district")}
            error={err("district")}
            unconfirmed={auto("district")}
            onConfirm={() => confirm("district")}
          >
            <div className="space-y-2">
              <Select id={fid("district")} value={form.district} disabled={busy} onChange={(e) => set("district", e.target.value)}>
                <option value="">— Сонгоогүй —</option>
                {districtOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              <SuggestionChips
                label="Сүүлд сонгосон дүүрэг"
                disabled={busy}
                items={recentDistricts.map((d) => ({ key: d, label: d, value: d }))}
                onPick={(d) => {
                  markInput();
                  set("district", d);
                }}
              />
            </div>
          </FormField>
          <FormField
            label="Байршил"
            htmlFor={fid("location_text")}
            stage={stage("location_text")}
            error={err("location_text")}
            unconfirmed={auto("location_text")}
            onConfirm={() => confirm("location_text")}
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
            label="Байр, орц, тоот (дотоод)"
            htmlFor={fid("address_detail")}
            stage={stage("address_detail")}
            error={err("address_detail")}
            hint="Нийтэд хэзээ ч гарахгүй."
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
            stage={stage("pin")}
            collapsible={!isEdit}
            onPin={(lat, lng) => setForm((s) => ({ ...s, lat, lng, unconfirmed: confirmFields(s.unconfirmed, ["lat"]) }))}
            onAddress={(v) => set("pin_address", v)}
          />
          {err("lat") ? <p className="mt-1 text-xs text-danger">{err("lat")}</p> : null}
          {err("pin_address") ? <p className="mt-1 text-xs text-danger">{err("pin_address")}</p> : null}
        </div>
      </FormSection>

      {/* 3. Хэмжээс ба үнэ */}
      <FormSection id="staff-size" title="Хэмжээс ба үнэ" icon={Ruler}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <FormField
            label="Талбай (м²)"
            htmlFor={fid("area_m2")}
            stage={stage("area_m2")}
            error={err("area_m2")}
            unconfirmed={auto("area_m2")}
            onConfirm={() => confirm("area_m2")}
            hint="81.47 эсвэл 81,47"
          >
            <NumberInput
              id={fid("area_m2")}
              inputMode="decimal"
              enterKeyHint="next"
              value={form.area_m2}
              disabled={busy}
              aria-invalid={!!err("area_m2") || undefined}
              onValueChange={(v) => set("area_m2", v)}
            />
            {note("area_m2", "талбай")}
          </FormField>
          <FormField
            label="Өрөө"
            htmlFor={fid("rooms")}
            stage={stage("rooms")}
            error={err("rooms")}
            unconfirmed={auto("rooms")}
            onConfirm={() => confirm("rooms")}
          >
            <NumberInput
              id={fid("rooms")}
              inputMode="numeric"
              enterKeyHint="next"
              value={form.rooms}
              disabled={busy}
              aria-invalid={!!err("rooms") || undefined}
              onValueChange={(v) => set("rooms", v)}
            />
            {note("rooms", "өрөө")}
          </FormField>
          <div className="col-span-2 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {stage("floor") ? <StageTag stage={stage("floor")!} /> : null}
              {auto("floor") || auto("building_floors") ? (
                <button
                  type="button"
                  onClick={() => confirm("floor", "building_floors")}
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 sm:min-h-8"
                >
                  шалгана уу · Зөв
                </button>
              ) : null}
            </div>
            <FloorField
              id={fid("floor")}
              label="Давхар / барилгын давхар"
              value={{ floor: form.floor, building_floors: form.building_floors }}
              disabled={busy}
              error={err("floor") ?? err("building_floors")}
              unconfirmed={auto("floor") || auto("building_floors")}
              onChange={(v) => {
                setForm((s) => ({
                  ...s,
                  floor: v.floor,
                  building_floors: v.building_floors,
                  unconfirmed: confirmFields(s.unconfirmed, ["floor", "building_floors"]),
                }));
                setErrors((e) => omitKey(omitKey(e, "floor"), "building_floors"));
              }}
            />
            {note("floor", "давхар")}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {stage("price") ? <StageTag stage={stage("price")!} /> : null}
          </div>
          <PriceField
            id={fid("price")}
            label="Үнэ"
            value={form.price}
            onChange={(v) => set("price", v)}
            currency={form.currency}
            onCurrencyChange={(c) => set("currency", c)}
            basis={form.price_basis}
            onBasisChange={(b) => set("price_basis", b)}
            category={form.category}
            period={form.price_period}
            areaM2={form.area_m2}
            unconfirmed={auto("price") || auto("currency") || auto("price_basis")}
            onConfirm={() => confirm("price", "currency", "price_basis", "price_period")}
            error={err("price")}
            disabled={busy}
          />
          <FormField
            label="Үнийн хугацаа"
            error={err("price_period")}
            warning={warn("price_period")}
            unconfirmed={auto("price_period")}
            onConfirm={() => confirm("price_period")}
            hint={
              mismatch ? (
                <span className="text-amber-700">Энэ ангилалд таарахгүй — идэвхжүүлэхэд саад болно.</span>
              ) : (
                "Зарах = нийт үнэ; түрээс = сарын үнэ."
              )
            }
          >
            <div id={fid("price_period")} tabIndex={-1} className="outline-none">
              <ChoiceChips
                label="Үнийн хугацаа"
                value={form.price_period}
                disabled={busy}
                options={periodOptions.map((p) => ({ value: p, label: PRICE_PERIOD_LABEL[p] }))}
                onChange={(p: Crm2PricePeriod) => {
                  set("price_period", p);
                  setTouched((t) => new Set(t).add("price_period"));
                }}
              />
            </div>
          </FormField>
          {note("price", "үнэ")}
        </div>

        {hasRentTerms(form.category) ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Урьдчилгаа (сар)"
              htmlFor={fid("rent_advance_months")}
              error={err("rent_advance_months")}
              unconfirmed={auto("rent_advance_months")}
              onConfirm={() => confirm("rent_advance_months")}
            >
              <NumberInput
                id={fid("rent_advance_months")}
                inputMode="numeric"
                enterKeyHint="next"
                value={form.rent_advance_months}
                disabled={busy}
                placeholder="жишээ: 1"
                onValueChange={(v) => set("rent_advance_months", v)}
              />
            </FormField>
            <FormField
              label="Барьцаа (сар)"
              htmlFor={fid("rent_deposit_months")}
              error={err("rent_deposit_months")}
              unconfirmed={auto("rent_deposit_months")}
              onConfirm={() => confirm("rent_deposit_months")}
              hint="Барьцаагүй бол 0."
            >
              <NumberInput
                id={fid("rent_deposit_months")}
                inputMode="numeric"
                enterKeyHint="next"
                value={form.rent_deposit_months}
                disabled={busy}
                placeholder="жишээ: 1"
                onValueChange={(v) => set("rent_deposit_months", v)}
              />
            </FormField>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Ашиглалтад орсон он"
            htmlFor={fid("year_in_use")}
            stage={stage("year_in_use")}
            error={err("year_in_use")}
            unconfirmed={auto("year_in_use")}
            onConfirm={() => confirm("year_in_use")}
          >
            <Input
              id={fid("year_in_use")}
              inputMode="numeric"
              enterKeyHint="next"
              maxLength={4}
              value={form.year_in_use}
              disabled={busy}
              placeholder="жишээ: 2018"
              aria-invalid={!!err("year_in_use") || undefined}
              onChange={(e) => set("year_in_use", e.target.value)}
            />
            {note("year_in_use", "он")}
          </FormField>
          <FormField
            label="Зогсоол"
            htmlFor={fid("parking_spaces")}
            error={err("parking_spaces")}
            unconfirmed={auto("parking_spaces")}
            onConfirm={() => confirm("parking_spaces")}
            hint="Тоо; зогсоолгүй бол 0."
          >
            <NumberInput
              id={fid("parking_spaces")}
              inputMode="numeric"
              enterKeyHint="next"
              value={form.parking_spaces}
              disabled={busy}
              onValueChange={(v) => set("parking_spaces", v)}
            />
          </FormField>
          <FormField
            label={operatingCostIsSimple(form) ? "Ашиглалтын зардал (₮/сар)" : "Ашиглалтын зардал"}
            htmlFor={fid("operating_cost")}
            error={err("operating_cost")}
            className="col-span-2"
            hint={operatingCostIsSimple(form) ? "СӨХ, дулаан, цахилгаан г.м. сарын дундаж." : undefined}
          >
            {operatingCostIsSimple(form) ? (
              <div className="flex h-11 items-center rounded-xl border border-line bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <NumberInput
                  id={fid("operating_cost")}
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={form.operating_cost}
                  disabled={busy}
                  aria-invalid={!!err("operating_cost") || undefined}
                  onValueChange={(v) => set("operating_cost", v)}
                  className="h-full border-0 focus:ring-0"
                />
                <span className="shrink-0 pr-3.5 text-sm text-muted">₮/сар</span>
              </div>
            ) : (
              // Хуучин ($ эсвэл өдрийн) утга — хэвээр засна.
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
                <NumberInput
                  className="col-span-2 sm:col-span-1"
                  id={fid("operating_cost")}
                  value={form.operating_cost}
                  disabled={busy}
                  aria-invalid={!!err("operating_cost") || undefined}
                  onValueChange={(v) => set("operating_cost", v)}
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
            )}
            {note("operating_cost", "зардал")}
          </FormField>
          <FormField label="Зардлын тайлбар" htmlFor={fid("operating_cost_note")} error={err("operating_cost_note")} className="col-span-2">
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

      {/* 4. Шинэ хөрөнгөд: зураг (эхний алхамд — тайлбараас өмнө) */}
      {!isEdit ? (
        <FormSection
          id="staff-media-new"
          title="Зураг, бичлэг"
          icon={Images}
          description={
            <>
              Утсан дээр хадгалагдаж, хөрөнгийг хадгалахад дарааллаар хуулагдана.{" "}
              {stage("images") ? <StageTag stage={stage("images")!} /> : null}
            </>
          }
        >
          <MediaQueue value={media} onChange={setMedia} limits={limits} disabled={busy} flow="full" onProcessingChange={setProcessing} />
        </FormSection>
      ) : null}

      {/* 5. Хувийн хэсэг */}
      {canEditPrivate ? (
        <FormSection
          id="staff-private"
          title="Эзэн ба үзүүлэх заавар"
          icon={KeyRound}
          locked
          description="Хөрөнгийн үүрэгт агент, гэрээний хариуцагч, ахлагч, менежер л харна."
        >
          <div id={fid("owner_contact_id")} tabIndex={-1} className="space-y-1.5 outline-none">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
              Эзэн
              {stage("owner") ? <StageTag stage={stage("owner")!} /> : null}
            </span>
            {draft.privateLost && !priv.owner ? <FormAlert tone="warn">{PRIVATE_LOST_TEXT}</FormAlert> : null}
            {quickPhone && !priv.owner ? (
              <FormAlert tone="info">
                Шуурхай бүртгэлд оруулсан эзний дугаар: <span className="font-semibold tabular-nums">{formatPhone(quickPhone)}</span>.
                Доороос хайж сонгох эсвэл шинэ эзэн болгон бүртгэнэ үү.
              </FormAlert>
            ) : null}
            <OwnerPicker
              idPrefix="sf-private"
              value={priv.owner}
              onChange={(o) => {
                markInput();
                setPriv((s) => ({ ...s, owner: o }));
                if (o) setQuickPhone(null);
                setErrors((e) => omitKey(e, "private.owner_contact_id"));
              }}
              disabled={busy}
            />
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
              stage={stage("showing_instructions")}
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

      {/* 6. Тайлбар */}
      <FormSection id="staff-describe" title="Хөрөнгийн тайлбар" icon={ScrollText}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Засвар, тавилга, техникийн байдал" htmlFor={fid("condition")} error={err("condition")}>
            <Textarea
              id={fid("condition")}
              maxLength={4000}
              value={form.condition}
              disabled={busy}
              placeholder="Засвар, тавилга, техникийн байдал"
              onChange={(e) => set("condition", e.target.value)}
            />
          </FormField>
          <FormField label={VIEW_NOTE_LABEL} htmlFor={fid("view_note")} error={err("view_note")}>
            <Textarea
              id={fid("view_note")}
              maxLength={4000}
              value={form.view_note}
              disabled={busy}
              placeholder="Цонхны харагдах байдал, нар тусах тал"
              onChange={(e) => set("view_note", e.target.value)}
            />
          </FormField>
          <FormField
            label="Давуу тал"
            htmlFor={fid("advantages")}
            error={err("advantages")}
            unconfirmed={auto("advantages")}
            onConfirm={() => confirm("advantages")}
          >
            <Textarea
              id={fid("advantages")}
              maxLength={4000}
              value={form.advantages}
              disabled={busy}
              onChange={(e) => set("advantages", e.target.value)}
            />
          </FormField>
          <FormField
            label="Дотоод тэмдэглэл"
            htmlFor={fid("notes")}
            error={err("notes")}
            unconfirmed={auto("notes")}
            onConfirm={() => confirm("notes")}
          >
            <Textarea id={fid("notes")} maxLength={8000} value={form.notes} disabled={busy} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
        </div>
        {featureOptions.length ? (
          <FormField
            label="Онцлог"
            error={err("features")}
            stage={stage("features")}
            unconfirmed={auto("features")}
            onConfirm={() => confirm("features")}
          >
            <div id={fid("features")} tabIndex={-1} className="outline-none">
              <ToggleChips label="Онцлог" values={form.features} options={featureOptions} disabled={busy} onChange={(v) => set("features", v)} />
            </div>
          </FormField>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Хэзээнээс боломжтой"
            htmlFor={fid("available_from")}
            error={err("available_from")}
            unconfirmed={auto("available_from")}
            onConfirm={() => confirm("available_from")}
          >
            <div className="space-y-2">
              <Input
                id={fid("available_from")}
                type="date"
                value={form.available_from}
                disabled={busy}
                onChange={(e) => set("available_from", e.target.value)}
              />
              {form.available_from !== today ? (
                <SuggestionChips
                  label="Огнооны санал"
                  disabled={busy}
                  items={[{ key: "today", label: "Өнөөдөр", value: today }]}
                  onPick={(v) => {
                    markInput();
                    set("available_from", v);
                  }}
                />
              ) : null}
            </div>
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

      {/* 7. Агентын 3 үүрэг */}
      <FormSection
        id="staff-agents"
        title="Агентын үүрэг"
        icon={UsersRound}
        description="Хэлцлийн хариуцагчаас тусдаа."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PROPERTY_AGENT_ROLES.map((role) => {
            const locked = lockedRole(role);
            return (
              <FormField
                key={role}
                label={PROPERTY_AGENT_ROLE_LABEL[role]}
                htmlFor={fid(role)}
                stage={stage(role)}
                error={err(role)}
                unconfirmed={auto(role)}
                onConfirm={() => confirm(role)}
                hint={locked ? "Томилогдсон агентыг багийн ахлагч эсвэл менежер солино." : undefined}
              >
                <div className="space-y-2">
                  <AgentSelect
                    id={fid(role)}
                    label={PROPERTY_AGENT_ROLE_LABEL[role]}
                    value={form[role]}
                    staff={staff}
                    me={me}
                    disabled={busy || locked}
                    currentName={agentName(role)}
                    invalid={!!err(role)}
                    onChange={(v) => {
                      markInput();
                      set(role, v);
                    }}
                  />
                  {!locked && form[role] !== me ? (
                    <SuggestionChips
                      label="Агентын санал"
                      disabled={busy}
                      items={[{ key: "me", label: "Би", value: me }]}
                      onPick={(v) => {
                        markInput();
                        set(role, v);
                      }}
                    />
                  ) : null}
                </div>
              </FormField>
            );
          })}
        </div>
      </FormSection>

      {/* 8. Шинэ хөрөнгөд: зуучлалын гэрээ — хадгалсны дараа картаас (PDF) бүртгэнэ */}
      {!isEdit ? (
        <FormSection id="staff-brokerage-new" title="Зуучлалын гэрээ" icon={FileSignature}>
          <p className="text-sm text-muted">
            Гэрээг (PMC тамгатай PDF) хөрөнгийг хадгалсны дараа бүртгэнэ. «Хадгалаад гэрээ бүртгэх»-ийг дарвал хадгалаад шууд «Гэрээ
            бүртгэх» цонх нээгдэнэ — гэрээгээ скан хийж нэг PDF болгоно. Бүртгэмэгц (батлуулахгүй), хөрөнгийн мэдээлэл бүрэн бол
            хөрөнгө Staff-д идэвхтэй болно.
          </p>
        </FormSection>
      ) : null}

      {/* Хадгалсан ч давхардал илэрсэн */}
      {saved ? (
        <div id="staff-saved" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p role="status">
            <span className="font-semibold">{saved.code} ноорог бүртгэгдлээ.</span> Доорх мэдээллийг шалгаад үргэлжлүүлнэ үү.
          </p>
          <DuplicateNotice
            propertyId={saved.id}
            duplicates={saved.duplicates}
            onArchived={() => router.replace(paths.staff())}
          />
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => router.replace(saved.next)}>
            {saved.thenContract ? "Гэрээ бүртгэх рүү үргэлжлүүлэх" : "Хөрөнгө рүү үргэлжлүүлэх"}
          </Button>
        </div>
      ) : null}

      {/* Хадгалах — гар нээлттэй үед гарын дээр */}
      {!saved ? (
        <div
          style={{ bottom: keyboardInset }}
          className="sticky bottom-0 z-20 -mx-4 space-y-2 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm"
        >
          {serverError ? <FormAlert>{serverError}</FormAlert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn("text-xs text-muted", step && "font-medium text-brand-700")} aria-live="polite">
              {step ??
                (processing
                  ? "Зураг боловсруулж байна…"
                  : isEdit
                    ? "Медиа, гэрээг доорх хэсгүүдэд тус тусад нь хадгална."
                    : (draftStatus ?? "Дутуу бөглөсөн ч хадгална — дараа нь картаас гүйцээнэ."))}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {isEdit ? (
                <Button type="button" size="lg" onClick={() => void onSave()} disabled={busy}>
                  {busy ? "Хадгалж байна…" : "Хадгалах"}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void onCreate(false)}
                    disabled={busy || processing}
                    aria-busy={saving && createAction === "draft"}
                  >
                    {saving && createAction === "draft" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Хадгалж байна…
                      </>
                    ) : (
                      SAVE_DRAFT_LABEL
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => void onCreate(true)}
                    disabled={busy || processing}
                    aria-busy={saving && createAction === "contract"}
                  >
                    {saving && createAction === "contract" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <FileSignature className="size-4" aria-hidden />
                    )}
                    {saving && createAction === "contract" ? "Хадгалж байна…" : "Хадгалаад гэрээ бүртгэх"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

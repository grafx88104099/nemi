"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, CloudOff, FileText, Info, Plus, Ruler, Tag, Trash2 } from "lucide-react";

import { ChoiceChips, FormAlert, FormField, Textarea } from "@/components/crm2/staff/form/fields";
import { pricePeriodOptions, pushRecent, parseRecent, recentDistrictsKey, validationInput } from "@/components/crm2/staff/form/form-model";
import { PriceField } from "@/components/crm2/staff/form/PriceField";
import { isClientKey, trackUi } from "@/components/crm2/staff/form/useCreateDraft";
import { DuplicateNotice } from "@/components/crm2/staff/duplicates/DuplicateNotice";
import { OwnerPendingNotice } from "@/components/crm2/staff/owner/OwnerPendingNotice";
import { OwnerPhoneField, type OwnerFieldChange } from "@/components/crm2/staff/owner/OwnerPhoneField";
import { rememberOwnerInputSource, type OwnerDraft } from "@/components/crm2/staff/owner/owner-model";
import { UndoSnackbar } from "@/components/crm2/ui/undo-snackbar";
import { Button, buttonClasses } from "@/components/ui/button";
import { getProjectHints } from "@/lib/crm2/actions/quick-add";
import {
  discardDraft,
  draftKey as makeDraftKey,
  listDrafts,
  loadDraft,
  makeTitleHint,
  newDraft,
  newId,
  putBlob,
  saveDraft,
  setDraftStatus,
  shouldAutoRestore,
  staffNewScope,
  useDraftAutosave,
  type DiscardHandle,
  type DraftIndexEntry,
  type DraftMedia,
  type DraftSource,
  type LoadedDraft,
} from "@/lib/crm2/device/draft-store";
import { prepareImage, progressLabel } from "@/lib/crm2/device/image-prep";
import {
  listPending,
  resumePendingSubmits,
  submitQuickCreate,
  subscribePending,
  useOnline,
  AUTH_QUEUED_TEXT,
  NETWORK_ERROR_TEXT,
  OWNER_FINAL,
} from "@/lib/crm2/device/network";
import { dismiss as dismissOutbox, listOutbox, type OutboxEntry } from "@/lib/crm2/device/outbox";
import { deleteShared, readShared, type SharedItem, type ShareFile } from "@/lib/crm2/device/share-inbox";
import { bindProperty, dropWaitingFor, enqueue, listQueue, startQueue } from "@/lib/crm2/device/upload-queue";
import { useKeyboardInset, useScrollFocusedIntoView } from "@/lib/crm2/device/viewport";
import { issuesByField, validateFields } from "@/lib/crm2/field-validation";
import { PRICE_PERIOD_LABEL } from "@/lib/crm2/labels";
import { parseListingText, type ListingTextContext } from "@/lib/crm2/listing-text";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import type {
  Crm2OwnerInput,
  Crm2OwnerPending,
  Crm2OwnerStatus,
  Crm2PricePeriod,
  Crm2PropertyCategory,
  Crm2PropertyDuplicate,
  Crm2QuickCreateResult,
  Crm2StaffMember,
} from "@/lib/crm2/types";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DraftList } from "./DraftList";
import { KindFields } from "./KindFields";
import { ListingAgentRow } from "./ListingAgentRow";
import { PastePanel, type PasteResult } from "./PastePanel";
import { PlaceFields, useStoredValue } from "./PlaceFields";
import { QuickPhotos, type QuickMediaValue } from "./QuickPhotos";
import { SizeFields } from "./SizeFields";
import {
  afterSave,
  applyProjectHints,
  applySourceText,
  canSave,
  confirmKeys,
  emptyQuickState,
  isAuto,
  markTyped,
  mergeParsed,
  otherDrafts,
  ownerIsFinal,
  parseRecentProjects,
  PRICE_GROUP_KEYS,
  priceNeedsCheck,
  priceSummary,
  pushRecentProject,
  quickFieldsFilled,
  quickPayload,
  recentProjectsKey,
  restoreQuick,
  setCategory,
  setTyped,
  titleParts,
  toDraftForm,
  toDraftPrivate,
  type QuickDraftRecordForm,
  type QuickPrivate,
  type QuickState,
} from "./quick-model";
import { SAVE_BAR_HEIGHT, StickySaveBar } from "./StickySaveBar";

// ── Тохиргоо ───────────────────────────────────────────────────────────────

/** Серверээс дамжуулах тохиргооны дэд хэсэг (сериалчлагдана). */
export type QuickSettings = {
  districts: string[];
  types: Record<string, string>;
  categoryLabels: Partial<Record<string, string>>;
  categoryHints: Partial<Record<Crm2PropertyCategory, string>>;
  featureKeys: string[];
  /** contact.sources (код → нэр). */
  sources: Record<string, string>;
  limits: Crm2FileLimits;
};

export type QuickAddProps = {
  panel: Crm2Panel;
  officeId: string;
  me: string;
  /** AgentPicker-ийн «Миний баг» (team_id). */
  teamIds: string[];
  staff: Crm2StaffMember[];
  settings: QuickSettings;
  aiAvailable: boolean;
  /** ?share=<id> | 'nosw' | 'error'. */
  share: string | null;
  /** ?draft=<clientKey>. */
  draft: string | null;
};

// ── «Бүрэн форм» руу шилжихийн өмнө ноорогийг шууд бичих ─────────────────

type ActiveEditor = {
  flush: () => Promise<void>;
  cancel: () => void;
  /** Зураг боловсруулж/хадгалж дуустал хүлээнэ. */
  idle: () => Promise<void>;
  key: string;
};
let activeEditor: ActiveEditor | null = null;

/** Толгойн «Бүрэн форм» — ижил ноорогоор (?full=1&draft=…). Зураг хадгалагдаж, ноорог бичигдсэний дараа шилжинэ. */
export function FullFormLink({ panel }: { panel: Crm2Panel }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [waiting, setWaiting] = React.useState(false);
  const draft = sp.get("draft");
  const href = crm2Paths(panel).staffNew({ full: 1, draft: isClientKey(draft) ? draft : null });
  return (
    <Link
      href={href}
      aria-busy={waiting || undefined}
      className={buttonClasses("outline", "touch", "shrink-0")}
      onClick={(e) => {
        const ed = activeEditor;
        if (!ed || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        if (waiting) return;
        setWaiting(true);
        void ed
          .idle()
          // Сүүлийн зураг маягтын төлөвт орж рендерлэгдэхийг хүлээгээд ноорогийг бичнэ.
          .then(() => new Promise((r) => setTimeout(r, 50)))
          .then(() => ed.flush())
          .catch(() => undefined)
          .finally(() => {
            setWaiting(false);
            router.push(href);
          });
      }}
    >
      <FileText className="size-4" aria-hidden />
      {waiting ? "Зураг хадгалж байна…" : "Бүрэн форм"}
    </Link>
  );
}

// ── Нооргийн удирдлага ─────────────────────────────────────────────────────

type Intake = {
  text: string | null;
  phones: string[];
  filled: number;
  kind: "share" | "offline";
  /** Хуваалцсан бичлэг (уншиж чадаагүй зураг байвал устгалгүй үлдээнэ — «Дахин оролдох»). */
  shareId: string;
  /** sharedImages() жагсаалтын уншиж/хадгалж чадаагүй зургийн индексүүд. */
  failed: number[];
  /** Дээд хязгаараас хэтэрч ороогүй зураг. */
  overLimit: number;
  /** Зураг биш (бичлэг г.м.) тул ороогүй файл. */
  nonImage: number;
};

/** Хуваалцсан бичлэгийн зургууд (тогтмол дараалал — дахин оролдоход ижил индекс). */
function sharedImages(files: ShareFile[]): ShareFile[] {
  return files.filter((f) => f.type.startsWith("image/"));
}

/** Хуваалцсан нэг зургийг боловсруулж blob болгоно (алдаа гарвал шиднэ). */
async function sharedToMedia(me: string, f: ShareFile, i: number): Promise<DraftMedia> {
  const file = f.blob instanceof File ? f.blob : new File([f.blob], f.name || `share-${i + 1}.jpg`, { type: f.type });
  const prepared = await prepareImage(file);
  const blobKey = await putBlob(me, prepared.file, prepared.file.name);
  return { id: newId(), blobKey, name: prepared.file.name, kind: "image", bytes: prepared.bytes, w: prepared.w, h: prepared.h };
}

const SHARE_FAILED_TEXT = "Хуваалцсан зарыг хүлээж авч чадсангүй. Зарын текстийг хуулж «Зарын текст наах» хэсэгт наана уу.";

type Undo = { key: string; handle: DiscardHandle; wasCurrent: boolean };

function replaceDraftUrl(panel: Crm2Panel, key: string) {
  window.history.replaceState(null, "", crm2Paths(panel).staffNew({ draft: key }));
}

/**
 * Шуурхай бүртгэлийн дэлгэц (клиент): ноорог (?draft) сонгох/үүсгэх, хуваалцсан зар ба сүлжээгүй үеийн
 * бичлэгийг шинэ ноорог болгох, «Дуусаагүй ноорог» жагсаалт, 8 секундийн буцаалттай устгал.
 */
export function QuickAddForm(props: QuickAddProps) {
  const { panel, me, settings, share, draft } = props;
  const [clientKey, setClientKey] = React.useState<string | null>(null);
  const [intake, setIntake] = React.useState<Intake | null>(null);
  const [banner, setBanner] = React.useState<string | null>(() =>
    share === "nosw" || share === "error" ? SHARE_FAILED_TEXT : null
  );
  const [shareProgress, setShareProgress] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<DraftIndexEntry[]>([]);
  const [undo, setUndo] = React.useState<Undo | null>(null);
  const [shareOffer, setShareOffer] = React.useState<SharedItem | null>(null);
  const booted = React.useRef(false);

  const refreshDrafts = React.useCallback(() => {
    listDrafts(me)
      .then(setDrafts)
      .catch(() => setDrafts([]));
  }, [me]);

  const switchTo = React.useCallback(
    (key: string) => {
      replaceDraftUrl(panel, key);
      setIntake(null);
      setClientKey(key);
    },
    [panel]
  );

  const ingestShared = React.useCallback(
    async (item: SharedItem) => {
      const key = newDraft();
      const parseCtx: ListingTextContext = {
        districts: settings.districts,
        projects: parseRecentProjects(safeGet(recentProjectsKey(me))).map((p) => ({ id: p.id, name: p.name })),
        featureKeys: settings.featureKeys,
      };
      let state = emptyQuickState(me, panel);
      let phones: string[] = [];
      let filled = 0;
      if (item.text?.trim()) {
        const parsed = parseListingText(item.text, parseCtx);
        const merged = mergeParsed(state, parsed.fields, { me, panel, typeKeys: Object.keys(settings.types), projects: parseCtx.projects });
        state = applySourceText(merged.state, parsed.restMasked);
        phones = parsed.phones;
        filled = merged.filled.length;
      }
      if (item.kind === "offline") state = { ...state, meta: { ...state.meta, offline: true } };
      // Зураг: утсан дээр нэг нэгээр боловсруулж blob болгоно. Чадаагүйг тоолж, дахин оролдуулна.
      const allImages = sharedImages(item.files);
      const images = allImages.slice(0, settings.limits.maxImages);
      const media: DraftMedia[] = [];
      const failed: number[] = [];
      for (let i = 0; i < images.length; i++) {
        setShareProgress(progressLabel(i, images.length));
        try {
          media.push(await sharedToMedia(me, images[i], i));
        } catch {
          failed.push(i);
        }
      }
      setShareProgress(null);
      const source: DraftSource = item.kind === "share" ? "share" : "manual";
      try {
        // Ноорог бичигдсэний ДАРАА л хуваалцсан бичлэгийг устгана.
        await saveDraft<QuickDraftRecordForm>(
          me,
          staffNewScope(key),
          {
            form: toDraftForm(state),
            media,
            coverId: media[0]?.id ?? null,
            source,
            sharedId: item.id,
            titleHint: makeTitleHint(titleParts(state.form)),
          },
          { hasPrivate: false }
        );
        // Уншиж чадаагүй зураг байвал эх файлыг үлдээнэ («Дахин оролдох»; хугацаа дуусахад өөрөө устна).
        if (!failed.length) await deleteShared(item.id).catch(() => undefined);
      } catch {
        setBanner("Утсан дээр хадгалж чадсангүй — хуваалцсан зарыг дахин нээнэ үү.");
      }
      trackUi({
        event: item.kind === "share" ? "share_received" : "offline_capture_received",
        flow: "share",
        meta: { photos: media.length, text: !!item.text, filled, failed: failed.length, over_limit: allImages.length - images.length },
      });
      replaceDraftUrl(panel, key);
      setIntake({
        text: item.text,
        phones,
        filled,
        kind: item.kind,
        shareId: item.id,
        failed,
        overLimit: allImages.length - images.length,
        nonImage: item.files.length - allImages.length,
      });
      setClientKey(key);
    },
    [me, panel, settings]
  );

  // Эхлэл: хуваалцсан зар → шинэ ноорог; ?draft → тэр ноорог; эс бөгөөс шинэ.
  React.useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const shareId = share?.trim() || null;
    const fallback = () => {
      const key = isClientKey(draft) ? draft.toLowerCase() : newDraft();
      replaceDraftUrl(panel, key);
      setClientKey(key);
    };
    if (!shareId) {
      fallback();
      return;
    }
    if (shareId === "nosw" || shareId === "error") {
      fallback();
      return;
    }
    void (async () => {
      const item = await readShared(shareId, me).catch(() => null);
      if (!item) {
        setBanner("Хуваалцсан зар олдсонгүй эсвэл хугацаа нь дууссан. Текстийг «Зарын текст наах» хэсэгт наана уу.");
        fallback();
        return;
      }
      // Хуваалцсаныг (гаднаас ирж болох) задлах, ноорог бичихээс ӨМНӨ агент шалгаж зөвшөөрнө.
      if (item.kind === "share") {
        setShareOffer(item);
        return;
      }
      await ingestShared(item);
    })();
  }, [share, draft, me, panel, ingestShared]);

  async function acceptShare() {
    const item = shareOffer;
    if (!item) return;
    setShareOffer(null);
    await ingestShared(item);
  }

  async function rejectShare() {
    const item = shareOffer;
    setShareOffer(null);
    if (item) await deleteShared(item.id).catch(() => undefined);
    const key = isClientKey(draft) ? draft.toLowerCase() : newDraft();
    replaceDraftUrl(panel, key);
    setClientKey(key);
  }

  // Ижил хуудсан дээрээс «+ Хөрөнгө» (параметргүй /crm/staff/new) дарвал — шинэ ноорог эхлүүлнэ.
  // Next ижил сегментийг дахин mount хийдэггүй тул URL-ийн өөрчлөлтийг энд барина.
  const sp = useSearchParams();
  const spDraft = sp.get("draft");
  const spShare = sp.get("share");
  React.useEffect(() => {
    if (!booted.current || !clientKey) return;
    // Бодит URL-ийг шалгана (replaceDraftUrl-ийн дараах түр зөрүүнд шинэ ноорог үүсгэхгүй).
    const live = new URLSearchParams(window.location.search);
    if (spDraft || spShare || live.get("draft") || live.get("share")) return;
    void (activeEditor?.flush() ?? Promise.resolve())
      .catch(() => undefined)
      .finally(() => {
        trackUi({ event: "draft_new_started", flow: "quick" });
        switchTo(newDraft());
      });
  }, [spDraft, spShare, clientKey, switchTo]);

  React.useEffect(() => {
    if (clientKey) refreshDrafts();
  }, [clientKey, refreshDrafts]);

  async function discard(key: string) {
    const wasCurrent = key === clientKey;
    if (wasCurrent) activeEditor?.cancel();
    try {
      const handle = await discardDraft(makeDraftKey(me, staffNewScope(key)), { undoMs: 8000 });
      setUndo({ key, handle, wasCurrent });
      trackUi({ event: "draft_discarded", flow: "quick" });
    } catch {
      /* IDB алга */
    }
    if (wasCurrent) switchTo(newDraft());
    refreshDrafts();
  }

  async function onUndo() {
    const u = undo;
    setUndo(null);
    if (!u) return;
    const ok = await u.handle.undo().catch(() => false);
    if (!ok) return;
    trackUi({ event: "draft_discard_undone", flow: "quick" });
    if (u.wasCurrent) switchTo(u.key);
    refreshDrafts();
  }

  const others = otherDrafts(drafts, clientKey);

  return (
    <div className="space-y-3">
      {banner ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{banner}</p>
        </div>
      ) : null}
      <DraftList
        drafts={others}
        onContinue={(k) => {
          void activeEditor?.flush().catch(() => undefined);
          trackUi({ event: "draft_restored", flow: "quick" });
          switchTo(k);
        }}
        onDiscard={(k) => void discard(k)}
      />
      {clientKey ? (
        <QuickDraftEditor
          key={clientKey}
          {...props}
          clientKey={clientKey}
          intake={intake}
          onStartNew={() => {
            trackUi({ event: "draft_new_started", flow: "quick" });
            switchTo(newDraft());
          }}
          onDiscardCurrent={() => void discard(clientKey)}
          onDraftsChanged={refreshDrafts}
        />
      ) : shareOffer ? (
        <ShareOfferCard item={shareOffer} onAccept={() => void acceptShare()} onReject={() => void rejectShare()} />
      ) : (
        <p role="status" className="py-10 text-center text-sm text-muted">
          {shareProgress ? `Хуваалцсан зургийг ${shareProgress}` : "Маягтыг бэлдэж байна…"}
        </p>
      )}
      <UndoSnackbar open={!!undo} message="Ноорог устгагдлаа" onUndo={() => void onUndo()} onExpire={() => setUndo(null)} />
    </div>
  );
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* хувийн горим — алгасна */
  }
}

// ── Нэг ноорогийн маягт ────────────────────────────────────────────────────

type OwnerState = { draft: OwnerDraft | null; input: Crm2OwnerInput | null; empty: boolean };

type Phase = "loading" | "offer" | "ready" | "queued" | "saved";

type SavedView = {
  propertyId: string;
  code: string;
  ownerPending: Crm2OwnerPending | null;
  duplicates: Crm2PropertyDuplicate[];
  sheet: "owner" | "next";
};

const OWNER_FIELD_KEYS = new Set(["owner", "owner.phone", "owner.source", "owner.source_note", "owner.full_name", "owner.contact_id"]);

/** Серверийн алдааны талбар → маягтын талбарын түлхүүр. */
function errorKeyOf(f: string): string {
  if (OWNER_FIELD_KEYS.has(f) || f.startsWith("owner.")) return "owner";
  if (f === "building_floors") return "floor";
  if (f === "project" || f === "project_id") return "project_name";
  return f;
}

/** Ард илгээгдсэн бүртгэлийн хөрөнгө (зургийн дарааллаас — bindProperty-ийн дараа). */
async function propertyOfQueued(me: string, clientKey: string): Promise<string | null> {
  const items = await listQueue(me).catch(() => []);
  for (const i of items) {
    if (i.target.kind === "media" && i.target.clientKey === clientKey && i.target.propertyId) return i.target.propertyId;
  }
  return null;
}

function QuickDraftEditor({
  panel,
  officeId,
  me,
  teamIds,
  staff,
  settings,
  aiAvailable,
  clientKey,
  intake,
  onStartNew,
  onDiscardCurrent,
  onDraftsChanged,
}: QuickAddProps & {
  clientKey: string;
  intake: Intake | null;
  onStartNew: () => void;
  onDiscardCurrent: () => void;
  onDraftsChanged: () => void;
}) {
  const router = useRouter();
  const paths = React.useMemo(() => crm2Paths(panel), [panel]);
  const online = useOnline();
  const scope = staffNewScope(clientKey);
  const key = makeDraftKey(me, scope);

  const [phase, setPhase] = React.useState<Phase>("loading");
  const [state, setState] = React.useState<QuickState>(() => emptyQuickState(me, panel));
  const [media, setMedia] = React.useState<QuickMediaValue>({ media: [], coverId: null });
  const [source, setSource] = React.useState<DraftSource>("manual");
  const [sharedId, setSharedId] = React.useState<string | null>(null);
  const [privateRest, setPrivateRest] = React.useState<QuickPrivate>({});
  const [owner, setOwner] = React.useState<OwnerState>({ draft: null, input: null, empty: true });
  const [ownerInitial, setOwnerInitial] = React.useState<Partial<OwnerDraft> | null>(null);
  const [ownerMount, setOwnerMount] = React.useState(0);
  const [privateLost, setPrivateLost] = React.useState(false);
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  const [offerAt, setOfferAt] = React.useState<number | null>(null);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [queuedText, setQueuedText] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<SavedView | null>(null);
  const [projectDistrict, setProjectDistrict] = React.useState<string | null>(null);
  const [storeVersion, setStoreVersion] = React.useState(0);
  const [shareFailed, setShareFailed] = React.useState<number[]>(() => intake?.failed ?? []);
  const [shareGone, setShareGone] = React.useState(false);
  const [shareRetrying, setShareRetrying] = React.useState(false);
  const loadedRef =React.useRef<LoadedDraft<QuickDraftRecordForm, QuickPrivate> | null>(null);

  // ── Хэмжилт ──
  const openedAt = React.useRef(0);
  const firstInputAt = React.useRef<number | null>(null);
  const taps = React.useRef(0);
  const photosPicked = React.useRef(0);
  const flow = source === "share" || intake ? "share" : "quick";
  const markInput = React.useCallback(() => {
    if (firstInputAt.current !== null) return;
    firstInputAt.current = Date.now();
    trackUi({ event: "quick_first_input", flow, first_input_ms: Math.max(0, firstInputAt.current - openedAt.current) });
  }, [flow]);

  // ── Ачаалах (12 цагаас бага бол шууд сэргээнэ, эс бөгөөс асууна) ──
  const apply = React.useCallback(
    (d: LoadedDraft<QuickDraftRecordForm, QuickPrivate>) => {
      const r = restoreQuick(d.form, d.private, me);
      setState(r.state);
      setPrivateRest(r.privateRest);
      if (r.owner) {
        setOwnerInitial(r.owner);
        setOwner({ draft: r.owner, input: null, empty: !r.owner.phone && !r.owner.chosenContactId });
        setOwnerMount((n) => n + 1);
      }
      setMedia({ media: d.media, coverId: d.coverId });
      setSource(d.source);
      setSharedId(d.sharedId);
      setPrivateLost(d.privateLost);
      setRestoredAt(d.record.savedAt);
    },
    [me]
  );

  React.useEffect(() => {
    let alive = true;
    openedAt.current = Date.now();
    Promise.all([loadDraft<QuickDraftRecordForm, QuickPrivate>(me, scope), listDrafts(me).catch(() => [] as DraftIndexEntry[])])
      .then(([d, index]) => {
        if (!alive) return;
        const entry = index.find((e) => e.clientKey === clientKey);
        trackUi({ event: "quick_open", flow: intake ? "share" : "quick", meta: { restored: !!d, offline: !navigator.onLine } });
        if (!d) {
          setPhase("ready");
          return;
        }
        if (entry?.status === "queued") {
          apply(d);
          setQueuedText(NETWORK_ERROR_TEXT);
          setPhase("queued");
          return;
        }
        if (intake || shouldAutoRestore(d.record.savedAt)) {
          apply(d);
          setPhase("ready");
          if (!intake) trackUi({ event: "draft_restored_auto", flow: "quick", meta: { photos: d.media.length, private_lost: d.privateLost } });
        } else {
          loadedRef.current = d;
          setOfferAt(d.record.savedAt);
          setPhase("offer");
          trackUi({ event: "draft_restore_offer", flow: "quick" });
        }
      })
      .catch(() => {
        if (alive) setPhase("ready");
      });
    return () => {
      alive = false;
    };
    // зөвхөн ноорог солигдоход (key-ээр шинэ бүрэлдэхүүн)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Автомат хадгалалт ──
  const autosave = useDraftAutosave<QuickDraftRecordForm, QuickPrivate>(
    {
      form: toDraftForm(state),
      private: toDraftPrivate(state, owner.draft, privateRest),
      media: media.media,
      coverId: media.coverId,
      source,
      sharedId,
      titleHint: makeTitleHint(titleParts(state.form)),
      status: phase === "queued" ? "queued" : "editing",
    },
    { profileId: me, scope, enabled: phase === "ready" || phase === "queued", onSaved: () => onDraftsChanged() }
  );
  const { flush, cancel } = autosave;

  // Зураг боловсруулалт дуусахыг хүлээх (FullFormLink).
  const processingRef = React.useRef(false);
  const idleWaiters = React.useRef<Array<() => void>>([]);
  const onProcessingChange = React.useCallback((p: boolean) => {
    processingRef.current = p;
    setProcessing(p);
    if (!p) {
      const waiters = idleWaiters.current;
      idleWaiters.current = [];
      waiters.forEach((w) => w());
    }
  }, []);
  const idle = React.useCallback(
    () => (processingRef.current ? new Promise<void>((r) => idleWaiters.current.push(r)) : Promise.resolve()),
    []
  );

  React.useEffect(() => {
    const ed: ActiveEditor = { flush, cancel, idle, key: clientKey };
    activeEditor = ed;
    return () => {
      if (activeEditor === ed) activeEditor = null;
    };
  }, [flush, cancel, idle, clientKey]);

  // ── Гар ба гүйлгэлт ──
  const formRef = React.useRef<HTMLDivElement>(null);
  const inset = useKeyboardInset();
  useScrollFocusedIntoView(formRef, SAVE_BAR_HEIGHT);

  // ── Сүүлийн дүүрэг, төсөл (localStorage) ──
  const recentDistricts = parseRecent(useStoredValue(recentDistrictsKey(me), storeVersion), settings.districts);
  const recentProjects = parseRecentProjects(useStoredValue(recentProjectsKey(me), storeVersion));

  const locked = phase !== "ready" || saving;
  const auto = (formKey: string) => isAuto(state.form, formKey);
  const update = (fn: (s: QuickState) => QuickState) => {
    markInput();
    setState(fn);
  };
  const set = <K extends keyof QuickState["form"]>(k: K, v: QuickState["form"][K]) => {
    update((s) => setTyped(s, k, v));
    if (errors[k as string]) setErrors((e) => omit(e, k as string));
  };
  const confirm = (...formKeys: string[]) => setState((s) => confirmKeys(s, formKeys));

  // Blur-ийн шалгалт (хадгалахыг саатуулахгүй сануулга, алдаа).
  const issues = validateFields(validationInput(state.form)).filter((i) => touched.has(i.field));
  const blurErrors = issuesByField(issues, "error");
  const blurWarnings = issuesByField(issues, "warning");
  const err = (k: string) => errors[k] ?? blurErrors[k] ?? null;
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));

  // ── Төсөл сонгох: хоосон дүүрэг, барилгын давхарт санал ──
  function pickProject(p: { id: string; name: string }) {
    markInput();
    setState((s) => {
      const next = setTyped(s, "project_name", p.name);
      return { ...next, form: { ...next.form, project_id: p.id } };
    });
    const cached = recentProjects.find((r) => r.id === p.id) ?? null;
    const remember = (district: string | null) => {
      safeSet(recentProjectsKey(me), JSON.stringify(pushRecentProject(parseRecentProjects(safeGet(recentProjectsKey(me))), { ...p, district })));
      setStoreVersion((v) => v + 1);
    };
    const applyHints = (district: string | null, buildingFloors: number | null) => {
      setProjectDistrict(district);
      setState((s) => applyProjectHints(s, { district, building_floors: buildingFloors }, settings.districts));
    };
    if (!online) {
      applyHints(cached?.district ?? null, null);
      remember(cached?.district ?? null);
      return;
    }
    getProjectHints(p.id)
      .then((res) => {
        const h = res.ok ? res.data : null;
        const district = h?.district ?? cached?.district ?? null;
        applyHints(district, h?.building_floors ?? null);
        remember(district);
      })
      .catch(() => {
        applyHints(cached?.district ?? null, null);
        remember(cached?.district ?? null);
      });
  }

  // ── Наалт ── (зөвхөн хоосон талбарыг бөглөнө)
  function onParsed(r: PasteResult): number {
    markInput();
    const merged = mergeParsed(state, r.fields, {
      me,
      panel,
      typeKeys: Object.keys(settings.types),
      projects: recentProjects.map((p) => ({ id: p.id, name: p.name })),
    });
    setState(applySourceText(merged.state, r.restMasked));
    if (source === "manual") setSource("paste");
    trackUi({ event: r.method === "ai" ? "ai_parsed" : "paste_parsed", flow, meta: { filled: merged.filled.length, price: merged.price } });
    return merged.filled.length;
  }

  function ownerFromPaste(phone: string) {
    const d: OwnerDraft = { phone, name: "", source: null, sourceGuessed: false, sourceNote: "", chosenContactId: null, allowDuplicate: false };
    setOwnerInitial(d);
    setOwner({ draft: d, input: null, empty: false });
    setOwnerMount((n) => n + 1);
    trackUi({ event: "owner_pasted", flow, meta: { from_listing: true } });
  }

  function onOwnerChange(c: OwnerFieldChange) {
    setOwner({ draft: c.draft, input: c.input, empty: c.validation.empty });
    if (!c.validation.empty) markInput();
    if (errors.owner) setErrors((e) => omit(e, "owner"));
  }

  // ── Хуваалцсан, уншиж чадаагүй зургийг дахин оролдох ──
  async function retrySharedPhotos() {
    if (!intake || !shareFailed.length || shareRetrying) return;
    setShareRetrying(true);
    onProcessingChange(true);
    try {
      const item = await readShared(intake.shareId, me).catch(() => null);
      if (!item) {
        setShareGone(true);
        return;
      }
      const images = sharedImages(item.files).slice(0, settings.limits.maxImages);
      const added: DraftMedia[] = [];
      const still: number[] = [];
      for (const i of shareFailed) {
        const f = images[i];
        if (!f) continue;
        try {
          added.push(await sharedToMedia(me, f, i));
        } catch {
          still.push(i);
        }
      }
      if (added.length) {
        markInput();
        setMedia((cur) => {
          const room = Math.max(0, settings.limits.maxImages - cur.media.filter((m) => m.kind === "image").length);
          const take = added.slice(0, room);
          return take.length ? { media: [...cur.media, ...take], coverId: cur.coverId ?? take[0].id } : cur;
        });
      }
      setShareFailed(still);
      if (!still.length) await deleteShared(intake.shareId).catch(() => undefined);
    } finally {
      setShareRetrying(false);
      onProcessingChange(false);
    }
  }

  // ── Хадгалах ──
  async function enqueueMedia(propertyId: string | null) {
    // Өмнө буцаагдсан илгээлтийн хүлээж буй мөрийг хасна — зураг давхар хуулагдахгүй.
    await dropWaitingFor(clientKey).catch(() => 0);
    for (let i = 0; i < media.media.length; i++) {
      const m = media.media[i];
      await enqueue({
        profileId: me,
        blobKey: m.blobKey,
        name: m.name,
        target: {
          kind: "media",
          propertyId,
          clientKey,
          officeId,
          limits: settings.limits,
          sortOrder: i,
          isCover: m.id === (media.coverId ?? media.media[0]?.id),
        },
      });
    }
  }

  function rememberRecents() {
    if (state.form.district) {
      safeSet(recentDistrictsKey(me), JSON.stringify(pushRecent(parseRecent(safeGet(recentDistrictsKey(me)), settings.districts), state.form.district)));
    }
    if (state.form.project_id && state.form.project_name) {
      safeSet(
        recentProjectsKey(me),
        JSON.stringify(
          pushRecentProject(parseRecentProjects(safeGet(recentProjectsKey(me))), {
            id: state.form.project_id,
            name: state.form.project_name,
            district: state.form.district || null,
          })
        )
      );
    }
    rememberOwnerInputSource(me, owner.input);
  }

  async function onSave() {
    if (saving || phase !== "ready") return;
    if (!canSave(state.form)) {
      setErrors((e) => ({ ...e, category: "Ангиллаа сонгоно уу" }));
      focusField("category");
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await flush().catch(() => undefined);
      const ownerInput = owner.input ?? null;
      const { payload, ownerSkipped } = quickPayload(state, { clientKey, source, owner: ownerInput, privateRest });
      const outcome = await submitQuickCreate<Crm2QuickCreateResult>(payload as Record<string, unknown>, {
        clientKey,
        profileId: me,
        draftKey: key,
      });
      const durationMs = Date.now() - openedAt.current;
      const firstMs = firstInputAt.current ? Date.now() - firstInputAt.current : undefined;

      if (outcome.status === "invalid") {
        setServerError(outcome.error);
        const f = outcome.field;
        if (f) {
          const k = errorKeyOf(f);
          setErrors((e) => ({ ...e, [k]: outcome.error }));
          focusField(k);
        }
        return;
      }

      if (outcome.status === "queued" || outcome.status === "auth") {
        if (!outcome.saved) {
          setServerError("Сүлжээ алга, утсан дээр хадгалж чадсангүй. Сүлжээ орохоор дахин дарна уу.");
          return;
        }
        // Зургийг хөрөнгө үүстэл хүлээх дараалалд (waiting_property) шилжүүлнэ.
        await enqueueMedia(null).catch(() => undefined);
        startQueue(me).catch(() => undefined);
        await setDraftStatus(me, clientKey, "queued").catch(() => undefined);
        setQueuedText(outcome.status === "auth" ? AUTH_QUEUED_TEXT : NETWORK_ERROR_TEXT);
        setPhase("queued");
        rememberRecents();
        setStoreVersion((v) => v + 1);
        trackUi({
          event: "quick_offline_queued",
          flow,
          duration_ms: durationMs,
          taps: Math.min(taps.current, 10_000),
          meta: { auth: outcome.status === "auth", photos: media.media.length },
        });
        return;
      }

      // Амжилттай: зураг дараалалд (эзэмшил шилжинэ), дараа нь ноорогоо хаана.
      const r = outcome.result;
      await enqueueMedia(r.property_id).catch(() => undefined);
      await bindProperty(clientKey, r.property_id).catch(() => 0);
      startQueue(me).catch(() => undefined);
      const status = (r.owner?.status ?? null) as Crm2OwnerStatus | null;
      const final = ownerIsFinal(status, ownerSkipped);
      cancel();
      await discardDraft(key, { undoMs: 0, keepPrivate: !final }).catch(() => undefined);
      rememberRecents();
      trackUi({
        event: "quick_save",
        flow,
        property_id: r.property_id,
        duration_ms: durationMs,
        first_input_ms: firstMs,
        taps: Math.min(taps.current, 10_000),
        fields_filled: quickFieldsFilled(state, !owner.empty, media.media.length),
        meta: {
          photos: media.media.length,
          photos_picked: photosPicked.current,
          pasted: state.meta.pasted,
          share: source === "share",
          offline_capture: state.meta.offline,
          owner_final: final,
          duplicates: r.duplicates.length,
          replayed: r.replayed,
        },
      });
      const next = afterSave({ ownerFinal: final, duplicates: r.duplicates.length });
      if (next.kind === "redirect") {
        router.replace(paths.property(r.property_id, undefined, { sheet: "next" }));
        return;
      }
      const d = owner.draft;
      setSaved({
        propertyId: r.property_id,
        code: r.code,
        sheet: next.sheet,
        duplicates: r.duplicates,
        ownerPending: next.ownerPending
          ? {
              phone: d?.phone || null,
              name: d?.name || null,
              source: d?.source ?? null,
              source_note: d?.sourceNote || null,
              status: ownerSkipped ? "invalid_phone" : (status ?? "pending_review"),
              at: new Date().toISOString(),
            }
          : null,
      });
      setPhase("saved");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSaving(true);
    try {
      await resumePendingSubmits(me);
      await reconcileQueued();
    } finally {
      setSaving(false);
    }
  }

  /**
   * Хүлээлгэд байсан бүртгэл ард илгээгдсэн/буцаагдсаныг тусгана: илгээгдсэн бол хадгалсан самбар
   * (картын холбоостой), буцаагдсан/алдагдсан бол маягтыг нээж алдааг талбар дээр нь харуулна.
   */
  async function reconcileQueued() {
    const pending = await listPending(me).catch(() => null);
    if (!pending || pending.some((p) => p.clientKey === clientKey)) return;
    const [left, outbox] = await Promise.all([
      listDrafts(me).catch(() => [] as DraftIndexEntry[]),
      listOutbox(me).catch(() => [] as OutboxEntry[]),
    ]);
    onDraftsChanged();
    const entry = left.find((e) => e.clientKey === clientKey);
    const ob = outbox.find((o) => o.clientKey === clientKey) ?? null;
    if (entry) {
      if (entry.status !== "editing") return;
      // Буцаагдсан (эсвэл хугацаа дууссан) — засаад дахин хадгална.
      setQueuedText(null);
      setPhase("ready");
      const msg = ob?.error ?? "Бүртгэл илгээгдсэнгүй — шалгаад дахин хадгална уу.";
      setServerError(msg);
      const k = ob?.field ? errorKeyOf(ob.field) : null;
      if (k) {
        setErrors((e) => ({ ...e, [k]: msg }));
        focusField(k);
      }
      // Энэ маягт дээр харуулсан тул «анхаарах» жагсаалтаас хасна.
      if (ob?.error) void dismissOutbox(ob.clientKey).catch(() => undefined);
      return;
    }
    // Ноорог хаагдсан = илгээгдсэн.
    const propertyId = ob?.propertyId ?? (await propertyOfQueued(me, clientKey));
    setQueuedText(null);
    const ownerOpen = !!ob?.ownerStatus && !(OWNER_FINAL as readonly string[]).includes(ob.ownerStatus);
    setSaved(propertyId ? { propertyId, code: ob?.code ?? "", ownerPending: null, duplicates: [], sheet: ownerOpen ? "owner" : "next" } : null);
    setPhase("saved");
  }
  const onPendingChange = React.useEffectEvent(() => void reconcileQueued());

  // Хүлээлгийн жагсаалт өөрчлөгдөхөд (ард илгээлт) тусгана.
  React.useEffect(() => {
    if (phase !== "queued") return;
    const off = subscribePending(() => onPendingChange());
    // Нээх үед аль хэдийн илгээгдсэн/буцаагдсан байж болно.
    onPendingChange();
    return off;
  }, [phase]);

  // ── Харагдац ──
  if (phase === "loading") {
    return (
      <p role="status" className="py-10 text-center text-sm text-muted">
        Ноорог ачаалж байна…
      </p>
    );
  }

  if (phase === "offer") {
    return (
      <div role="group" aria-label="Хуучин ноорог" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-950">
          Энэ ноорог {offerAt ? fmtTime(offerAt) : ""}-д хадгалагдсан (12 цагаас өмнө). Үргэлжлүүлэх үү?
        </p>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <Button
            type="button"
            size="lg"
            onClick={() => {
              if (loadedRef.current) apply(loadedRef.current);
              setPhase("ready");
              trackUi({ event: "draft_restored", flow: "quick" });
            }}
          >
            Үргэлжлүүлэх
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onStartNew}>
            Шинээр эхлэх
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "saved") {
    return <SavedPanel saved={saved} paths={paths} onNew={onStartNew} />;
  }

  const priceRow = priceNeedsCheck(state.form) && state.form.price ? priceSummary(state.form) : "";
  const periodOptions = pricePeriodOptions(state.form.category, state.form.price_period);
  const status = saving
    ? null
    : autosave.savedAt && autosave.savedAt !== restoredAt
      ? `Утсан дээр хадгалагдсан ${fmtTime(autosave.savedAt)}`
      : restoredAt
        ? `Ноорог сэргээгдлээ ${fmtTime(restoredAt)}`
        : "Дутуу бөглөсөн ч хадгална — дараа нь картаас гүйцээнэ.";

  return (
    <div
      ref={formRef}
      onPointerDownCapture={() => {
        taps.current++;
      }}
      onInputCapture={markInput}
      aria-busy={saving || undefined}
      style={{ paddingBottom: SAVE_BAR_HEIGHT + 24 + inset }}
      className="space-y-4 max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base md:pb-0!"
    >
      {!online ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Сүлжээгүй — бүгд утсан дээр хадгалагдаж, сүлжээ орохоор өөрөө илгээнэ.</p>
        </div>
      ) : null}

      {phase === "queued" ? (
        <div role="status" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">{queuedText ?? NETWORK_ERROR_TEXT}</p>
          <p>Зураг утсан дээр хүлээж байна — бүртгэл илгээгдмэгц хуулагдана.</p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Button type="button" size="md" disabled={!online || saving} onClick={() => void sendNow()}>
              Одоо илгээх
            </Button>
            <Button type="button" size="md" variant="outline" onClick={onStartNew}>
              <Plus className="size-4" aria-hidden />
              Шинэ хөрөнгө
            </Button>
          </div>
        </div>
      ) : null}

      {intake && (shareFailed.length || intake.overLimit || intake.nonImage) ? (
        <div role="status" className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {shareFailed.length ? (
            <p>
              {shareGone
                ? `${shareFailed.length} зургийн хуваалцсан хугацаа дууссан — «Галерей» товчоор дахин нэмнэ үү.`
                : `${shareFailed.length} зургийг уншиж чадсангүй — «Дахин оролдох» дарна уу, эсвэл дахин хуваалцана уу.`}
            </p>
          ) : null}
          {intake.overLimit ? (
            <p>
              Дээд тал нь {settings.limits.maxImages} зураг — {intake.overLimit} зураг орсонгүй.
            </p>
          ) : null}
          {intake.nonImage ? <p>Зураг биш {intake.nonImage} файл орсонгүй.</p> : null}
          {shareFailed.length && !shareGone ? (
            <Button type="button" size="touch" variant="outline" disabled={locked || shareRetrying} onClick={() => void retrySharedPhotos()}>
              {shareRetrying ? "Боловсруулж байна…" : "Дахин оролдох"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {serverError ? <FormAlert>{serverError}</FormAlert> : null}
      {autosave.error ?<FormAlert tone="warn">Утсан дээр хадгалж чадсангүй — хадгалах товчоор шууд илгээнэ үү.</FormAlert> : null}

      <PastePanel
        key={intake ? "intake" : "paste"}
        ctx={{ districts: settings.districts, projects: recentProjects.map((p) => ({ id: p.id, name: p.name })), featureKeys: settings.featureKeys }}
        aiAvailable={aiAvailable}
        initialText={intake?.text ?? null}
        initialPhones={intake?.phones}
        initialMessage={
          intake
            ? intake.filled
              ? `Хуваалцсан зараас ${intake.filled} талбар бөглөгдлөө — шараар тэмдэглэснийг шалгана уу.`
              : "Хуваалцсан зарыг хүлээн авлаа."
            : null
        }
        disabled={locked}
        ownerPhoneEmpty={owner.empty}
        onParsed={onParsed}
        onOwnerPhone={ownerFromPaste}
      />

      {state.form.unconfirmed.some((k) => k !== "listing_agent_id") ? (
        <FormAlert tone="warn">Шараар тэмдэглэсэн утгыг автоматаар бөглөсөн — шалгаад «Зөв» дарна уу. Хадгалахад саад болохгүй.</FormAlert>
      ) : null}

      <Section title="Хаана" step={1}>
        <PlaceFields
          value={state.form}
          districts={settings.districts}
          recentProjects={recentProjects}
          recentDistricts={recentDistricts}
          projectDistrict={projectDistrict}
          auto={auto}
          disabled={locked}
          onProjectText={(v) =>
            update((s) => {
              const next = setTyped(s, "project_name", v);
              return { ...next, form: { ...next.form, project_id: null } };
            })
          }
          onProjectPick={pickProject}
          onDistrict={(d) => set("district", d)}
          onLocation={(v) => set("location_text", v)}
          onPin={(lat, lng) =>
            update((s) => ({
              form: { ...s.form, lat, lng, unconfirmed: s.form.unconfirmed.filter((k) => k !== "lat") },
              meta: markTyped(s.meta, ["lat", "lng"]),
            }))
          }
          onPinAddress={(v) => set("pin_address", v)}
          onConfirm={(k) => confirm(k)}
        />
      </Section>

      <Section title="Юу" step={2}>
        <KindFields
          category={state.form.category}
          propertyType={state.form.property_type}
          categoryLabels={settings.categoryLabels}
          categoryHints={settings.categoryHints}
          types={settings.types}
          categoryAuto={auto("category")}
          typeAuto={auto("property_type")}
          disabled={locked}
          error={errors.category ?? null}
          onCategory={(c) => {
            update((s) => setCategory(s, c));
            if (errors.category) setErrors((e) => omit(e, "category"));
          }}
          onType={(t) => set("property_type", t)}
          onConfirm={(k) => confirm(k)}
        />
      </Section>

      <Section title="Эзэн" step={3} hint="Утсыг бичих бүрт утсан дээр нууцлагдаж хадгалагдана.">
        <OwnerPhoneField
          key={ownerMount}
          idPrefix="qa"
          mode="draft"
          meId={me}
          sources={settings.sources}
          initial={ownerInitial}
          flow={flow}
          privateLost={privateLost}
          disabled={locked}
          onChange={onOwnerChange}
        />
        {errors.owner ? (
          <p role="alert" className="text-sm text-danger">
            {errors.owner}
          </p>
        ) : null}
      </Section>

      <Section title="Зураг" step={4}>
        <QuickPhotos
          profileId={me}
          draftScope={scope}
          value={media}
          onChange={(v) => {
            markInput();
            setMedia(v);
          }}
          maxPhotos={settings.limits.maxImages}
          flow={flow}
          disabled={locked}
          onPicked={(n) => {
            photosPicked.current += n;
          }}
          onProcessingChange={onProcessingChange}
        />
      </Section>

      <Section title="Хэмжээ" step={5} icon={Ruler}>
        <SizeFieldsBlock state={state} set={set} update={update} auto={auto} err={err} touch={touch} confirm={confirm} locked={locked} />
      </Section>

      <Section title="Үнэ" step={6} icon={Tag}>
        {priceRow ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <span>
              Үнийг шалгана уу: <span className="font-semibold">{priceRow}</span>
            </span>
            <button
              type="button"
              disabled={locked}
              onClick={() => confirm(...PRICE_GROUP_KEYS)}
              className="inline-flex min-h-11 items-center rounded-lg bg-amber-100 px-3 font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            >
              Зөв
            </button>
          </div>
        ) : null}
        <PriceField
          id="qa-price"
          value={state.form.price}
          onChange={(v) => setPriceGroup({ price: v })}
          currency={state.form.currency}
          onCurrencyChange={(c) => setPriceGroup({ currency: c })}
          basis={state.form.price_basis}
          onBasisChange={(b) => setPriceGroup({ price_basis: b })}
          category={state.form.category}
          period={state.form.price_period}
          areaM2={state.form.area_m2}
          unconfirmed={auto("price")}
          error={errors.price ?? null}
          disabled={locked}
          onBlur={() => {
            touch("price");
            touch("price_period");
          }}
        />
        {periodOptions.length > 1 ? (
          <FormField label="Үнийн хугацаа" htmlFor="qa-price_period">
            <div id="qa-price_period" tabIndex={-1} className="outline-none">
              <ChoiceChips
                label="Үнийн хугацаа"
                value={state.form.price_period}
                disabled={locked}
                options={periodOptions.map((p) => ({ value: p, label: PRICE_PERIOD_LABEL[p] }))}
                onChange={(p: Crm2PricePeriod) => setPriceGroup({ price_period: p })}
              />
            </div>
          </FormField>
        ) : null}
        {err("price_period") ? (
          <p role="alert" className="text-xs text-danger">
            {err("price_period")}
          </p>
        ) : blurWarnings.price_period ? (
          <p role="status" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
            {blurWarnings.price_period}
          </p>
        ) : null}
      </Section>

      <Section title="Агент" step={7}>
        <ListingAgentRow
          value={state.form.listing_agent_id}
          staff={staff}
          meId={me}
          teamIds={teamIds}
          expanded={panel === "office"}
          unconfirmed={auto("listing_agent_id")}
          disabled={locked}
          onChange={(v) => set("listing_agent_id", v)}
          onConfirm={() => confirm("listing_agent_id")}
        />
        <p className="text-xs text-muted">Гэрээ байгуулсан агентыг гэрээ үүсгэхэд тодорхойлно.</p>
      </Section>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-ink">Нэмэлт (заавал биш)</summary>
        <div className="space-y-4 border-t border-line p-4">
          <FormField label="Байр, орц, тоот (дотоод)" htmlFor="qa-address_detail" hint="Нийтэд хэзээ ч гарахгүй, утсан дээр нууцлагдана.">
            <Textarea
              id="qa-address_detail"
              rows={2}
              maxLength={1000}
              value={state.form.address_detail}
              disabled={locked}
              onChange={(e) => set("address_detail", e.target.value)}
            />
          </FormField>
          <FormField label="Дотоод тэмдэглэл" htmlFor="qa-notes" unconfirmed={auto("notes")} onConfirm={() => confirm("notes")}>
            <Textarea id="qa-notes" rows={3} maxLength={8000} value={state.form.notes} disabled={locked} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
        </div>
      </details>

      {phase === "ready" ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDiscardCurrent}
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
            Энэ ноорогийг устгах
          </button>
        </div>
      ) : null}

      {phase === "ready" ? (
        <StickySaveBar
          onSave={() => void onSave()}
          disabled={processing}
          busy={saving}
          status={processing ? "Зураг боловсруулж байна…" : canSave(state.form) ? status : "Ангилал сонгосны дараа хадгалах боломжтой."}
          hint="Зураг боловсруулж байна…"
        />
      ) : null}
    </div>
  );

  function setPriceGroup(patch: Partial<Pick<QuickState["form"], "price" | "currency" | "price_basis" | "price_period">>) {
    // Үнийг гараар засвал бүлэг бүхэлдээ шалгагдсанд тооцно.
    update((s) => ({
      form: { ...s.form, ...patch, unconfirmed: s.form.unconfirmed.filter((k) => !(PRICE_GROUP_KEYS as readonly string[]).includes(k)) },
      meta: markTyped(s.meta, [...PRICE_GROUP_KEYS]),
    }));
    if (errors.price) setErrors((e) => omit(e, "price"));
  }
}

// ── Хэсгүүд ────────────────────────────────────────────────────────────────


function SizeFieldsBlock({
  state,
  set,
  update,
  auto,
  err,
  touch,
  confirm,
  locked,
}: {
  state: QuickState;
  set: <K extends keyof QuickState["form"]>(k: K, v: QuickState["form"][K]) => void;
  update: (fn: (s: QuickState) => QuickState) => void;
  auto: (k: string) => boolean;
  err: (k: string) => string | null;
  touch: (k: string) => void;
  confirm: (...k: string[]) => void;
  locked: boolean;
}) {
  return (
    <SizeFields
      area={state.form.area_m2}
      rooms={state.form.rooms}
      floor={{ floor: state.form.floor, building_floors: state.form.building_floors }}
      auto={auto}
      errors={{ area_m2: err("area_m2"), floor: err("floor") ?? err("building_floors") }}
      disabled={locked}
      onArea={(v) => set("area_m2", v)}
      onRooms={(v) => set("rooms", v)}
      onFloor={(v) =>
        update((s) => {
          const a = setTyped(s, "floor", v.floor);
          return setTyped(a, "building_floors", v.building_floors);
        })
      }
      onBlurField={touch}
      onConfirm={confirm}
    />
  );
}

function Section({
  title,
  step,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  step: number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const id = `qa-section-${step}`;
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-2">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
          {step}
        </span>
        <h2 id={id} className="flex items-center gap-1.5 text-base font-bold text-ink">
          {Icon ? <Icon className="size-4 text-brand-600" /> : null}
          {title}
        </h2>
      </header>
      {hint ? <p className="-mt-1 text-xs text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

/** Хуваалцсан зарыг задлахаас өмнөх шалгалт (эх сурвалжийг харуулна, юу ч бичигдээгүй). */
function ShareOfferCard({ item, onAccept, onReject }: { item: SharedItem; onAccept: () => void; onReject: () => void }) {
  const photos = sharedImages(item.files).length;
  const text = (item.text ?? "").trim();
  const preview = text.length > 280 ? `${text.slice(0, 279)}…` : text;
  return (
    <div role="group" aria-label="Хуваалцсан зар" className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <p className="font-semibold">Хуваалцсан зар — шалгаад бүртгэлд оруулна уу</p>
      <p className="text-xs">
        {fmtTime(item.at)}-д хүлээн авсан · {photos} зураг{text ? "" : " · текстгүй"}. Та өөрөө хуваалцаагүй бол «Хаях» дарна уу.
      </p>
      {preview ? <p className="line-clamp-6 whitespace-pre-line rounded-xl bg-surface p-3 text-ink">{preview}</p> : null}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <Button type="button" size="lg" onClick={onAccept}>
          Бүртгэлд оруулах
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onReject}>
          Хаях
        </Button>
      </div>
    </div>
  );
}

function SavedPanel({
  saved,
  paths,
  onNew,
}: {
  saved: SavedView | null;
  paths: ReturnType<typeof crm2Paths>;
  onNew: () => void;
}) {
  const router = useRouter();
  if (!saved) {
    // Ард илгээгдсэн (хүлээлгээс) — кодыг «Илгээгдсэн — анхаарах» жагсаалт ба Staff жагсаалтаас.
    return (
      <div role="status" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="flex items-center gap-2 font-semibold">
          <CircleCheck className="size-4" aria-hidden />
          Бүртгэл илгээгдлээ.
        </p>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <Link href={paths.staff()} className={buttonClasses("primary", "lg")}>
            Staff руу
          </Link>
          <Button type="button" size="lg" variant="outline" onClick={onNew}>
            <Plus className="size-4" aria-hidden />
            Дараагийн хөрөнгө
          </Button>
        </div>
      </div>
    );
  }
  const cardHref = paths.property(saved.propertyId, undefined, { sheet: saved.sheet });
  return (
    <div className="space-y-3">
      <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">{saved.code ? `${saved.code} ноорог` : "Ноорог"} бүртгэгдлээ.</span> Доорх зүйлийг шалгаад картаас гүйцээнэ үү.
        </p>
      </div>
      {saved.ownerPending ? (
        <OwnerPendingNotice
          pending={saved.ownerPending}
          onResolve={() => router.push(paths.property(saved.propertyId, undefined, { sheet: "owner" }))}
        />
      ) : null}
      {saved.duplicates.length ? (
        <DuplicateNotice propertyId={saved.propertyId} duplicates={saved.duplicates} onArchived={() => router.push(paths.staff())} />
      ) : null}
      <div className={cn("grid grid-cols-1 gap-2 min-[420px]:grid-cols-2")}>
        <Link href={cardHref} className={buttonClasses("primary", "lg")}>
          Карт руу үргэлжлүүлэх
        </Link>
        <Button type="button" size="lg" variant="outline" onClick={onNew}>
          <Plus className="size-4" aria-hidden />
          Дараагийн хөрөнгө
        </Button>
      </div>
    </div>
  );
}

function omit(o: Record<string, string>, k: string): Record<string, string> {
  if (!(k in o)) return o;
  const n = { ...o };
  delete n[k];
  return n;
}

function focusField(key: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(key === "owner" ? "qa-owner-phone" : `qa-${key}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

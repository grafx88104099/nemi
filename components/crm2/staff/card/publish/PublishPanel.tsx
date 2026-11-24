"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  GitCompareArrows,
  Images,
  Lock,
  Megaphone,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Stamp,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { publishProperty, unpublishProperty, updateListingText } from "@/lib/crm2/actions/publish";
import {
  NO_WATERMARK_ERROR,
  publishPhotoMode,
  syncListingPhotos,
  type PublishPhotoMode,
  type PublishPhotoProgress,
} from "@/lib/crm2/publish-photos";
import type { Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2PublishState } from "@/lib/crm2/queries/publish";
import type { Crm2PublishPreview } from "@/lib/crm2/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Note, Section, TextBlock } from "../parts";
import { LinkChoice } from "./LinkChoice";
import { PhotoProgress } from "./PhotoProgress";
import { PrivacyNotice } from "./PrivacyNotice";
import { PublishDiff } from "./PublishDiff";
import { ReadinessSection } from "./ReadinessSection";
import { listingStatusLabel, listingStatusTone } from "./listing-status";
import {
  checkPublishTexts,
  defaultChoice,
  effectiveTexts,
  hasMaskedPhone,
  initialTexts,
  linkArgs,
  needsWatermark,
  normalizeChoice,
  publishDiffRows,
  riskMessage,
  textsToSend,
  type PublishChoice,
} from "./publish-model";
import type { PublishReadiness } from "./readiness";

const TITLE_MAX = 160;
const DESC_MAX = 4000;

/** Гэнэтийн алдаа (сервер/сүлжээ) — хэрэглэгчид дахин оролдох боломж үлдээнэ. */
const GENERIC_FAIL_TEXT = "Алдаа гарлаа. Дахин оролдоно уу.";

/** Зураг таслалдвал: зар нийтэд гарсан ч зураггүй — дахин оролдох товчийг нэрлэнэ. */
const PHOTO_FAIL_TEXT =
  "Зургийг зард оруулж чадсангүй. Зар нийтэд гарсан ч зураг нь шинэчлэгдсэнгүй — «Зургийг шинэчлэх» товчоор дахин оролдоно уу.";

/** Хэн нийтлэх вэ (crm2_can_edit_property-ийн дүрэм). */
const WHO_CAN_PUBLISH_TEXT =
  "Зар нийтлэх, буцаах эрх зөвхөн энэ хөрөнгийн үүрэгт агентууд (листлэгч, гэрээ, зураг), тэдний багийн ахлагч, оффисын менежерт байна.";

export const textareaClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * «Зар» таб — Staff хөрөнгийг nemi.mn дээр нийтийн зар болгох, буцаах.
 *
 * Зар нь хөрөнгөтэйгөө холбоотой: үнэ, үзүүлэлт, төлөв нь автоматаар дагана;
 * зөвхөн гарчиг, танилцуулга агентынх. Зургийг энэ браузерт PMC-ийн тамга дарж
 * байж нийтийн bucket руу хуулна (lib/crm2/publish-photos.ts).
 *
 * «Нийтлэхэд бэлэн» бүлэг (readiness) ноорог шатнаас харагдана. «Миний зараас үүсгэсэн» хөрөнгийг
 * эх зартай нь зөвхөн нийтлэх үед холбоно (preview.link_mode) — ялгааг гарчиг, тайлбартай нь харуулна.
 * Эрхийг RPC эцэслэн шалгана — энд зөвхөн тусгана.
 */
export function PublishPanel({
  panel,
  propertyId,
  state,
  preview = null,
  readiness = null,
}: {
  panel: Crm2Panel;
  propertyId: string;
  state: Crm2PublishState;
  /** crm2_publish_preview — зөвхөн засах эрхтэй, зар болоогүй үед; алдаа/эрхгүй бол null. */
  preview?: Crm2PublishPreview | null;
  /** Шалгах жагсаалтын «Нийтлэхэд бэлэн» хэсэг; байхгүй бол харуулахгүй. */
  readiness?: PublishReadiness | null;
}) {
  const router = useRouter();
  const ids = React.useId();
  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  const linked = !!state.listingId;
  const candidate = !linked ? (preview?.link_candidate ?? null) : null;
  const mode = !linked && candidate ? (preview?.link_mode ?? "new_only") : "new_only";
  const fallbackTexts = React.useMemo(
    () => ({
      title: state.title ?? state.defaultTitle,
      description: state.description ?? state.defaultDescription,
    }),
    [state.title, state.defaultTitle, state.description, state.defaultDescription]
  );

  const [choiceRaw, setChoice] = React.useState<PublishChoice>(() => defaultChoice(mode));
  const choice = normalizeChoice(mode, choiceRaw);
  const linking = !linked && !!candidate && choice === "link";
  const [replacePhotos, setReplacePhotos] = React.useState(false);

  const initial = initialTexts(choice, preview, fallbackTexts);
  const [title, setTitle] = React.useState(initial.title);
  const [description, setDescription] = React.useState(initial.description);
  const [textTouched, setTextTouched] = React.useState(false);

  const [busy, setBusy] = React.useState<null | "publish" | "text" | "photos">(null);
  const [progress, setProgress] = React.useState<PublishPhotoProgress | null>(null);
  // Явцыг дарсан товчных нь хажууд харуулна (нийтлэх товч ¦ зураг шинэчлэх товч).
  const [progressAt, setProgressAt] = React.useState<"publish" | "photos">("photos");
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [serverTextError, setServerTextError] = React.useState<string | null>(null);
  const [unpublishOpen, setUnpublishOpen] = React.useState(false);

  /** Горим солиход агент текстэд хүрээгүй бол тухайн горимын анхдагч текст. */
  function selectChoice(next: PublishChoice) {
    setChoice(next);
    if (!textTouched) {
      const t = initialTexts(next, preview, fallbackTexts);
      setTitle(t.title);
      setDescription(t.description);
    }
    if (next === "new") setReplacePhotos(false);
  }

  function resetToCrmText() {
    setTitle(preview?.title || state.defaultTitle);
    setDescription(preview?.description ?? state.defaultDescription);
    setTextTouched(true);
    setServerTextError(null);
  }

  // Нийтэд гарах бодит текст (хоосон бол анхдагч / эх зарынх) дээр эрсдэл шалгана.
  const effective = effectiveTexts(
    linked ? "new" : choice,
    { title, description },
    {
      candidate: linking ? candidate : null,
      defaultTitle: preview?.title || state.defaultTitle,
      defaultDescription: preview?.description ?? state.defaultDescription,
    }
  );
  const risks = checkPublishTexts(effective);
  const titleRisk = riskMessage(risks.title);
  const descRisk = riskMessage(risks.description);

  const blocked = state.blockers.length > 0;
  const watermarkNeeded = needsWatermark(choice, linking, replacePhotos);
  const noWatermark = !state.watermark;
  const readOnly = !state.canPublish;
  const working = busy !== null;
  const hasTitle = title.trim().length > 0 || (linking && !!candidate?.title);
  const canPublishNow =
    !readOnly && !blocked && !(noWatermark && watermarkNeeded) && !working && hasTitle && !risks.blocking;
  const textDirty = title !== (state.title ?? "") || description !== (state.description ?? "");

  const diffRows = React.useMemo(
    () =>
      preview && !linked
        ? publishDiffRows(preview, {
            choice,
            title,
            description,
            defaultTitle: preview.title || state.defaultTitle,
            defaultDescription: preview.description ?? state.defaultDescription,
            replacePhotos,
            imageCount: state.imageCount,
          })
        : null,
    [preview, linked, choice, title, description, replacePhotos, state.defaultTitle, state.defaultDescription, state.imageCount]
  );

  /** Зураг бүрд тамга дарж, нийтийн bucket руу хуулаад зард холбоно. */
  async function runPhotos(from: "publish" | "photos", photoMode: PublishPhotoMode = "stamp_all"): Promise<boolean> {
    setPhotoError(null);
    setProgressAt(from);
    setBusy("photos");
    setProgress({ step: "prepare", done: 0, total: state.media.length });
    try {
      const res = await syncListingPhotos({
        propertyId,
        media: state.media,
        watermark: state.watermark,
        onProgress: setProgress,
        mode: photoMode,
      });
      if (!res.ok) {
        setPhotoError(res.error);
        toast.error(res.error);
        return false;
      }
      if (!res.data.skipped) toast.success(`${res.data.uploaded} зураг тамгатайгаар зард орлоо`);
      return true;
    } catch (e) {
      // Тамга/хуулалт гэнэт шидвэл (жишээ нь задрахгүй файл) зар зураггүй үлдэнэ —
      // чимээгүй алдалгүй, нийтэлсний дараа ч хэрэглэгчид мэдэгдэнэ.
      console.error("PublishPanel зураг:", e);
      setPhotoError(PHOTO_FAIL_TEXT);
      toast.error(PHOTO_FAIL_TEXT);
      return false;
    } finally {
      setProgress(null);
      setBusy(null);
      router.refresh();
    }
  }

  /** DB-ийн утасны алдаа ('description') — тайлбарын талбарт харуулж фокуслана. */
  function showTextError(text: string) {
    setServerTextError(text);
    const target = risks.title.includes("phone") && !risks.description.includes("phone") ? titleRef.current : descRef.current;
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function onPublish() {
    setBusy("publish");
    setServerTextError(null);
    try {
      const texts = linked ? textsToSend("new", { title, description }, null) : textsToSend(choice, { title, description }, linking ? candidate : null);
      const res = await publishProperty({
        property_id: propertyId,
        ...texts,
        ...(linked ? {} : linkArgs(choice, linking ? candidate : null, replacePhotos)),
      });
      if (!res.ok) {
        if (res.field === "description" || res.field === "title") showTextError(res.error);
        toast.error(res.error);
        return;
      }
      const photoMode = publishPhotoMode({ linked: res.data.linked, replacePhotos });
      if (photoMode === "keep") {
        toast.success("Таны зар шинэчлэгдлээ", { description: "Зарын зураг хэвээр үлдлээ. Цаашид зар CRM-ээр шинэчлэгдэнэ." });
        router.refresh();
        return;
      }
      toast.success(res.data.linked ? "Таны зар шинэчлэгдлээ" : linked ? "Зар дахин нийтлэгдлээ" : "Зар нийтлэгдлээ", {
        description: "Одоо зургийг тамга дарж байршуулна.",
      });
      // Тамгагүй зартай үлдэхгүйн тулд нийтэлсэн даруйд зургаа шинэчилнэ.
      await runPhotos("publish", photoMode);
    } catch (e) {
      // Server action шиднэ (сүлжээ тасрах, дахин байршуулалт) — товчнууд түгжээтэй үлдэхгүй.
      console.error("PublishPanel нийтлэх:", e);
      toast.error(GENERIC_FAIL_TEXT);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveText() {
    setBusy("text");
    setServerTextError(null);
    try {
      const res = await updateListingText({ property_id: propertyId, title: title.trim(), description: description.trim() });
      if (!res.ok) {
        if (res.field === "description" || res.field === "title") showTextError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Зарын текст хадгалагдлаа");
      router.refresh();
    } catch (e) {
      console.error("PublishPanel текст:", e);
      toast.error(GENERIC_FAIL_TEXT);
    } finally {
      setBusy(null);
    }
  }

  // Нийтийн зарын хуудас (app/(site)/listings/[id]). Буцаасан зар нийтэд нээгдэхгүй тул зөвхөн нийтлэгдсэн үед.
  const publicHref = state.published && state.listingId ? `/listings/${state.listingId}` : null;
  const publishLabel =
    busy === "publish"
      ? "Нийтэлж байна…"
      : linking
        ? "Зарыг шинэчилж нийтлэх"
        : linked
          ? "Дахин нийтлэх"
          : "Нийтэд зарлах";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {readiness && !state.published ? <ReadinessSection panel={panel} propertyId={propertyId} readiness={readiness} /> : null}

        <Section
          title="Нийтийн зар"
          icon={Megaphone}
          action={
            <>
              <Badge tone={state.published ? "green" : "neutral"}>{state.published ? "Нийтлэгдсэн" : "Нийтлээгүй"}</Badge>
              {linked ? <Badge tone={listingStatusTone(state.listingStatus)}>{listingStatusLabel(state.listingStatus)}</Badge> : null}
            </>
          }
        >
          <div className="space-y-3">
            {state.published ? (
              <>
                <p className="text-sm text-muted">
                  Энэ хөрөнгө nemi.mn дээр нийтэд харагдаж байна. Үнэ, үзүүлэлт, төлөв нь хөрөнгөө дагаж автоматаар шинэчлэгдэнэ —
                  зөвхөн гарчиг, танилцуулга, зургийг энд удирдана.
                </p>
                <p className="text-xs text-muted">
                  Нийтэлсэн: {state.publishedBy ?? "Ажилтан"}
                  {state.publishedAt ? ` · ${fmtDateTime(state.publishedAt)}` : ""}
                </p>
              </>
            ) : linked ? (
              <p className="text-sm text-muted">
                Зар нийтээс буцаагдсан байна. Дахин нийтлэхэд өмнөх зар (гарчиг, танилцуулга) сэргэнэ.
              </p>
            ) : candidate && !readOnly ? (
              <LinkChoice
                mode={mode}
                candidate={candidate}
                choice={choice}
                onChoice={selectChoice}
                replacePhotos={replacePhotos}
                onReplacePhotos={setReplacePhotos}
                imageCount={state.imageCount}
                disabled={working}
              />
            ) : (
              <>
                <p className="text-sm text-muted">
                  Staff-д бүртгэсэн энэ хөрөнгийг nemi.mn дээр нийтийн зар болгож болно. Зар нь хөрөнгөтэйгөө холбоотой үлдэж, үнэ,
                  үзүүлэлт, төлөв нь автоматаар шинэчлэгдэнэ.
                </p>
                {!readiness ? <PrivacyNotice watermarkLabel={state.watermark?.label} /> : null}
              </>
            )}

            {state.warnings.length > 0 ? (
              <div className="space-y-1" role="status">
                {state.warnings.map((w) => (
                  <Note key={w} icon={TriangleAlert} tone="amber">
                    {w}
                  </Note>
                ))}
              </div>
            ) : null}

            {blocked ? (
              readiness && !state.published ? (
                <details className="rounded-xl bg-amber-50 px-3 text-sm text-amber-900">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-semibold">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> Нийтлэх товч хаалттай — шалтгаан ({state.blockers.length})
                  </summary>
                  <ul className="list-disc space-y-0.5 pb-2 pl-5 text-sm">
                    {state.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="space-y-1.5">
                  <Note icon={TriangleAlert} tone="amber">
                    Нийтлэхэд дараах зүйл дутуу байна:
                  </Note>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                    {state.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}

            {noWatermark && watermarkNeeded ? <Note icon={Stamp} tone="rose">{NO_WATERMARK_ERROR}</Note> : null}
            {risks.blocking && !readOnly ? (
              <Note icon={TriangleAlert} tone="rose">
                Гарчиг эсвэл танилцуулгад утасны дугаар байна — хасаж байж нийтэлнэ.
              </Note>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!readOnly && !state.published ? (
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:h-11 sm:w-auto"
                  disabled={!canPublishNow}
                  onClick={() => void onPublish()}
                >
                  <Megaphone className="size-4" aria-hidden />
                  {publishLabel}
                </Button>
              ) : null}
              {/* Нийтэд байгаа зарыг харах — эрхгүй хүн ч шалгаж болно. */}
              {publicHref ? (
                <a
                  href={publicHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 sm:min-h-9"
                >
                  <ExternalLink className="size-4" aria-hidden /> Зарыг харах
                </a>
              ) : null}
              {!readOnly && state.published ? (
                <Button
                  type="button"
                  size="touch"
                  variant="ghost"
                  className="text-rose-700"
                  disabled={working}
                  onClick={() => setUnpublishOpen(true)}
                >
                  <Undo2 className="size-4" aria-hidden /> Зарнаас буцаах
                </Button>
              ) : null}
            </div>

            {readOnly ? <Note icon={Lock}>{WHO_CAN_PUBLISH_TEXT}</Note> : null}

            {progress && progressAt === "publish" ? <PhotoProgress progress={progress} /> : null}
          </div>
        </Section>

        <Section
          title="Зарын гарчиг, танилцуулга"
          icon={Pencil}
          action={
            !readOnly && !linked && preview ? (
              <Button type="button" size="touch" variant="ghost" disabled={working} onClick={resetToCrmText}>
                <RotateCcw className="size-4" aria-hidden /> CRM-ийн анхдагч текст
              </Button>
            ) : null
          }
        >
          {readOnly ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted">Гарчиг</dt>
                <dd className="text-sm font-semibold text-ink">{state.title || state.defaultTitle || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Танилцуулга</dt>
                <dd>
                  <TextBlock text={state.description ?? state.defaultDescription} />
                </dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                {linking
                  ? "Одоогийн зарын текст. Өөрчлөхгүй бол хэвээр үлдэнэ (доторх утасны дугаарыг нууна)."
                  : "Зөвхөн эдгээр текстийг агент чөлөөтэй бичнэ. Хаяг, тоот, эзний мэдээлэл, утас бичихгүй — нийтэд харагдана."}
              </p>
              <Field label="Гарчиг" htmlFor={`${ids}-title`} hint={`${title.length}/${TITLE_MAX}`}>
                <Input
                  id={`${ids}-title`}
                  ref={titleRef}
                  value={title}
                  maxLength={TITLE_MAX}
                  disabled={working}
                  enterKeyHint="next"
                  className="text-base sm:text-sm"
                  aria-invalid={titleRisk?.tone === "error" || undefined}
                  aria-describedby={titleRisk ? `${ids}-title-risk` : undefined}
                  placeholder={state.defaultTitle || "Жишээ: Зайсан, 3 өрөө, 86 м²"}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTextTouched(true);
                    setServerTextError(null);
                  }}
                />
              </Field>
              {titleRisk ? <RiskLine id={`${ids}-title-risk`} risk={titleRisk} /> : null}
              <Field label="Танилцуулга" htmlFor={`${ids}-desc`} hint={`${description.length}/${DESC_MAX}`}>
                <textarea
                  id={`${ids}-desc`}
                  ref={descRef}
                  value={description}
                  rows={6}
                  maxLength={DESC_MAX}
                  disabled={working}
                  aria-invalid={descRisk?.tone === "error" || !!serverTextError || undefined}
                  aria-describedby={descRisk || serverTextError ? `${ids}-desc-risk` : undefined}
                  placeholder={state.defaultDescription || "Хөрөнгийн давуу тал, орчин, орох боломжийг товч бичнэ."}
                  className={cn(textareaClass, "text-base sm:text-sm")}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setTextTouched(true);
                    setServerTextError(null);
                  }}
                />
              </Field>
              <div id={`${ids}-desc-risk`} className="space-y-1">
                {descRisk ? <RiskLine risk={descRisk} /> : null}
                {serverTextError && !descRisk ? <RiskLine risk={{ tone: "error", text: serverTextError }} /> : null}
                {!description.trim() && !linked ? (
                  <p className="text-xs text-muted">
                    Хоосон бол {linking ? "одоогийн зарын танилцуулга хэвээр үлдэнэ." : "CRM-ийн анхдагч танилцуулга орно."}
                  </p>
                ) : null}
              </div>
              {linking && (hasMaskedPhone(candidate?.title) || hasMaskedPhone(candidate?.description)) ? (
                <Note icon={ShieldCheck} tone="blue">
                  Одоогийн зарын текстэд байсан утасны дугаарыг «•••• ••••» болгон нууна.
                </Note>
              ) : null}
              {linked ? (
                <Button
                  type="button"
                  size="touch"
                  variant="outline"
                  disabled={working || !title.trim() || !textDirty || risks.blocking}
                  onClick={() => void onSaveText()}
                >
                  <Save className="size-4" aria-hidden /> {busy === "text" ? "Хадгалж байна…" : "Зарын текст засах"}
                </Button>
              ) : (
                <p className="text-xs text-muted">Эдгээр текст нийтлэх үед зар дээр гарна. Дараа нь эндээс засаж болно.</p>
              )}
            </div>
          )}
        </Section>

        {diffRows && !readOnly ? (
          <Section title={linking ? "Зарт өөрчлөгдөх зүйл" : "Нийтэд гарах утга"} icon={GitCompareArrows}>
            <div className="space-y-2">
              <p className="text-xs text-muted">
                {linking
                  ? "Одоогийн зар ба нийтэлсний дараах нийтийн талбар. Эзний мэдээлэл, дотоод тэмдэглэл энд орохгүй."
                  : "Нийтлэх үед зард яг ингэж гарна. Эзний мэдээлэл, дотоод тэмдэглэл энд орохгүй."}
              </p>
              <PublishDiff rows={diffRows} linking={linking} />
            </div>
          </Section>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4">
        <Section title="Зарын зураг" icon={Images}>
          <div className="space-y-3">
            <p className="text-sm text-ink">
              CRM-д <span className="font-semibold tabular-nums">{state.imageCount}</span> зураг · зард{" "}
              <span className="font-semibold tabular-nums">{linking ? (candidate?.photo_count ?? 0) : state.photoCount}</span> зураг
            </p>
            <p className="text-xs text-muted">
              {linking && !replacePhotos
                ? "Одоогийн зарын зураг хэвээр үлдэнэ. Солих бол «Зургийг солих»-ыг сонгоно."
                : state.watermark?.label
                  ? `Зураг бүрд «${state.watermark.label}»-ийн тамга дарагдаж, нийтийн зар руу орно. Тамгагүй эх зураг нийтэд гарахгүй.`
                  : "Зураг бүрд оффисын тамга дарагдаж байж зар руу орно."}
            </p>

            {progress && progressAt === "photos" ? <PhotoProgress progress={progress} /> : null}

            {photoError ? (
              <Note icon={TriangleAlert} tone="rose">
                {photoError}
              </Note>
            ) : null}

            {state.mediaStale && linked ? (
              <Note icon={RefreshCw} tone="amber">
                CRM-д шинэ зураг нэмэгдсэн байна. «Зургийг шинэчлэх»-ээр тамга дарж зард оруулна.
              </Note>
            ) : null}

            {!readOnly && linked ? (
              <Button
                type="button"
                size="touch"
                variant={state.mediaStale ? "primary" : "outline"}
                disabled={working || noWatermark || state.media.length === 0}
                onClick={() => void runPhotos("photos")}
              >
                <RefreshCw className="size-4" aria-hidden /> {busy === "photos" ? "Боловсруулж байна…" : "Зургийг шинэчлэх"}
              </Button>
            ) : null}
            {state.media.length === 0 ? <p className="text-xs text-subtle">Хөрөнгөд зураг оруулаагүй байна.</p> : null}
            {noWatermark && (linked || watermarkNeeded) ? <p className="text-xs text-rose-700">{NO_WATERMARK_ERROR}</p> : null}
          </div>
        </Section>

        {linked || readiness ? (
          <Section title="Нууцлал" icon={ShieldCheck}>
            <PrivacyNotice watermarkLabel={state.watermark?.label} />
          </Section>
        ) : null}
      </div>

      <ReasonDialog
        open={unpublishOpen}
        onClose={() => setUnpublishOpen(false)}
        title="Зарнаас буцаах уу?"
        description="Зар nemi.mn дээрээс алга болно (төлөв нь «буцаасан»). Хөрөнгөтэй холбоо хадгалагдах тул дараа нь дахин нийтэлж болно."
        label="Шалтгаан"
        placeholder="Жишээ: эзэн түр зогсоохыг хүссэн"
        textRequired={false}
        confirmLabel="Зарнаас буцаах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await unpublishProperty({ property_id: propertyId, reason: text || undefined });
          if (!res.ok) return res.error;
          toast.success("Зар нийтээс буцлаа");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

/** Бичвэрийн эрсдэлийн мөр: утас — алдаа (DB хориглоно), тоот/код — сануулга. */
function RiskLine({ id, risk }: { id?: string; risk: { tone: "error" | "warning"; text: string } }) {
  return (
    <p
      id={id}
      role={risk.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
        risk.tone === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{risk.text}</span>
    </p>
  );
}

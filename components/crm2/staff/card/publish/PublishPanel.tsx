"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Images,
  Lock,
  Megaphone,
  Pencil,
  RefreshCw,
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
import { NO_WATERMARK_ERROR, syncListingPhotos, type PublishPhotoProgress } from "@/lib/crm2/publish-photos";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2PublishState } from "@/lib/crm2/queries/publish";
import { fmtDateTime } from "@/lib/format";

import { Note, Section, TextBlock } from "../parts";
import { PhotoProgress } from "./PhotoProgress";
import { PrivacyNotice } from "./PrivacyNotice";
import { listingStatusLabel, listingStatusTone } from "./listing-status";

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

const textareaClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * «Зар» таб — Staff хөрөнгийг nemi.mn дээр нийтийн зар болгох, буцаах.
 *
 * Зар нь хөрөнгөтэйгөө холбоотой: үнэ, үзүүлэлт, төлөв нь автоматаар дагана;
 * зөвхөн гарчиг, танилцуулга агентынх. Зургийг энэ браузерт PMC-ийн тамга дарж
 * байж нийтийн bucket руу хуулна (lib/crm2/publish-photos.ts).
 * Эрхийг RPC эцэслэн шалгана — энд зөвхөн тусгана.
 */
export function PublishPanel({
  panel,
  propertyId,
  state,
}: {
  panel: Crm2Panel;
  propertyId: string;
  state: Crm2PublishState;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const ids = React.useId();

  const [title, setTitle] = React.useState(state.title ?? state.defaultTitle);
  const [description, setDescription] = React.useState(state.description ?? state.defaultDescription);
  const [busy, setBusy] = React.useState<null | "publish" | "text" | "photos">(null);
  const [progress, setProgress] = React.useState<PublishPhotoProgress | null>(null);
  // Явцыг дарсан товчных нь хажууд харуулна (нийтлэх товч ¦ зураг шинэчлэх товч).
  const [progressAt, setProgressAt] = React.useState<"publish" | "photos">("photos");
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [unpublishOpen, setUnpublishOpen] = React.useState(false);

  const linked = !!state.listingId;
  const blocked = state.blockers.length > 0;
  const noWatermark = !state.watermark;
  const readOnly = !state.canPublish;
  const working = busy !== null;
  const canPublishNow = !readOnly && !blocked && !noWatermark && !working && title.trim().length > 0;
  const textDirty = title !== (state.title ?? "") || description !== (state.description ?? "");

  /** Зураг бүрд тамга дарж, нийтийн bucket руу хуулаад зард холбоно. */
  async function runPhotos(from: "publish" | "photos"): Promise<boolean> {
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
      });
      if (!res.ok) {
        setPhotoError(res.error);
        toast.error(res.error);
        return false;
      }
      toast.success(`${res.data.uploaded} зураг тамгатайгаар зард орлоо`);
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

  async function onPublish() {
    setBusy("publish");
    try {
      const res = await publishProperty({ property_id: propertyId, title: title.trim(), description: description.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(linked ? "Зар дахин нийтлэгдлээ" : "Зар нийтлэгдлээ", { description: "Одоо зургийг тамга дарж байршуулна." });
      // Тамгагүй зартай үлдэхгүйн тулд нийтэлсэн даруйд зургаа шинэчилнэ.
      await runPhotos("publish");
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
    try {
      const res = await updateListingText({ property_id: propertyId, title: title.trim(), description: description.trim() });
      if (!res.ok) {
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
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
            ) : (
              <>
                <p className="text-sm text-muted">
                  Staff-д бүртгэсэн энэ хөрөнгийг nemi.mn дээр нийтийн зар болгож болно. Зар нь хөрөнгөтэйгөө холбоотой үлдэж, үнэ,
                  үзүүлэлт, төлөв нь автоматаар шинэчлэгдэнэ.
                </p>
                <PrivacyNotice watermarkLabel={state.watermark?.label} />
              </>
            )}

            {blocked ? (
              <div className="space-y-1.5">
                <Note icon={TriangleAlert} tone="amber">
                  Нийтлэхэд дараах зүйл дутуу байна:
                </Note>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                  {state.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted">
                  Дутууг{" "}
                  <Link href={paths.property(propertyId, "info")} className="font-semibold text-brand-700 hover:underline">
                    «Үндсэн мэдээлэл»
                  </Link>{" "}
                  табаас нөхнө.
                </p>
              </div>
            ) : null}

            {noWatermark ? <Note icon={Stamp} tone="rose">{NO_WATERMARK_ERROR}</Note> : null}

            <div className="flex flex-wrap gap-2">
              {!readOnly && !state.published ? (
                <Button type="button" size="touch" disabled={!canPublishNow} onClick={() => void onPublish()}>
                  <Megaphone className="size-4" aria-hidden />
                  {busy === "publish" ? "Нийтэлж байна…" : linked ? "Дахин нийтлэх" : "Нийтэд зарлах"}
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

        <Section title="Зарын гарчиг, танилцуулга" icon={Pencil}>
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
                Зөвхөн эдгээр текстийг агент чөлөөтэй бичнэ. Хаяг, эзний мэдээлэл, дотоод тэмдэглэл бичихгүй — нийтэд харагдана.
              </p>
              <Field label="Гарчиг" htmlFor={`${ids}-title`} hint={`${title.length}/${TITLE_MAX}`}>
                <Input
                  id={`${ids}-title`}
                  value={title}
                  maxLength={TITLE_MAX}
                  disabled={working}
                  placeholder={state.defaultTitle || "Жишээ: Зайсан, 3 өрөө, 86 м²"}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Танилцуулга" htmlFor={`${ids}-desc`} hint={`${description.length}/${DESC_MAX}`}>
                <textarea
                  id={`${ids}-desc`}
                  value={description}
                  rows={6}
                  maxLength={DESC_MAX}
                  disabled={working}
                  placeholder={state.defaultDescription || "Хөрөнгийн давуу тал, орчин, орох боломжийг товч бичнэ."}
                  className={textareaClass}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              {linked ? (
                <Button type="button" size="touch" variant="outline" disabled={working || !title.trim() || !textDirty} onClick={() => void onSaveText()}>
                  <Save className="size-4" aria-hidden /> {busy === "text" ? "Хадгалж байна…" : "Зарын текст засах"}
                </Button>
              ) : (
                <p className="text-xs text-muted">Эдгээр текст нийтлэх үед зар дээр гарна. Дараа нь эндээс засаж болно.</p>
              )}
            </div>
          )}
        </Section>
      </div>

      <div className="min-w-0 space-y-4">
        <Section title="Зарын зураг" icon={Images}>
          <div className="space-y-3">
            <p className="text-sm text-ink">
              CRM-д <span className="font-semibold tabular-nums">{state.imageCount}</span> зураг · зард{" "}
              <span className="font-semibold tabular-nums">{state.photoCount}</span> зураг
            </p>
            <p className="text-xs text-muted">
              {state.watermark?.label
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
            {noWatermark ? <p className="text-xs text-rose-700">{NO_WATERMARK_ERROR}</p> : null}
          </div>
        </Section>

        {linked ? (
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

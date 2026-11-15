"use client";

import { createClient } from "@/lib/supabase/client";
import { setListingPhotos } from "@/lib/crm2/actions/publish";
import { getMediaSignedUrl } from "@/lib/crm2/storage";
import { fail, ok } from "@/lib/crm2/result";
import {
  PUBLIC_LISTINGS_BUCKET,
  listingPhotoPath,
  orderPublishMedia,
} from "@/lib/crm2/publish-photo-paths";
import { MAX_LISTING_PHOTOS } from "@/lib/crm2/schemas";
import { applyWatermark, type WatermarkConfig } from "@/lib/watermark";
import type { Crm2PublishMedia } from "@/lib/crm2/queries/publish";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * CRM-ийн зургийг нийтийн зар руу тамга дарж хуулах (зөвхөн хөтөч дээр).
 *
 * 1) CRM-ийн хаалттай зургийн signed URL-ээр эх файлыг татаж авна;
 * 2) lib/watermark.ts-ээр оффисын (PMC) тамга дарж JPEG болгоно;
 * 3) нийтийн «listings» bucket руу хуулж, public URL-ийг цуглуулна;
 * 4) crm2_set_listing_photos() RPC-д (server action) бүх URL-ийг нэг дор өгнө.
 *
 * Тамгагүй зураг нийтэд ХЭЗЭЭ Ч гарахгүй: тамга тохируулаагүй эсвэл тамга дарж
 * чадаагүй бол тухайн зургийг алгасахгүй, бүх үйлдлийг зогсооно. Дунд нь алдвал
 * энэ гүйлтэд хуулсан файлуудаа устгаад буцна — зарт дутуу зураг үлдэхгүй.
 */

export type PublishPhotoStep = "prepare" | "stamp" | "upload" | "save";

/** `done` нь тухайн алхмыг ДУУСГАСАН зургийн тоо (0 ≤ done ≤ total). */
export type PublishPhotoProgress = { step: PublishPhotoStep; done: number; total: number };

/** Тамга тохируулаагүй бол нийтлэхгүй — зарын зураг бүр тамгатай байх ёстой. */
export const NO_WATERMARK_ERROR =
  "Оффисын тамга тохируулаагүй байна. Тохиргоо → Усан тэмдэг хэсэгт тамгаа асаана уу.";

/** Нийтийн зарын зурагт зөвшөөрөгдөх хаяг (RPC/zod-ийн шалгуартай ижил). */
const PUBLIC_URL_RE = /^https:\/\/[^/]+\/storage\/v1\/object\/public\/listings\//;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Замын төгсгөлийн файлын нэр — алдааны текстэд зургийг нэрлэхэд. */
function fileNameOf(storagePath: string): string {
  return storagePath.split("/").pop() || "зураг";
}

/** Хуулахад гарсан алдааны монгол текст (storage.ts-ийн дүрэмтэй ижил). */
function uploadErrorText(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403")) {
    return "Зарын зураг хуулах эрхгүй байна.";
  }
  if (m.includes("exceeded") || m.includes("too large") || m.includes("413")) return "Зураг хэт том байна.";
  return "Зураг хуулахад алдаа гарлаа. Дахин оролдоно уу.";
}

export async function syncListingPhotos(opts: {
  propertyId: string;
  media: Crm2PublishMedia[];
  watermark: WatermarkConfig | null;
  onProgress?: (p: PublishPhotoProgress) => void;
}): Promise<Crm2Result<{ uploaded: number }>> {
  const { propertyId, media, watermark, onProgress } = opts;
  // Тамгагүй зураг нийтэд гаргахгүй — энэ бол хатуу шаардлага.
  if (!watermark) return fail(NO_WATERMARK_ERROR);

  // Нүүр зураг эхэнд; RPC-ийн хязгаараас илүү зургийг зард оруулахгүй.
  const ordered = orderPublishMedia(media).slice(0, MAX_LISTING_PHOTOS);
  const total = ordered.length;
  // Хоосон жагсаалт нь «зарын бүх зургийг устга» гэсэн үг болно. Зургийн жагсаалт
  // уншигдаагүй үед (getPublishState түр алдаанд ч media: [] буцаадаг) амьд зарын
  // зургийг арчихгүйн тулд энд зогсоно. DB ч хоосон жагсаалтыг татгалзана — энэ бол
  // хэрэглэгчид ойлгомжтой урд талын хаалт.
  if (total === 0) {
    return fail("Хөрөнгийн зургийг уншиж чадсангүй. Зарын зургийг хөндөөгүй — дахин оролдоно уу.");
  }

  const supabase = createClient();
  const bucket = supabase.storage.from(PUBLIC_LISTINGS_BUCKET);
  /** Энэ гүйлтэд хуулсан замууд — алдаа гарвал буцааж устгана. */
  const uploaded: string[] = [];
  const urls: string[] = [];

  /** Хуулсан файлаа устгаад алдаа буцаана (зарт дутуу зураг үлдээхгүй). */
  async function abort(error: string): Promise<Crm2Result<{ uploaded: number }>> {
    if (uploaded.length) {
      const rm = await bucket.remove(uploaded);
      if (rm.error) console.error("crm2 syncListingPhotos буцаалт:", rm.error.message);
    }
    return fail(error);
  }

  onProgress?.({ step: "prepare", done: 0, total });

  for (let i = 0; i < total; i++) {
    const item = ordered[i];
    const name = fileNameOf(item.storagePath);
    const nth = `${i + 1}-р зураг`;

    // 1) Эх зургийг signed URL-ээр татаж File болгоно.
    const signed = await getMediaSignedUrl(item.storagePath);
    if (!signed) return abort(`${nth} («${name}») — эх зургийг уншиж чадсангүй. Дахин оролдоно уу.`);
    let file: File;
    try {
      const res = await fetch(signed);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("хоосон файл");
      file = new File([blob], name, { type: blob.type || "image/jpeg" });
    } catch (e) {
      console.error("crm2 syncListingPhotos татах:", e);
      return abort(`${nth} («${name}») — эх зургийг татаж чадсангүй. Дахин оролдоно уу.`);
    }
    onProgress?.({ step: "prepare", done: i + 1, total });

    // 2) Тамга. HEIC г.м. хөтөч задалж чадахгүй формат алдаа шиднэ — алгасахгүй, зогсоно.
    let stamped: File;
    try {
      stamped = await applyWatermark(file, watermark);
    } catch (e) {
      console.error("crm2 syncListingPhotos тамга:", e);
      return abort(
        `${nth} («${name}») — тамга дарж чадсангүй: хөтөч энэ форматыг (жишээ нь HEIC) задалж чадахгүй байна. ` +
          `Уг зургийг JPEG болгож хөрвүүлээд хөрөнгийн зураг руу дахин оруулж, дараа нь зургийг шинэчилнэ үү.`
      );
    }
    onProgress?.({ step: "stamp", done: i + 1, total });

    // 3) Нийтийн bucket руу. Ижил зам дээр дахин бичих боломжгүй (storage дүрмээр
    // зөвхөн эзэмшигч нь update/delete хийнэ) тул гүйлт бүрт шинэ нэр өгнө.
    const path = listingPhotoPath(propertyId, i, newId());
    const up = await bucket.upload(path, stamped, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) {
      console.error("crm2 syncListingPhotos upload:", up.error.message);
      return abort(`${nth} («${name}») — ${uploadErrorText(up.error.message)}`);
    }
    uploaded.push(path);

    const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
    if (!PUBLIC_URL_RE.test(publicUrl)) {
      // Тохиргооны алдаа (https биш/өөр bucket) — RPC ч татгалзана, эрт зогсоох нь дээр.
      console.error("crm2 syncListingPhotos нийтийн хаяг буруу:", publicUrl);
      return abort("Зарын зургийн хаяг буруу байна. Системийн тохиргоог шалгуулна уу.");
    }
    urls.push(publicUrl);
    onProgress?.({ step: "upload", done: i + 1, total });
  }

  // 4) Зарын зургийг бүхэлд нь солино (RPC хуучин мөрийг устгаад шинээр бичнэ).
  onProgress?.({ step: "save", done: total, total });
  const saved = await setListingPhotos({ property_id: propertyId, urls });
  if (!saved.ok) return abort(saved.error);

  // Өмнөх синкийн үлдэгдэл файлыг ЗОРИУД цэвэрлэхгүй. Нэг хөрөнгийн зургийг хоёр
  // эрхтэй хэрэглэгч (жишээ нь агент ба оффисын менежер) зэрэг шинэчилбэл хожуу
  // дуусах гүйлтийн цэвэрлэгээ нөгөөгийн сая хадгалсан, зард ИДЭВХТЭЙ файлыг устгаж,
  // амьд зар зураггүй үлдэх эрсдэлтэй. Үлдэгдэл объект зартай холбоогүй тул зөвхөн
  // сангийн зай эзэлнэ — тэр нь амьд зураг устгахаас хамаагүй хямд. Энэ гүйлтэд
  // хуулсан файлыг зөвхөн алдаа/зогсолтын үед (abort) л устгана.
  return ok({ uploaded: urls.length });
}

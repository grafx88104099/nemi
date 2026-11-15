/**
 * Нийтийн зарын зургийн зам ба дараалал — цэвэр модуль (DOM-гүй, unit тесттэй).
 *
 * CRM-ийн зураг (crm2-media, хаалттай) → тамга дарагдсаны дараа нийтийн
 * «listings» bucket руу хуулагдана. Зарын зургийн дараалал нь CRM-ийн
 * дарааллыг (нүүр зураг эхэнд) давтана — зарын эхний зураг нь үндсэн зураг.
 */

/** Нийтэд харагдах зарын зургийн bucket (storage/v1/object/public/listings/...). */
export const PUBLIC_LISTINGS_BUCKET = "listings";

/**
 * Зарын зургийн storage зам: `crm2/{хөрөнгө}/{дугаар}-{id}.jpg`.
 * Дугаарыг 0-оор гүйцээснээр storage дээр дараалал нь нэрээрээ зөв эрэмбэлэгдэнэ.
 * Тамга дарсан үр дүн үргэлж JPEG (lib/watermark.ts) тул өргөтгөл нь .jpg.
 */
export function listingPhotoPath(propertyId: string, index: number, id: string): string {
  return `crm2/${propertyId}/${String(index).padStart(2, "0")}-${id}.jpg`;
}

/**
 * Зарт гарах дараалал: нүүр зураг эхэнд, дараа нь sortOrder өсөхөөр.
 * Тэнцүү түлхүүртэй зургууд өгсөн дарааллаараа үлдэнэ (тогтвортой эрэмбэ —
 * дуудагч нь created_at-аар эрэмбэлсэн мөрөө өгнө). Эх массивыг өөрчлөхгүй.
 */
export function orderPublishMedia<T extends { sortOrder: number; isCover: boolean }>(media: T[]): T[] {
  return media
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.isCover !== b.item.isCover) return a.item.isCover ? -1 : 1;
      if (a.item.sortOrder !== b.item.sortOrder) return a.item.sortOrder - b.item.sortOrder;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

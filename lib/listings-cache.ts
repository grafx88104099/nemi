import { updateTag } from "next/cache";

/**
 * Нийтийн зарын кэшийн шошго — нүүр хуудасны «Шинэ зарууд», «Онцлох зарууд»,
 * «AI оноо» эрэмбийн боломж (lib/queries.ts-ийн unstable_cache) бүгд үүнийг ашиглана.
 */
export const LISTINGS_TAG = "listings";

/**
 * Зар нэмэх/засах/устгах/нийтлэх Server Action-ы дараа дуудна: дараагийн хүсэлт
 * шинэ өгөгдлийг хүлээж авна (агент зараа нийтлээд нүүр хуудаснаас шууд харна).
 *
 * ЗӨВХӨН Server Action дотор (updateTag-ийн шаардлага). Staff-аас нийтэлсэн зар
 * DB-ийн триггерээр шинэчлэгддэг тул энд хүрэхгүй — тэдгээрийг кэшийн богино
 * хугацаа (60 сек) барина.
 */
export function expirePublicListings(): void {
  updateTag(LISTINGS_TAG);
}

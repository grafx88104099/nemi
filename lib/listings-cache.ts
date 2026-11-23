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
 * ЗӨВХӨН Server Action дотор (updateTag-ийн шаардлага; route handler-т
 * revalidateTag(LISTINGS_TAG, "max")). Staff-ийн үйлдлүүд (төлөв, үнэ, гэрээ)
 * DB триггерээр зарыг өөрчилдөг ч Server Action-аас дуудагддаг тул энийг
 * дууддаг. Жинхэнэ Next-ээс гадуурх бичилт — pg_cron «crm2-daily» (гэрээ
 * дуусгах), suspend_office/reactivate_office RPC — зөвхөн 60 секундийн
 * stale-while-revalidate-д найдана: хугацаа өнгөрсний дараах эхний зочинд
 * хуучин хуулбар нэг удаа очиж, ард нь шинэчлэгдэнэ.
 */
export function expirePublicListings(): void {
  updateTag(LISTINGS_TAG);
}

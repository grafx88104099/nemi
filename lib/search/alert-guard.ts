/**
 * Хадгалсан хайлтын сэрэмжлүүлэг — нэг хайлтад UTC өдөрт НЭГ л мэдэгдэл.
 *
 * ЯАГААД: /api/cron/search-alerts нь «сүүлийн 24 цагт нэмэгдсэн зар»-ыг тоолдог тул
 * route-ыг дахин дуудах бүрд (гараар, давхар cron) ижил мэдэгдэл давтагддаг байв.
 * Схем өөрчлөхгүйн тулд байгаа rate_limit_hit (UTC epoch-д тэгшилсэн цонх, service role)
 * -ийг ашиглана: `search-alert:<id>` түлхүүрт 86400 с-ийн цонхонд 1 удаа.
 * RPC алдаа гарвал давхар мэдэгдэл илгээхээс сэргийлж ТУХАЙН хайлтыг алгасна (маргааш дахин).
 */
export const SEARCH_ALERT_WINDOW_SECONDS = 86_400;

export type AlertRateRpc = (
  fn: "rate_limit_hit",
  args: { p_key: string; p_window_seconds: number; p_max: number }
) => PromiseLike<{ data: unknown; error: unknown }>;

export function searchAlertKey(savedSearchId: string): string {
  return `search-alert:${savedSearchId}`;
}

/** true = өнөөдөр энэ хайлтад мэдэгдэл илгээж болно (цонхыг эзэлсэн). */
export async function claimSearchAlert(rpc: AlertRateRpc, savedSearchId: string): Promise<boolean> {
  try {
    const { data, error } = await rpc("rate_limit_hit", {
      p_key: searchAlertKey(savedSearchId),
      p_window_seconds: SEARCH_ALERT_WINDOW_SECONDS,
      p_max: 1,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

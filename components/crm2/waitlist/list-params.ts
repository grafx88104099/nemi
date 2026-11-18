import { daysSince } from "@/lib/format";

/**
 * T10 Хүлээлгийн жагсаалтын URL параметр ↔ шүүлтүүр (цэвэр модуль — сервер
 * дэлгэц, клиент шүүлтүүр, тест). Буруу утгыг чимээгүй хасна.
 *
 *   ?mine=1         — зөвхөн өөрийн хариуцсан харилцагчид
 *   ?match=yes|no   — тохирох хөрөнгөтэй / тохирохгүй (өгөөгүй бол бүгд)
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type WaitlistParams = {
  onlyMine: boolean;
  /** null — бүгд; true — тохирохтой нь; false — тохирохгүй нь. */
  withMatches: boolean | null;
};

/** «Цэвэрлэх»-д хамаарах параметрүүд. */
export const WAITLIST_FILTER_KEYS = ["mine", "match"] as const;

export const WAITLIST_MINE_ON = "1";

/** «Зөвхөн минийх» сонголт. */
export const WAITLIST_MINE_OPTIONS = [
  { value: "", label: "Бүх хүлээлт" },
  { value: WAITLIST_MINE_ON, label: "Зөвхөн минийх" },
];

/** Тохирол байгаа эсэхээр шүүх. */
export const WAITLIST_MATCH_OPTIONS = [
  { value: "", label: "Бүгд" },
  { value: "yes", label: "Тохирохтой" },
  { value: "no", label: "Тохирохгүй" },
];

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

export function parseWaitlistParams(sp: RawSearchParams | null | undefined): WaitlistParams {
  const src = sp ?? {};
  const match = one(src.match);
  return {
    onlyMine: one(src.mine) === WAITLIST_MINE_ON,
    withMatches: match === "yes" ? true : match === "no" ? false : null,
  };
}

/** Шүүлтүүр сонгогдсон эсэх (хоосон төлөвийн бичвэрт). */
export function hasWaitlistFilters(p: WaitlistParams): boolean {
  return p.onlyMine || p.withMatches !== null;
}

/** Хэр хугацаа хүлээснийг товчоор: «Өнөөдөр», «14 хоног», «3 сар», «2 жил». */
export function waitingText(iso: string, now: number = Date.now()): string {
  const days = daysSince(iso, new Date(now));
  if (!Number.isFinite(days) || days <= 0) return "Өнөөдөр";
  if (days < 30) return `${days} хоног`;
  if (days < 365) return `${Math.floor(days / 30)} сар`;
  return `${Math.floor(days / 365)} жил`;
}

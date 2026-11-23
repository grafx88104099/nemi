/**
 * Санах ойн (instance бүрт) fixed-window хязгаарлагч — best-effort. Юуг ч
 * хадгалж/логлохгүй; түлхүүр (жишээ нь IP) зөвхөн процессын Map-д цонхны турш байна.
 * Хатуу хязгаар нь DB талд (listing_view_record).
 */
export type WindowLimiter = {
  /** true = зөвшөөрнө (тоолсон), false = хязгаар хэтэрсэн. */
  hit: (key: string, now?: number) => boolean;
  size: () => number;
};

export function createWindowLimiter({
  limit,
  windowMs,
  maxKeys = 5000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): WindowLimiter {
  const map = new Map<string, { n: number; reset: number }>();

  function prune(now: number) {
    for (const [k, v] of map) if (v.reset <= now) map.delete(k);
    if (map.size >= maxKeys) map.clear();
  }

  return {
    hit(key, now = Date.now()) {
      const cur = map.get(key);
      if (!cur || cur.reset <= now) {
        if (!cur && map.size >= maxKeys) prune(now);
        map.set(key, { n: 1, reset: now + windowMs });
        return true;
      }
      cur.n += 1;
      return cur.n <= limit;
    },
    size: () => map.size,
  };
}

/** Эхний x-forwarded-for hop, эсвэл x-real-ip, эсвэл «?». */
export function clientKey(get: (name: string) => string | null): string {
  const xff = get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  const real = get("x-real-ip")?.trim();
  return real || "?";
}

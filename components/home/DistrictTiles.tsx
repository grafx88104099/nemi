import Link from "next/link";

import { fmtPriceShort } from "@/lib/format";
import { OUTER_DISTRICTS, sortCityTiles, type PlatformStats } from "@/lib/platform-stats-core";

const href = (d: string) => `/listings?district=${encodeURIComponent(d)}`;

/**
 * «Дүүргээр хайх»: хотын 6 дүүрэг тоогоор эрэмбэлсэн (тэнцвэл CITY дараалал).
 * м² медиан зөвхөн орон сууцны худалдааны зар n≥5 үед (зарын үнэ, гүйлгээ биш).
 * stats null бол тоогүй хавтан.
 */
export function DistrictTiles({ stats }: { stats: PlatformStats | null }) {
  const tiles = sortCityTiles(stats);
  const outer = OUTER_DISTRICTS.map((d) => ({ d, n: stats?.districts.find((x) => x.district === d)?.count ?? 0 }));

  return (
    <section className="mx-auto max-w-7xl px-4 pt-12" aria-labelledby="districts-heading">
      <h2 id="districts-heading" className="text-2xl font-bold text-ink">
        Дүүргээр хайх
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.district}>
            {/* aria-label ЗОРИУДААР үгүй: харагдах бичвэр (дүүрэг, тоо/«Удахгүй», м² медиан) нэр болно. */}
            <Link
              href={href(t.district)}
              className="flex h-full min-h-[88px] flex-col justify-between gap-1 rounded-card border border-line bg-surface p-3 transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-4"
            >
              <span className="text-[15px] font-bold leading-tight text-ink [overflow-wrap:anywhere] sm:text-base">
                {t.district}
              </span>
              {stats ? (
                <span className="text-sm text-muted tabular-nums">{t.count > 0 ? `${t.count} зар` : "Удахгүй"}</span>
              ) : null}
              {stats && t.medianPpm != null ? (
                <span
                  className="text-xs text-muted tabular-nums"
                  title={`Орон сууцны худалдааны зарын м² үнийн медиан (зарын үнэ), ${t.aptSaleCount} зар`}
                >
                  ≈ <span className="whitespace-nowrap">{fmtPriceShort(t.medianPpm)}/м²</span>{" "}
                  <span className="whitespace-nowrap">(зарын үнэ)</span> · орон сууц
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-muted">
        <span>Алслагдсан дүүрэг:</span>
        {outer.map((o, i) => (
          <span key={o.d} className="inline-flex items-center">
            {i > 0 ? <span aria-hidden className="mr-1">·</span> : null}
            <Link href={href(o.d)} className="inline-flex min-h-11 items-center hover:text-ink hover:underline sm:min-h-0">
              {o.d}
              {o.n > 0 ? <span className="ml-1 tabular-nums">({o.n})</span> : null}
            </Link>
          </span>
        ))}
      </p>
    </section>
  );
}

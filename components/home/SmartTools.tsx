import Link from "next/link";
import { Calculator, MapPinned, Sparkles, type LucideIcon } from "lucide-react";

import { fmtPriceShort } from "@/lib/format";
import { CITY_DISTRICTS, type PlatformStats } from "@/lib/platform-stats-core";

const CARD =
  "group flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function Icon({ icon: I }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink">
      <I className="size-5" aria-hidden />
    </span>
  );
}

/**
 * «Ухаалаг хэрэгслүүд»: AI үнэлгээ, 8%-ийн тооцоолуур, дүүргийн м² медиан (текст
 * жагсаалт; chart v2-т үгүй). Медиан нь ЗАРЫН үнэ (гүйлгээ биш), n≥5 орон сууцны худалдаа.
 */
export function SmartTools({ stats }: { stats: PlatformStats | null }) {
  const medians = CITY_DISTRICTS.map((d) => stats?.districts.find((x) => x.district === d)).filter(
    (x): x is NonNullable<typeof x> => x != null && x.medianPpm != null
  );

  return (
    <section className="mx-auto max-w-7xl px-4 pb-14" aria-labelledby="tools-heading">
      <h2 id="tools-heading" className="text-2xl font-bold text-ink">
        Ухаалаг хэрэгслүүд
      </h2>
      <ul className="mt-5 grid gap-3 md:grid-cols-3">
        <li>
          <Link href="/my-home" className={CARD}>
            <Icon icon={Sparkles} />
            <span className="font-bold text-ink">AI үнэлгээ</span>
            <span className="text-sm text-muted">Байрныхаа зах зээлийн үнийг үнэгүй мэдэх</span>
          </Link>
        </li>
        <li>
          <Link href="/home-loans" className={CARD}>
            <Icon icon={Calculator} />
            <span className="font-bold text-ink">8%-ийн ипотекийн тооцоолуур</span>
            <span className="text-sm text-muted">
              Сарын төлбөрөө тооцоолох. Тооцоолол — зээлийн шийдвэрийг банк гаргана.
            </span>
          </Link>
        </li>
        <li>
          <Link href={`/listings?deal=sale&type=${encodeURIComponent("Орон сууц")}`} className={CARD}>
            <Icon icon={MapPinned} />
            <span className="font-bold text-ink">Дүүргийн м² үнэ</span>
            {medians.length > 0 ? (
              <>
                <span className="space-y-0.5 text-sm text-ink">
                  {medians.map((m) => (
                    <span key={m.district} className="block tabular-nums">
                      {m.district} · м² ≈ <span className="whitespace-nowrap">{fmtPriceShort(m.medianPpm!)}</span>
                    </span>
                  ))}
                </span>
                <span className="text-xs text-muted">
                  Орон сууцны худалдааны зарын үнийн медиан (n≥5), гүйлгээний үнэ биш
                </span>
              </>
            ) : (
              <span className="text-sm text-muted">Мэдээлэл цуглуулж байна</span>
            )}
          </Link>
        </li>
      </ul>
    </section>
  );
}

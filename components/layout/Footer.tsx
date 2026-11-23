import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { getPlatformStats } from "@/lib/platform-stats";
import { CITY_DISTRICTS } from "@/lib/platform-stats-core";

const districtHref = (d: string) => `/listings?district=${encodeURIComponent(d)}`;

const cols: { title: string; links: [string, string][] }[] = [
  {
    // Энгийн (follow) холбоос — дүүргийн хайлтын хуудсуудад SEO-ийн дотоод холбоос.
    title: "Дүүргээр",
    links: CITY_DISTRICTS.map((d): [string, string] => [districtHref(d), d]),
  },
  {
    title: "Хайх",
    links: [
      ["/listings", "Зар хайх"],
      ["/agents", "Агент хайх"],
      ["/home-loans", "Орон сууцны зээл"],
    ],
  },
  {
    title: "Мэргэжилтнүүд",
    links: [
      ["/partners", "Нэми Премьер"],
      ["/office-signup", "Оффис нээх"],
      ["/agent/login", "Агентаар нэвтрэх"],
      ["/office/login", "Оффисоор нэвтрэх"],
      ["/agent/rental-manager", "Түрээс удирдах"],
    ],
  },
  {
    title: "Нэми",
    links: [
      ["/news", "Мэдээ ба блог"],
      ["/about", "Бидний тухай"],
      ["/help", "Тусламжийн төв"],
      ["/contact", "Холбоо барих"],
      ["/admin/login", "Системийн админ"],
    ],
  },
];

/** Гар утсанд ≥44px өндөр (min-h-11), md+ нягт. */
const LINK = "flex min-h-11 items-center text-sm text-white/70 hover:text-white md:min-h-0 md:py-1";

/**
 * Нийтийн сайтын footer (зөвхөн app/(site)/layout.tsx). Статистик нь БОДИТ тоо
 * (lib/platform-stats, кэштэй); алдаа гарвал тоо нуугдана. Босгоос доош тоо харуулахгүй.
 */
export async function Footer() {
  const stats = await getPlatformStats().catch(() => null);
  const items: { n: number; label: string }[] = [];
  if (stats) {
    if (stats.districtsWithListings > 0) items.push({ n: stats.districtsWithListings, label: "дүүрэгт зар" });
    if (stats.verifiedAgents >= 10) items.push({ n: stats.verifiedAgents, label: "баталгаажсан агент" });
    if (stats.partnerOffices >= 3) items.push({ n: stats.partnerOffices, label: "хамтрагч оффис" });
  }

  return (
    <>
      {/* Чимэглэлийн тэнгэрийн шугам — статик файл (inline SVG-г давтахгүй). */}
      <div aria-hidden className="mt-20 bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element -- жижиг статик SVG, оновчлол хэрэггүй */}
        <img
          src="/brand/skyline-dawn.svg"
          alt=""
          width={1440}
          height={240}
          loading="lazy"
          decoding="async"
          // Зургийн 6:1 харьцаагаар (h-auto) → нуруу, байрны орой тайрагдахгүй; max-h-аас
          // өргөн дэлгэцэд зөвхөн дээд тэнгэр тайрагдана (2560px-д ч нурууны орой бүтэн).
          className="block h-auto max-h-[260px] w-full object-cover object-bottom"
        />
      </div>
      <footer className="bg-ink pb-[var(--mobile-tabbar-h,0px)] text-white/80">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)]">
            <div className="space-y-4 sm:col-span-2 md:col-span-1">
              <div className="inline-flex flex-col">
                <Logo color="#fff" className="h-7 w-auto" />
                <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
                  Улаанбаатар
                </span>
              </div>
              <p className="text-sm text-white/70">
                Улаанбаатарын үл хөдлөх хөрөнгийн зар, агентууд нэг дор. Нэми бол хувийн хэвшлийн платформ.
              </p>
              <Link
                href="/office-signup"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-logo hover:underline"
              >
                <Building2 className="size-4" aria-hidden /> Оффис болж нэгдэх
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              {items.length > 0 ? (
                <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm">
                  {items.map((it) => (
                    <li key={it.label}>
                      <b className="block font-extrabold text-white tabular-nums">{it.n}</b>
                      <span className="text-white/70">{it.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {cols.map((c) => (
              <nav key={c.title} aria-label={c.title}>
                <h4 className="mb-1 text-sm font-semibold text-white">{c.title}</h4>
                <ul>
                  {c.links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className={LINK}>
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Нэми технологи · Улаанбаатар</span>
            <div className="flex gap-4">
              <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-white sm:min-h-0">
                Үйлчилгээний нөхцөл
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-white sm:min-h-0">
                Нууцлал
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

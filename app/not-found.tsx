import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { PanelAwareNotFound } from "@/components/layout/PanelAwareNotFound";
import SiteNotFound from "./(site)/not-found";

/**
 * Root 404 — ямар ч маршрутад таараагүй хаяг (буруу бичсэн, хуучин холбоос) болон
 * өөрийн not-found-гүй сегментийн notFound(). Next-ийн англи хуудасны оронд сайтын
 * өнгө төрх, монгол бичвэр. Root layout-д Topbar байхгүй (cookie уншихгүй, статик
 * хэвээр) тул энгийн толгой + (site)/not-found-ийн агуулга. Next 404 дээр noindex-ийг өөрөө нэмнэ.
 * /agent, /office доорх буруу хаягт (суулгасан апп) PanelAwareNotFound панелийн нүүр рүү буцаана.
 */
export default function RootNotFound() {
  return (
    <div data-surface="site" className="flex min-h-full flex-1 flex-col">
      <title>Хуудас олдсонгүй — Нэми</title>
      <PanelAwareNotFound>
        <header className="border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
            <Link href="/" aria-label="Нэми — нүүр хуудас" className="inline-flex min-h-11 items-center text-ink">
              <Logo color="currentColor" className="h-7 w-auto text-ink" />
            </Link>
            <nav aria-label="Үндсэн" className="flex items-center gap-1 text-sm font-semibold">
              <Link href="/listings" className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-ink hover:bg-surface-2">
                Зар
              </Link>
              <Link href="/agents" className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-ink hover:bg-surface-2">
                Агентууд
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <SiteNotFound />
        </main>
      </PanelAwareNotFound>
    </div>
  );
}

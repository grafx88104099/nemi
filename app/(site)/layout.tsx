import type { Viewport } from "next";

import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { FavoritesSync } from "@/components/listings/FavoritesSync";

/**
 * Нийтийн сайт: viewportFit "cover" нь iOS-д env(safe-area-inset-*)-ийг идэвхжүүлнэ —
 * header (дээд), энэ wrapper (зүүн/баруун), MobileTabBar болон sheet (доод) зай авна.
 * Шинэ fixed элемент нэмбэл inset-ээ өөрөө тооцно.
 */
export const viewport: Viewport = { themeColor: "#fbf7f1", viewportFit: "cover" };

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-surface="site" — «Нарлаг хот» токенуудын хүрээ (app/globals.css). CRM-д байхгүй.
    <div
      data-surface="site"
      className="flex min-h-full flex-1 flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <Topbar site />
      <FavoritesSync />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

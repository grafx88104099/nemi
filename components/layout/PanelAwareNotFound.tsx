"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import { panelHomeFor } from "@/lib/panel-home";
import { buttonClasses } from "@/components/ui/button";

const noop = () => () => {};

/**
 * Root 404 (app/not-found.tsx) нь статикаар prerender хийгддэг тул замыг серверт мэдэхгүй. /agent, /office
 * доорх буруу хаягт (суулгасан апп) нийтийн сайтын холбоосын оронд панелийн нүүр рүү буцах товч харуулна.
 * Замыг hydration-ий ДАРАА уншина (server snapshot = null) — hydration зөрөхгүй.
 */
export function PanelAwareNotFound({ children }: { children: React.ReactNode }) {
  const pathname = useSyncExternalStore(
    noop,
    () => window.location.pathname,
    () => null
  );
  const home = panelHomeFor(pathname);
  if (!home) return <>{children}</>;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16 pt-[calc(env(safe-area-inset-top)+4rem)]">
      <section className="max-w-md text-center" aria-labelledby="panel-nf-h1">
        <p className="text-sm font-semibold text-muted">404</p>
        <h1 id="panel-nf-h1" className="mt-1 text-2xl font-extrabold text-ink">
          Хуудас олдсонгүй
        </h1>
        <p className="mt-3 text-muted">Холбоос буруу эсвэл хуудас устсан байж магадгүй.</p>
        <Link href={home.href} className={buttonClasses("primary", "md", "mt-6")}>
          {home.label}
        </Link>
      </section>
    </main>
  );
}

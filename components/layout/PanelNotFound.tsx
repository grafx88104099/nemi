import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import type { PanelHome } from "@/lib/panel-home";

/** Агент/оффисын панелийн notFound() — панелийн толгой хэвээр, панелийн нүүр рүү буцах товчтой. */
export function PanelNotFound({ home }: { home: PanelHome | null }) {
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center" aria-labelledby="panel-nf-h1">
      <p className="text-sm font-semibold text-muted">404</p>
      <h1 id="panel-nf-h1" className="mt-1 text-2xl font-extrabold text-ink">
        Хуудас олдсонгүй
      </h1>
      <p className="mt-3 text-muted">Бичлэг устсан, танд харагдах эрхгүй, эсвэл холбоос буруу байж магадгүй.</p>
      {home ? (
        <Link href={home.href} className={buttonClasses("primary", "md", "mt-6")}>
          {home.label}
        </Link>
      ) : null}
    </section>
  );
}

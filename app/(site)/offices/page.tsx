import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import { getOfficeDirectory } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { withBrand } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: withBrand("Үл хөдлөхийн оффисууд"),
  description: "Нэми дээрх үл хөдлөхийн оффисууд — агентууд, идэвхтэй зар, холбоо барих мэдээлэл.",
  alternates: { canonical: "/offices" },
};

/** Гар утасны цэсний «Оффисууд» — түдгэлзээгүй оффисуудын жагсаалт. */
export default async function OfficesPage() {
  const offices = await getOfficeDirectory();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink sm:text-3xl">
        <Building2 className="size-6 shrink-0 text-brand-600" aria-hidden /> Оффисууд
      </h1>
      <p className="mt-1 text-sm text-muted">Оффис бүрийн агентууд, идэвхтэй зар, холбоо барих мэдээлэл.</p>

      {offices.length === 0 ? (
        <p className="py-16 text-center text-muted">Одоогоор нийтэд харагдах оффис алга.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {offices.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
              <Link href={`/offices/${o.id}`} className="flex items-center gap-3">
                <Avatar initials={o.logo ?? o.name.slice(0, 2)} src={o.logo_url} color={o.color ?? "#C2410C"} size="lg" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-bold text-ink">
                    <span className="truncate">{o.name}</span>
                    {o.verified ? <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-label="Баталгаажсан" /> : null}
                  </div>
                  <div className="text-sm text-muted">
                    {o.agents_count} агент · {o.listings_count} зар
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
              {o.address ? (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 break-words">{o.address}</span>
                </p>
              ) : null}
              {o.phone || o.email ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {o.phone ? (
                    <a
                      href={`tel:${o.phone}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2"
                    >
                      <Phone className="size-4" aria-hidden /> {o.phone}
                    </a>
                  ) : null}
                  {o.email ? (
                    <a
                      href={`mailto:${o.email}`}
                      className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2"
                    >
                      <Mail className="size-4 shrink-0" aria-hidden /> <span className="truncate">{o.email}</span>
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

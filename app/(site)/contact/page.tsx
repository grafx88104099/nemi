import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { getOfficeDirectory } from "@/lib/queries";
import { withBrand } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: withBrand("Холбоо барих"),
  description: "Нэми дээрх үл хөдлөхийн оффисуудын утас, и-мэйл, хаяг. Зарын талаар агенттай шууд холбогдоно.",
  alternates: { canonical: "/contact" },
};

/**
 * Холбоо барих — оффисын БОДИТ утас/и-мэйл/хаягийг DB-ээс (оффисын нийтийн
 * профайлд харагддаг талбар) харуулна. Мэдээлэлгүй бол нуух — жишээ дугаар бичихгүй.
 */
export default async function ContactPage() {
  const offices = (await getOfficeDirectory()).filter((o) => o.phone || o.email || o.address);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Холбоо барих</h1>
      <p className="mt-2 text-muted">
        Тодорхой зарын талаар асуух бол зарын хуудаснаас агенттай нь шууд холбогдоно уу. Оффистой холбогдох:
      </p>
      {offices.length === 0 ? (
        <p className="mt-6 text-muted">
          Холбоо барих мэдээлэл одоогоор оруулаагүй байна.{" "}
          <Link href="/agents" className="font-semibold text-brand-700 hover:underline">
            Агентуудыг харах
          </Link>
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {offices.map((o) => (
            <Card key={o.id}>
              <CardBody className="space-y-2">
                <Link href={`/offices/${o.id}`} className="font-bold text-ink hover:underline">
                  {o.name}
                </Link>
                {o.address ? (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    <span className="min-w-0 break-words">{o.address}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
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
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

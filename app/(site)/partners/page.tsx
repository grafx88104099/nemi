import type { Metadata } from "next";
import { Check, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { withBrand } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: withBrand("Мэргэжилтнүүдэд зориулсан багц"),
  description: "Үл хөдлөхийн оффис, агентуудад зориулсан Нэми-ийн багцууд.",
  alternates: { canonical: "/partners" },
};

/**
 * Premier-ийн төлбөр (QPay) нийтэд нээгдээгүй, «AI тайлбар үүсгэгч» хэрэгжээгүй тул
 * худал амлахгүй: Premier «Тун удахгүй», товч нь холбоо барих руу.
 */
const PLANS = [
  {
    name: "Үндсэн",
    price: "Үнэгүй",
    features: ["Зар оруулах", "Лид хүлээн авах", "Үндсэн статистик"],
    cta: "Эхлэх",
    href: "/office-signup",
    highlight: false,
    soon: false,
  },
  {
    name: "Premier",
    price: "99,000₮/сар",
    features: ["Бүх Үндсэн боломж", "Онцлох байршил", "Premier тэмдэг", "Тэргүүлэх дэмжлэг"],
    cta: "Сонирхож байна — холбогдох",
    href: "/contact",
    highlight: true,
    soon: true,
  },
];

export default function PartnersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
          <Sparkles className="size-4" /> Нэми Premier
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-ink">Мэргэжилтнүүдэд зориулсан багц</h1>
        <p className="mt-2 text-muted">Илүү олон үзэлт, илүү олон лид, илүү хурдан хэлцэл.</p>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`rounded-2xl border bg-surface p-6 shadow-sm ${p.highlight ? "border-brand-300 ring-2 ring-brand-200" : "border-line"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{p.name}</h2>
              {p.highlight && <Sparkles className="size-4 text-brand-500" aria-hidden />}
              {p.soon ? <Badge tone="neutral">Тун удахгүй</Badge> : null}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-ink">{p.price}</div>
            <ul className="mt-4 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-ink">
                  <Check className="size-4 text-emerald-600" /> {f}
                </li>
              ))}
            </ul>
            <ButtonLink
              href={p.href}
              variant={p.highlight ? "primary" : "outline"}
              className="mt-6 w-full"
            >
              {p.cta}
            </ButtonLink>
          </div>
        ))}
      </div>
    </div>
  );
}

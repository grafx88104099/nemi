import type { Metadata } from "next";
import { Sparkles, Star, TrendingUp, ShieldAlert, FileText, type LucideIcon } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hasAiScores } from "@/lib/queries";
import { withBrand } from "@/lib/seo/site";

type Feature = { icon: LucideIcon; t: string; d: string; live: boolean };

/**
 * Зөвхөн БОДИТ ажиллаж буй боломжийг «ажиллаж байна» гэнэ. AI оноо нь идэвхтэй
 * зарт оноо бодогдсон үед л (hasAiScores — зарын «AI оноо» эрэмбэтэй ижил хаалга);
 * бусад нь «Тун удахгүй». Юу ч ажиллахгүй үед хуудас noindex (sitemap-д ч орохгүй).
 */
function features(scoresLive: boolean): Feature[] {
  return [
    {
      icon: Star,
      t: "AI чанарын оноо",
      d: scoresLive
        ? "Зарын үнэ, талбай, байршлыг төстэй зартай харьцуулсан 0–100 оноо. Оноотой зарын хуудсанд харагдана."
        : "Зарын үнэ, талбай, байршлыг төстэй зартай харьцуулсан 0–100 оноо.",
      live: scoresLive,
    },
    { icon: TrendingUp, t: "Үнийн зөвлөмж", d: "Дүүрэг, төрөл, талбайд тулгуурласан үнийн санал.", live: false },
    { icon: ShieldAlert, t: "Сэжигтэй зарын анхааруулга", d: "Давхардсан зураг, хэт хямд үнийг илрүүлж анхааруулах.", live: false },
    { icon: FileText, t: "Тайлбар үүсгэгч", d: "Зарын мэдээллээс тайлбарын ноорог бичих.", live: false },
  ];
}

export async function generateMetadata(): Promise<Metadata> {
  const live = await hasAiScores().catch(() => false);
  return {
    title: withBrand("Нэми AI"),
    description: "Нэми-ийн AI хэрэгслүүд — аль нь ажиллаж байгаа, аль нь тун удахгүй нэмэгдэхийг эндээс.",
    alternates: { canonical: "/ai" },
    ...(live ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function AiPage() {
  const list = features(await hasAiScores().catch(() => false));
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
          <Sparkles className="size-4" aria-hidden /> Нэми AI
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-ink">Хиймэл оюуны хэрэгслүүд</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Зарын мэдээлэлд тулгуурласан AI хэрэгслүүдийг шат дараалан нэмж байна. «Тун удахгүй» гэсэн боломж одоогоор
          ажиллаагүй байна.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {list.map((f) => (
          <Card key={f.t}>
            <CardBody className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-ink">{f.t}</h2>
                  {f.live ? <Badge tone="green">Ажиллаж байна</Badge> : <Badge tone="neutral">Тун удахгүй</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">{f.d}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

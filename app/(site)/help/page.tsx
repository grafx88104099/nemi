import type { Metadata } from "next";

import { Card, CardBody } from "@/components/ui/card";
import { hasAiScores } from "@/lib/queries";
import { withBrand } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: withBrand("Тусламжийн төв"),
  description: "Нэми-ийн түгээмэл асуултууд: зар нийтлэх, баталгаажуулалт, үзлэг товлох.",
  alternates: { canonical: "/help" },
};

type Faq = { q: string; a: string };

const FAQ: Faq[] = [
  { q: "Зар хэрхэн нийтлэх вэ?", a: "Агентаар бүртгүүлж, самбар руугаа орж «Шинэ зар» дарна. Зураг, мэдээллээ оруулаад нийтэлнэ." },
  { q: "Зар хэрхэн баталгаажих вэ?", a: "Оффисын админ эсвэл Нэми баг зарын мэдээллийг шалгаж баталгаажуулна. Баталгаатай зар ногоон тэмдэгтэй." },
  { q: "Үзлэг хэрхэн товлох вэ?", a: "Зарын хуудаснаас «Үзлэг товлох» дарж огноо сонгоно. Агент баталгаажуулна." },
];

// Зөвхөн AI оноо бодит зарт гарсан үед (зарын «AI оноо» эрэмбэтэй ижил хаалга).
const AI_FAQ: Faq = {
  q: "AI оноо гэж юу вэ?",
  a: "Зарын үнэ, талбай, байршлыг төстэй зартай харьцуулж гаргасан 0–100 оноо. Оноотой зарын хуудсанд харагдана.",
};

export default async function HelpPage() {
  const faq = (await hasAiScores().catch(() => false)) ? [...FAQ, AI_FAQ] : FAQ;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Тусламжийн төв</h1>
      <p className="mt-2 text-muted">Түгээмэл асуултууд</p>
      <div className="mt-6 space-y-3">
        {faq.map((f) => (
          <Card key={f.q}>
            <CardBody>
              <h2 className="font-bold text-ink">{f.q}</h2>
              <p className="mt-1 text-sm text-muted">{f.a}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

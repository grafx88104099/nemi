import { Card, CardBody } from "@/components/ui/card";

const FAQ = [
  { q: "Зар хэрхэн нийтлэх вэ?", a: "Агентаар бүртгүүлж, самбар руугаа орж «Шинэ зар» дарна. Зураг, мэдээллээ оруулаад нийтэлнэ." },
  { q: "Зар хэрхэн баталгаажих вэ?", a: "Оффисын админ эсвэл Нэми баг зарын мэдээллийг шалгаж баталгаажуулна. Баталгаатай зар ногоон тэмдэгтэй." },
  { q: "AI оноо гэж юу вэ?", a: "Зарын үнэ, байршил, чанарыг зах зээлтэй харьцуулж гаргасан 0-100 оноо. Өндөр оноо = илүү таатай үнэ/чанар." },
  { q: "Үзлэг хэрхэн товлох вэ?", a: "Зарын хуудаснаас «Үзлэг товлох» дарж огноо сонгоно. Агент баталгаажуулна." },
  { q: "Premier гэж юу вэ?", a: "Агентуудад зориулсан төлбөртэй багц — онцлох байршил, тэмдэг, AI хэрэгслүүд." },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Тусламжийн төв</h1>
      <p className="mt-2 text-muted">Түгээмэл асуултууд</p>
      <div className="mt-6 space-y-3">
        {FAQ.map((f) => (
          <Card key={f.q}>
            <CardBody>
              <h3 className="font-bold text-ink">{f.q}</h3>
              <p className="mt-1 text-sm text-muted">{f.a}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

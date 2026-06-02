import { Sparkles, Star, TrendingUp, ShieldAlert, FileText } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";

const FEATURES = [
  { icon: Star, t: "AI чанарын оноо", d: "Зар бүрийг 100 онооны системээр үнэлж, зах зээлтэй харьцуулна." },
  { icon: TrendingUp, t: "Үнийн зөвлөмж", d: "Дүүрэг, төрөл, талбайд тулгуурлан зөв үнэ санал болгоно." },
  { icon: ShieldAlert, t: "Хуурамч зар илрүүлэх", d: "Давхардсан зураг, сэжигтэй үнийг автоматаар анхааруулна." },
  { icon: FileText, t: "Тайлбар үүсгэгч", d: "Зарын мэдээллээс татахуйц тайлбарыг агшин зуур бичнэ." },
];

export default function AiPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
          <Sparkles className="size-4" /> Нэми AI
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-ink">Хиймэл оюунаар илүү ухаалаг</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Нэми-ийн AI нь үл хөдлөхийн шийдвэрийг өгөгдөлд тулгуурлан хөнгөвчилнө.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.t}>
            <CardBody className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink">{f.t}</h3>
                <p className="mt-1 text-sm text-muted">{f.d}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

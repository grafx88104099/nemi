import { Phone, Mail, MapPin } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Холбоо барих</h1>
      <p className="mt-2 text-muted">Асуулт, санал хүсэлтээ бидэнд илгээнэ үү.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Phone, label: "Утас", value: "+976 7700 0000" },
          { icon: Mail, label: "И-мэйл", value: "hello@nemi.mn" },
          { icon: MapPin, label: "Хаяг", value: "Сүхбаатар дүүрэг, УБ" },
        ].map((c) => (
          <Card key={c.label}>
            <CardBody className="space-y-1">
              <c.icon className="size-5 text-brand-600" />
              <div className="text-sm text-muted">{c.label}</div>
              <div className="font-semibold text-ink">{c.value}</div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

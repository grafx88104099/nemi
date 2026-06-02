import { Calculator } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { RentAffordCalc } from "@/components/rent/RentAffordCalc";

export const metadata = { title: "Түрээсийн төсөв тооцоолох — Нэми" };

export default function RentAffordPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Calculator className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Хэдийг чадах вэ?</h1>
          <p className="text-sm text-muted">Орлогодоо тохирох сарын түрээсээ тооцоол</p>
        </div>
      </div>
      <Card className="mt-6">
        <CardBody>
          <RentAffordCalc />
        </CardBody>
      </Card>
    </div>
  );
}

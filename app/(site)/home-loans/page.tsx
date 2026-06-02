import { Landmark } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { LoanCalculator } from "@/components/loans/LoanCalculator";
import { BankLogo } from "@/components/loans/BankLogo";
import { getBankProducts } from "@/lib/loans/banks";

export const metadata = { title: "Орон сууцны зээл — Нэми" };

export default async function HomeLoansPage() {
  const products = await getBankProducts();

  // Банк бүрийн хамгийн бага хүүг гаргаж лого зурвас үүсгэнэ
  const banks = Object.values(
    products.reduce<Record<string, { bank: string; short: string; color: string; domain: string; minRate: number }>>((acc, p) => {
      const prev = acc[p.bank]?.minRate ?? Infinity;
      if (!acc[p.bank] || p.annualRatePct < prev) {
        acc[p.bank] = { bank: p.bank, short: p.short, color: p.color, domain: p.domain, minRate: Math.min(p.annualRatePct, prev) };
      }
      return acc;
    }, {})
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Орон сууцны зээл</h1>
      <p className="mt-2 text-muted">
        Мэдээллээ оруулаад <b className="text-ink">«Банкны нөхцөл татаж тооцоолох»</b> дарж, Монголын
        банкуудын зээлийн нөхцөлийг бодит хүүгээр харьцуул.
      </p>

      <Card className="mt-6">
        <CardBody>
          <LoanCalculator />
        </CardBody>
      </Card>

      <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-ink">
        <Landmark className="size-5 text-brand-600" /> Хамтрагч банкууд
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banks.map((b) => (
          <Card key={b.bank}>
            <CardBody className="flex items-center gap-3">
              <BankLogo domain={b.domain} short={b.short} color={b.color} />
              <div>
                <div className="font-bold text-ink">{b.bank}</div>
                <div className="text-sm text-muted">Хүү <b className="text-ink">{b.minRate}%</b>-аас</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

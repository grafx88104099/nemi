import { monthlyPayment, type LoanProduct } from "@/lib/loans/banks";

/**
 * Зарын хуудсанд харуулах ЖИШИГ сарын төлбөр (зээлийн хуудасны нарийн
 * тооцооллын товч хувилбар). Хамгийн бага хүүтэй хоёр сонголт:
 *  - хөнгөлөлттэй ипотек — зээлийн дүн хөтөлбөрийн дээд хэмжээнд багтвал;
 *  - худалдааны зээл — урьдчилгааны шаардлага хангагдвал.
 */
export type MortgageOption = { rate: number; years: number; monthly: number; bank: string };
export type MortgageEstimate = {
  downPct: number;
  downPayment: number;
  principal: number;
  government: MortgageOption | null;
  commercial: MortgageOption | null;
};

export function estimateMortgage(
  price: number,
  products: LoanProduct[],
  opts: { downPct?: number; years?: number } = {}
): MortgageEstimate | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const downPct = opts.downPct ?? 30;
  const years = opts.years ?? 20;
  const principal = Math.round(price * (1 - downPct / 100));

  const pick = (kind: LoanProduct["kind"]): MortgageOption | null => {
    const best = products
      .filter((p) => p.kind === kind && p.minDownPct <= downPct && (p.maxAmount == null || principal <= p.maxAmount))
      .sort((a, b) => a.annualRatePct - b.annualRatePct)[0];
    if (!best) return null;
    const term = Math.min(years, best.maxYears);
    return {
      rate: best.annualRatePct,
      years: term,
      monthly: Math.round(monthlyPayment(principal, best.annualRatePct, term)),
      bank: best.bank,
    };
  };

  return {
    downPct,
    downPayment: price - principal,
    principal,
    government: pick("government"),
    commercial: pick("commercial"),
  };
}

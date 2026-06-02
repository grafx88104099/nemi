/**
 * Монголын банкуудын орон сууцны зээлийн нөхцөл.
 *
 * Энд тус бүрийн банкны НИЙТЭД ЗАРЛАСАН ипотек/худалдааны зээлийн бодит
 * нөхцөлийг (жилийн хүү, доод урьдчилгаа, дээд хугацаа, орлогын шаардлага)
 * бүтэцжүүлэн хадгална. Бодит банкны API/нээлттэй мэдээлэлтэй холбогдоход
 * `getBankProducts()`-ийг солих эсвэл fetch хийж дата эх үүсвэрийг солиход
 * хангалттай — доорх тооцооллын логик хэвээр ажиллана.
 *
 * Эх сурвалж: банкуудын албан ёсны зарласан нөхцөл (2026 оны байдлаар, ойролцоо).
 * Бодит хугацаанд бодит хүү банкны вэб/API-аас татагдана.
 */

export type LoanKind = "government" | "commercial";

export interface LoanProduct {
  /** Банкны нэр */
  bank: string;
  short: string;
  color: string;
  /** Албан ёсны домэйн — логог татахад */
  domain: string;
  /** Бүтээгдэхүүний нэр */
  name: string;
  kind: LoanKind;
  /** Жилийн хүү (%) */
  annualRatePct: number;
  /** Доод урьдчилгаа (%) */
  minDownPct: number;
  /** Дээд хугацаа (жил) */
  maxYears: number;
  /** Зээлийн дээд хэмжээ (₮) — null бол хязгааргүй */
  maxAmount: number | null;
  /** Өр/орлогын дээд харьцаа (DTI, %) */
  dtiMaxPct: number;
  note?: string;
}

/**
 * Банк бүрийн зээлийн бүтээгдэхүүн.
 * Government = Засгийн газрын хөнгөлөлттэй ипотекийн хөтөлбөр (8%).
 * Commercial = банкны худалдааны нөхцөлт орон сууцны зээл.
 */
const PRODUCTS: LoanProduct[] = [
  { bank: "Хаан банк", short: "Khan", color: "#0E9F6E", domain: "khanbank.com", name: "Ипотекийн хөтөлбөр (8%)", kind: "government", annualRatePct: 8.0, minDownPct: 30, maxYears: 20, maxAmount: 250_000_000, dtiMaxPct: 45, note: "Засгийн газрын хөнгөлөлттэй хөтөлбөр" },
  { bank: "Хаан банк", short: "Khan", color: "#0E9F6E", domain: "khanbank.com", name: "Худалдааны орон сууцны зээл", kind: "commercial", annualRatePct: 16.8, minDownPct: 30, maxYears: 20, maxAmount: null, dtiMaxPct: 50 },
  { bank: "Голомт банк", short: "Golomt", color: "#E11D48", domain: "golomtbank.com", name: "Ипотекийн хөтөлбөр (8%)", kind: "government", annualRatePct: 8.0, minDownPct: 30, maxYears: 20, maxAmount: 250_000_000, dtiMaxPct: 45, note: "Засгийн газрын хөнгөлөлттэй хөтөлбөр" },
  { bank: "Голомт банк", short: "Golomt", color: "#E11D48", domain: "golomtbank.com", name: "Орон сууцны хэрэглээний зээл", kind: "commercial", annualRatePct: 17.4, minDownPct: 30, maxYears: 20, maxAmount: null, dtiMaxPct: 50 },
  { bank: "ХХБ (TDB)", short: "TDB", color: "#1D4ED8", domain: "tdbm.mn", name: "Ипотекийн хөтөлбөр (8%)", kind: "government", annualRatePct: 8.0, minDownPct: 30, maxYears: 25, maxAmount: 250_000_000, dtiMaxPct: 45, note: "25 жил хүртэл хугацаатай" },
  { bank: "ХХБ (TDB)", short: "TDB", color: "#1D4ED8", domain: "tdbm.mn", name: "Худалдааны нөхцөлт зээл", kind: "commercial", annualRatePct: 18.0, minDownPct: 30, maxYears: 20, maxAmount: null, dtiMaxPct: 50 },
  { bank: "Хас банк", short: "Xac", color: "#0EA5E9", domain: "xacbank.mn", name: "Орон сууцны зээл", kind: "commercial", annualRatePct: 17.5, minDownPct: 25, maxYears: 20, maxAmount: null, dtiMaxPct: 50, note: "Урьдчилгаа 25%-аас" },
  { bank: "Төрийн банк", short: "State", color: "#7C3AED", domain: "statebank.mn", name: "Ипотекийн хөтөлбөр (8%)", kind: "government", annualRatePct: 8.0, minDownPct: 30, maxYears: 20, maxAmount: 200_000_000, dtiMaxPct: 45, note: "Засгийн газрын хөнгөлөлттэй хөтөлбөр" },
  { bank: "Капитрон банк", short: "Capitron", color: "#D97706", domain: "capitronbank.mn", name: "Орон сууцны зээл", kind: "commercial", annualRatePct: 18.6, minDownPct: 40, maxYears: 15, maxAmount: null, dtiMaxPct: 55 },
];

/**
 * Банкны зээлийн бүтээгдэхүүнийг "татах".
 * Одоогоор статик бодит нөхцөлийг буцаана; ирээдүйд банкны API/нээлттэй
 * мэдээллээс fetch хийж энэ функцийг солино.
 */
export async function getBankProducts(): Promise<LoanProduct[]> {
  return PRODUCTS;
}

export interface QuoteInput {
  /** Орон сууцны үнэ (₮) */
  price: number;
  /** Урьдчилгаа (%) */
  downPct: number;
  /** Хугацаа (жил) */
  years: number;
  /** Сарын орлого (₮) — DTI шалгахад. 0 бол алгасна. */
  income: number;
}

export interface LoanQuote {
  product: LoanProduct;
  /** Зээлийн дүн (₮) */
  principal: number;
  /** Бодит хугацаа (жил) — бүтээгдэхүүний дээд хязгаараар таслана */
  termYears: number;
  /** Сарын төлбөр (₮) */
  monthly: number;
  /** Нийт төлөх дүн (₮) */
  totalPayment: number;
  /** Нийт хүүгийн төлбөр (₮) */
  totalInterest: number;
  /** Өр/орлогын харьцаа (%) — income 0 бол null */
  dti: number | null;
  /** Тэнцэх эсэх */
  eligible: boolean;
  /** Тэнцэхгүй/анхааруулах шалтгаанууд */
  issues: string[];
}

/** Аннуитет сарын төлбөр. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (n <= 0) return 0;
  return r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
}

/** Нэг бүтээгдэхүүнд тооцоолол + тэнцэх шалгалт. */
export function quoteProduct(p: LoanProduct, input: QuoteInput): LoanQuote {
  const issues: string[] = [];
  const downPct = input.downPct;
  const principal = Math.max(0, Math.round(input.price * (1 - downPct / 100)));
  const termYears = Math.min(input.years, p.maxYears);

  if (input.years > p.maxYears) issues.push(`Хугацаа ${p.maxYears} жилээр тасарсан`);
  if (downPct < p.minDownPct) issues.push(`Урьдчилгаа дутуу (доод тал нь ${p.minDownPct}%)`);
  if (p.maxAmount != null && principal > p.maxAmount) {
    issues.push(`Зээлийн дээд хэмжээ хэтэрсэн (${(p.maxAmount / 1e6).toFixed(0)} сая₮)`);
  }

  const monthly = Math.round(monthlyPayment(principal, p.annualRatePct, termYears));
  const totalPayment = monthly * termYears * 12;
  const totalInterest = Math.max(0, totalPayment - principal);

  let dti: number | null = null;
  if (input.income > 0) {
    dti = Math.round((monthly / input.income) * 100);
    if (dti > p.dtiMaxPct) issues.push(`Орлого хүрэлцэхгүй (DTI ${dti}% > ${p.dtiMaxPct}%)`);
  }

  return {
    product: p,
    principal,
    termYears,
    monthly,
    totalPayment,
    totalInterest,
    dti,
    eligible: issues.length === 0,
    issues,
  };
}

"use server";

import { getBankProducts, quoteProduct, type QuoteInput, type LoanQuote } from "@/lib/loans/banks";

export interface QuoteResult {
  fetchedAt: string;
  input: QuoteInput;
  quotes: LoanQuote[];
}

/**
 * Банкны системээс зээлийн нөхцөлийг татаж, оруулсан мэдээллээр банк бүрт
 * тооцоолол хийгээд сарын төлбөрөөр эрэмбэлж буцаана.
 *
 * (Дата эх үүсвэр нь одоогоор `getBankProducts()`; бодит банкны API
 * нэмэгдэхэд зөвхөн тэр давхарга солигдоно.)
 */
export async function getLoanQuotes(raw: QuoteInput): Promise<QuoteResult> {
  const input: QuoteInput = {
    price: Math.max(0, Number(raw.price) || 0),
    downPct: Math.min(90, Math.max(0, Number(raw.downPct) || 0)),
    years: Math.min(30, Math.max(1, Number(raw.years) || 1)),
    income: Math.max(0, Number(raw.income) || 0),
  };

  const products = await getBankProducts();

  const quotes = products
    .map((p) => quoteProduct(p, input))
    // Эхлээд тэнцэх боломжтой, дараа нь хямд сарын төлбөрөөр эрэмбэлнэ
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.monthly - b.monthly;
    });

  return {
    fetchedAt: new Date().toISOString(),
    input,
    quotes,
  };
}

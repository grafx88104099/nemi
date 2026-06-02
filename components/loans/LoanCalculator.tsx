"use client";

import { useState, useTransition } from "react";
import { Search, CheckCircle2, AlertTriangle, Trophy, RefreshCw } from "lucide-react";

import { fmtMNT, shortMNT } from "@/lib/format";
import { getLoanQuotes, type QuoteResult } from "@/lib/actions/loans";
import { BankLogo } from "@/components/loans/BankLogo";

export function LoanCalculator() {
  const [price, setPrice] = useState(300_000_000);
  const [down, setDown] = useState(30);
  const [years, setYears] = useState(20);
  const [income, setIncome] = useState(6_000_000);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await getLoanQuotes({ price, downPct: down, years, income });
      setResult(res);
    });
  }

  const row = (label: string, node: React.ReactNode) => (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-ink">{label}</span>
      {node}
    </label>
  );
  const input = "h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-500 focus:outline-none";

  const eligibleCount = result?.quotes.filter((q) => q.eligible).length ?? 0;
  // Тэнцэх хамгийн хямд; байхгүй бол нийт жагсаалтын хамгийн хямд (эрэмбэлэгдсэн эхнийх)
  const best = result?.quotes.find((q) => q.eligible) ?? result?.quotes[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Оролт */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          {row("Орон сууцны үнэ (₮)", <input type="number" className={input} value={price} onChange={(e) => setPrice(+e.target.value)} />)}
          {row(`Урьдчилгаа: ${down}% (${shortMNT(Math.round(price * down / 100))})`, <input type="range" min={10} max={70} value={down} onChange={(e) => setDown(+e.target.value)} className="w-full accent-brand-500" />)}
        </div>
        <div className="space-y-4">
          {row(`Хугацаа: ${years} жил`, <input type="range" min={5} max={30} value={years} onChange={(e) => setYears(+e.target.value)} className="w-full accent-brand-500" />)}
          {row("Сарын орлого (₮)", <input type="number" className={input} value={income} onChange={(e) => setIncome(+e.target.value)} placeholder="Тэнцэх эсэхийг шалгах" />)}
        </div>
      </div>

      <button
        onClick={run}
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60 sm:w-auto"
      >
        {pending ? <RefreshCw className="size-5 animate-spin" /> : <Search className="size-5" />}
        {pending ? "Банкны нөхцөл татаж байна…" : result ? "Дахин тооцоолох" : "Банкны нөхцөл татаж тооцоолох"}
      </button>

      {/* Үр дүн */}
      {result && (
        <div className="space-y-4">
          {/* Дүгнэлт */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
            <span className="font-semibold text-ink">{result.quotes.length} бүтээгдэхүүн</span>
            <span className="text-emerald-600">· {eligibleCount} тэнцэх боломжтой</span>
            {best && (
              <span className="text-muted">
                · Хамгийн хямд: <b className="text-brand-700">{best.product.bank}</b> — {fmtMNT(best.monthly)}/сар
              </span>
            )}
            <span className="ml-auto text-xs text-subtle">
              Татсан: {new Date(result.fetchedAt).toLocaleString("mn-MN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Жагсаалт */}
          <div className="space-y-3">
            {result.quotes.map((q, i) => {
              const isBest = best != null && q === best;
              return (
                <div
                  key={q.product.bank + q.product.name}
                  className={`rounded-2xl border p-4 transition ${
                    isBest ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-200" : q.eligible ? "border-line bg-surface" : "border-line bg-surface-2/60 opacity-90"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <BankLogo domain={q.product.domain} short={q.product.short} color={q.product.color} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-ink">{q.product.bank}</span>
                        {isBest && <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white"><Trophy className="size-3" /> Хамгийн хямд</span>}
                        {q.product.kind === "government" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Хөнгөлөлттэй</span>}
                      </div>
                      <div className="text-xs text-muted">{q.product.name} · жилийн {q.product.annualRatePct}% · {q.termYears} жил</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-ink">{fmtMNT(q.monthly)}</div>
                      <div className="text-[11px] text-subtle">сард</div>
                    </div>
                  </div>

                  {/* Дэлгэрэнгүй */}
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line/70 pt-3 text-xs sm:grid-cols-4">
                    <Stat label="Зээлийн дүн" value={shortMNT(q.principal)} />
                    <Stat label="Нийт хүү" value={shortMNT(q.totalInterest)} />
                    <Stat label="Нийт төлөлт" value={shortMNT(q.totalPayment)} />
                    <Stat label="DTI" value={q.dti != null ? `${q.dti}%` : "—"} />
                  </div>

                  {/* Тэнцэх төлөв */}
                  <div className="mt-2.5">
                    {q.eligible ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="size-4" /> Тэнцэх боломжтой
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-amber-600">
                        <AlertTriangle className="size-4 shrink-0" /> {q.issues.join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-subtle">
            * Тооцоолол нь аннуитет (тэнцүү төлөлт) аргаар хийгдсэн ойролцоо дүн. Эцсийн нөхцөл,
            хүү, шимтгэлийг тухайн банк зээлдэгчийн орлого, зээлийн түүхээс хамааран тогтооно.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-subtle">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

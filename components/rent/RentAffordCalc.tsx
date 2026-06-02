"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Input, Field } from "@/components/ui/input";
import { fmtMNT } from "@/lib/format";
import { recommendedRent } from "@/lib/rent";

export function RentAffordCalc() {
  const [income, setIncome] = useState(2_500_000);
  const [debts, setDebts] = useState(0);

  // 30% дүрэм (lib/rent.ts — unit тесттэй)
  const { recommended, max } = recommendedRent(income, debts);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Сарын цэвэр орлого (₮)" hint="Гэр бүлийн нийт орлого">
          <Input type="number" value={income} onChange={(e) => setIncome(+e.target.value)} />
        </Field>
        <Field label="Сарын тогтмол төлбөр (зээл г.м.) (₮)">
          <Input type="number" value={debts} onChange={(e) => setDebts(+e.target.value)} />
        </Field>
        <p className="text-xs text-subtle">
          Зөвлөмж: түрээс нь орлогын 30%-аас хэтрэхгүй байх нь санхүүгийн хувьд аюулгүй.
        </p>
      </div>
      <div className="flex flex-col justify-center rounded-2xl bg-brand-50 p-6 text-center">
        <div className="text-sm text-brand-700">Тохиромжтой сарын түрээс</div>
        <div className="mt-1 text-3xl font-extrabold text-brand-700">{fmtMNT(recommended)}</div>
        <div className="mt-1 text-sm text-muted">Дээд хязгаар: {fmtMNT(max)}</div>
        <Link
          href={`/listings?deal=rent&maxPrice=${max}`}
          className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Энэ төсөвт тохирох түрээс <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

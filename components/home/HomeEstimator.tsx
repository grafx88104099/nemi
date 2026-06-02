"use client";

import { useState, useTransition } from "react";

import { estimateHome } from "@/lib/actions/estimate";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { fmtMNT } from "@/lib/format";

const DISTRICTS = ["Сүхбаатар", "Чингэлтэй", "Хан-Уул", "Баянгол", "Сонгинохайрхан", "Баянзүрх", "Налайх"];
const TYPES = ["Орон сууц", "Хаус", "Газар", "Оффис", "Худалдааны талбай"];

export function HomeEstimator() {
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [type, setType] = useState(TYPES[0]);
  const [area, setArea] = useState(80);
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<{ estimate: number; avgPerM2: number; sample: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sel = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setRes(null);
    startTransition(async () => {
      const r = await estimateHome({ district, type, area });
      if ("error" in r) setErr(r.error);
      else setRes(r);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Дүүрэг">
          <select className={sel} value={district} onChange={(e) => setDistrict(e.target.value)}>
            {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Төрөл">
          <select className={sel} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Талбай (м²)">
          <Input type="number" value={area} onChange={(e) => setArea(+e.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Тооцоолж байна..." : "Үнэлгээ авах"}</Button>
        {err && <p className="text-sm text-danger">{err}</p>}
      </form>
      <div className="flex flex-col justify-center rounded-2xl bg-brand-50 p-6 text-center">
        {res ? (
          <>
            <div className="text-sm text-brand-700">Зах зээлийн ойролцоо үнэлгээ</div>
            <div className="mt-1 text-3xl font-extrabold text-brand-700">{fmtMNT(res.estimate)}</div>
            <div className="mt-2 text-sm text-muted">м² дундаж: {fmtMNT(res.avgPerM2)}</div>
            <div className="text-xs text-subtle">{res.sample} ижил зар дээр үндэслэв</div>
          </>
        ) : (
          <p className="text-sm text-muted">Мэдээллээ оруулаад үнэлгээ аваарай.</p>
        )}
      </div>
    </div>
  );
}

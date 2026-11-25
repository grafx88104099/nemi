"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { submitOwnerRequest } from "@/lib/actions/owner-listings";
import { OWNER_REQUEST_HONEYPOT } from "@/lib/owner-request-guard";
import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";

const sel = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

/** Эзэн хөрөнгөө оффист зуучлуулах хүсэлт (нэвтрэхгүйгээр ч болно). */
export function OwnerRequestForm({
  offices,
  initialName,
  initialPhone,
}: {
  offices: { id: string; name: string }[];
  initialName: string;
  initialPhone: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  // Ботын урхи (honeypot): хүнд харагдахгүй, бөглөгдвөл сервер хүсэлтийг чимээгүй хаяна.
  const [trap, setTrap] = React.useState("");
  const [f, setF] = React.useState({
    office_id: offices[0]?.id ?? "",
    contact_name: initialName,
    contact_phone: initialPhone,
    deal_type: "sale" as "sale" | "rent",
    property_type: PROPERTY_TYPES[0] as string,
    district: "",
    location_text: "",
    area: "",
    rooms: "",
    price: "",
    note: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await submitOwnerRequest({ ...f, [OWNER_REQUEST_HONEYPOT]: trap });
      if (!r.ok) return setErr(r.error ?? "Алдаа гарлаа.");
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-lg font-bold text-ink">Хүсэлт илгээгдлээ</h2>
        <p className="mt-1 text-sm text-muted">Оффисын агент удахгүй {f.contact_phone} дугаар руу залгана.</p>
        <Link href="/listings" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">
          Зарууд үзэх →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative space-y-5 rounded-2xl border border-line bg-surface p-5">
      <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label>
          Вэбсайт
          <input type="text" name={OWNER_REQUEST_HONEYPOT} tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>
      <Field label="Юу хийх вэ?">
        <div role="radiogroup" aria-label="Гүйлгээ" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {(
            [
              ["sale", "Худалдах"],
              ["rent", "Түрээслүүлэх"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.deal_type === v}
              onClick={() => set("deal_type", v)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition ${
                f.deal_type === v ? "bg-brand-600 text-white" : "text-muted hover:text-ink"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Хөрөнгийн төрөл" htmlFor="or-type">
          <select id="or-type" className={sel} value={f.property_type} onChange={(e) => set("property_type", e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Дүүрэг" htmlFor="or-district">
          <select id="or-district" className={sel} value={f.district} onChange={(e) => set("district", e.target.value)}>
            <option value="">Сонгоогүй</option>
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Байршил (хотхон, гудамж)" htmlFor="or-loc">
        <Input id="or-loc" value={f.location_text} onChange={(e) => set("location_text", e.target.value)} maxLength={300} placeholder="Жишээ: Хан-Уул, Ривер гарден" />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Талбай (м²)" htmlFor="or-area">
          <NumberInput id="or-area" value={f.area} onValueChange={(v) => set("area", v)} />
        </Field>
        <Field label="Өрөө" htmlFor="or-rooms">
          <NumberInput id="or-rooms" inputMode="numeric" value={f.rooms} onValueChange={(v) => set("rooms", v)} />
        </Field>
        <Field label={f.deal_type === "rent" ? "Сарын үнэ (₮)" : "Үнэ (₮)"} htmlFor="or-price">
          <NumberInput id="or-price" inputMode="numeric" value={f.price} onValueChange={(v) => set("price", v)} />
        </Field>
      </div>

      <Field label="Нэмэлт мэдээлэл" htmlFor="or-note">
        <textarea
          id="or-note"
          className="min-h-24 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none"
          value={f.note}
          maxLength={2000}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Хэзээ үзүүлж болох, онцлог, яаралтай эсэх…"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Таны нэр" htmlFor="or-name">
          <Input id="or-name" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} required maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Утасны дугаар" htmlFor="or-phone">
          <Input id="or-phone" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="9911 2233" />
        </Field>
      </div>

      {offices.length > 1 ? (
        <Field label="Оффис" htmlFor="or-office">
          <select id="or-office" className={sel} value={f.office_id} onChange={(e) => set("office_id", e.target.value)}>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      ) : offices[0] ? (
        <p className="text-sm text-muted">Хүсэлт «{offices[0].name}» оффист очно.</p>
      ) : null}

      {err ? <p className="text-sm text-danger" role="alert">{err}</p> : null}
      <Button type="submit" disabled={pending || !f.office_id} className="w-full sm:w-auto">
        {pending ? "Илгээж байна..." : "Хүсэлт илгээх"}
      </Button>
      <p className="text-xs text-muted">Таны утасны дугаарыг зөвхөн сонгосон оффис харна.</p>
    </form>
  );
}

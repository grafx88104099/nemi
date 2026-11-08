"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { registerOpenHouseVisit, type OpenHouseVisitInput } from "@/lib/actions/crm-public-links";
import { cn } from "@/lib/utils";

const INTERESTS: { value: OpenHouseVisitInput["interest"]; label: string }[] = [
  { value: "buy", label: "Худалдан авах" },
  { value: "rent", label: "Түрээслэх" },
  { value: "sell", label: "Өөрийн үл хөдлөхөө зарах" },
  { value: "other", label: "Бусад" },
];

/** Нээлттэй үзлэгийн бүртгэлийн маягт (нэвтрэлтгүй). Зөвшөөрөл заавал. */
export function OpenHouseVisitForm({ code, office }: { code: string; office: string | null }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<OpenHouseVisitInput["interest"] | "">("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold text-emerald-900">Бүртгэгдлээ. Баярлалаа!</p>
        <p className="mt-1 text-sm text-emerald-800">Агент тантай удахгүй холбогдоно.</p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!interest) {
      setError("Сонирхлоо сонгоно уу.");
      return;
    }
    start(async () => {
      const res = await registerOpenHouseVisit({ code, fullName: name, phone, email: email || null, interest, comment, consent, website });
      if (!res.ok) {
        setError(res.error ?? "Бүртгэл амжилтгүй боллоо.");
        return;
      }
      setDone(true);
    });
  }

  const input = "h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink";
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Нэр *</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Утас *</span>
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required maxLength={20} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">И-мэйл</span>
        <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="email" maxLength={120} />
      </label>
      <div>
        <span className="mb-1 block text-sm font-medium text-ink">Сонирхол *</span>
        <div className="grid grid-cols-2 gap-2">
          {INTERESTS.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => setInterest(i.value)}
              className={cn(
                "min-h-11 rounded-xl border px-3 py-2 text-sm",
                interest === i.value ? "border-brand-400 bg-brand-50 font-medium text-brand-800" : "border-line bg-surface text-ink"
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Асуулт, хүсэлт</span>
        <textarea className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
      </label>
      {/* Ботын урхи — хүнд харагдахгүй */}
      <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden />
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Миний нэр, холбоо барих мэдээллийг {office ?? "үйлчилгээ үзүүлэгч оффис"} үл хөдлөхийн зуучлалын үйлчилгээний хүрээнд надтай холбогдоход
          ашиглахыг зөвшөөрч байна.{" "}
          <Link href="/privacy" className="text-brand-700 underline" target="_blank">
            Нууцлалын бодлого
          </Link>
        </span>
      </label>
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <button type="submit" disabled={pending || !consent} className="h-12 w-full rounded-xl bg-brand-500 text-base font-semibold text-white disabled:opacity-50">
        {pending ? "Илгээж байна…" : "Бүртгүүлэх"}
      </button>
    </form>
  );
}

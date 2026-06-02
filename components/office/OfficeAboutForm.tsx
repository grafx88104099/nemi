"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Calendar, ShieldCheck, MapPin, BadgeCheck } from "lucide-react";

import { updateMyOfficeAbout } from "@/lib/actions/offices";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { OfficeImageUpload } from "@/components/office/OfficeImageUpload";

const FbIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.25 0-1.64.77-1.64 1.57V12h2.78l-.44 2.9h-2.34v6.98A10 10 0 0 0 22 12z" /></svg>
);
const IgIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
);

export type AboutFields = {
  description: string;
  about: string;
  website: string;
  founded_year: string;
  license_no: string;
  facebook: string;
  instagram: string;
  logo_url: string;
  cover_url: string;
  specialties: string;
  service_areas: string;
};

export function OfficeAboutForm({
  initial,
  officeName,
  logo,
  color,
  verified,
}: {
  initial: AboutFields;
  officeName: string;
  logo: string;
  color: string;
  verified: boolean;
}) {
  const [f, setF] = useState<AboutFields>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const set = <K extends keyof AboutFields>(k: K, v: AboutFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const r = await updateMyOfficeAbout({
        ...f,
        specialties: list(f.specialties),
        service_areas: list(f.service_areas),
      });
      if (!("error" in r)) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const ta = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Форм */}
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <OfficeImageUpload label="Лого" value={f.logo_url} onChange={(v) => set("logo_url", v)} variant="square" />
          <OfficeImageUpload label="Ковер зураг" value={f.cover_url} onChange={(v) => set("cover_url", v)} variant="wide" />
        </div>
        <Field label="Товч тайлбар (slogan)" htmlFor="desc">
          <Input id="desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Жнь: Хан-Уулын лакшери орон сууцны мэргэжилтэн" />
        </Field>
        <Field label="Дэлгэрэнгүй танилцуулга" htmlFor="about">
          <textarea id="about" rows={5} className={ta} value={f.about} onChange={(e) => set("about", e.target.value)} placeholder="Оффисын түүх, үйлчилгээ, давуу тал..." />
        </Field>
        <Field label="Тусгай чиглэл" htmlFor="spec" hint="таслалаар: Орон сууц, Хаус, Оффис">
          <Input id="spec" value={f.specialties} onChange={(e) => set("specialties", e.target.value)} />
        </Field>
        <Field label="Үйлчлэх бүс нутаг" htmlFor="areas" hint="таслалаар: Хан-Уул, Сүхбаатар">
          <Input id="areas" value={f.service_areas} onChange={(e) => set("service_areas", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Байгуулагдсан он" htmlFor="year">
            <Input id="year" type="number" value={f.founded_year} onChange={(e) => set("founded_year", e.target.value)} placeholder="2015" />
          </Field>
          <Field label="Лицензийн дугаар" htmlFor="lic">
            <Input id="lic" value={f.license_no} onChange={(e) => set("license_no", e.target.value)} placeholder="УБ-12345" />
          </Field>
          <Field label="Вэбсайт" htmlFor="web">
            <Input id="web" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Facebook" htmlFor="fb">
            <Input id="fb" value={f.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="https://facebook.com/..." />
          </Field>
          <Field label="Instagram" htmlFor="ig">
            <Input id="ig" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="https://instagram.com/..." />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Хадгалж байна..." : "Хадгалах"}</Button>
          {saved && <span className="text-sm font-medium text-emerald-600">Хадгалагдлаа ✓</span>}
        </div>
      </form>

      {/* Урьдчилан харах — нийтэд харагдах профайл */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Нийтэд харагдах байдал</div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div className="h-28 bg-gradient-to-r from-brand-100 to-brand-50">
            {f.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.cover_url} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="relative z-10 px-5 pb-5">
            <div className="-mt-10 mb-3">
              {f.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.logo_url} alt="" className="size-20 rounded-2xl border-4 border-surface object-cover shadow-sm" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-surface text-2xl font-bold text-white shadow-sm" style={{ background: color }}>
                  {logo}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-extrabold text-ink">{officeName}</h3>
              {verified && <BadgeCheck className="size-4 text-emerald-600" />}
            </div>
            {f.description && <p className="text-sm text-muted">{f.description}</p>}

            {f.about && <p className="mt-3 whitespace-pre-line text-sm text-muted">{f.about}</p>}

            {list(f.specialties).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {list(f.specialties).map((s) => (
                  <span key={s} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{s}</span>
                ))}
              </div>
            )}
            {list(f.service_areas).length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <MapPin className="size-3.5" />
                {list(f.service_areas).join(" · ")}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
              {f.founded_year && <span className="inline-flex items-center gap-1.5"><Calendar className="size-4" /> {f.founded_year} оноос</span>}
              {f.license_no && <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> {f.license_no}</span>}
            </div>
            <div className="mt-3 flex items-center gap-3">
              {f.website && <a href={f.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-700"><Globe className="size-5" /></a>}
              {f.facebook && <a href={f.facebook} target="_blank" rel="noreferrer" className="text-[#1877F2]"><FbIcon /></a>}
              {f.instagram && <a href={f.instagram} target="_blank" rel="noreferrer" className="text-[#E1306C]"><IgIcon /></a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

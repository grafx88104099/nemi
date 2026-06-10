"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createListing, updateListing, type ListingInput } from "@/lib/actions/listings";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { MultiPhotoUpload } from "@/components/dashboard/MultiPhotoUpload";
import { LocationPicker } from "@/components/dashboard/LocationPicker";
import {
  LISTING_STATUS, LISTING_STATUS_OPTIONS, DEAL_TYPE_LABEL,
  RENT_TERM_PRESETS, rentTermCode, rentTermLabel, type DealType,
} from "@/lib/constants";
import { fmtMNT } from "@/lib/format";

const TYPES = ["Орон сууц", "Хаус", "Газар", "Оффис", "Худалдааны талбай"];
const DISTRICTS = ["Сүхбаатар", "Чингэлтэй", "Хан-Уул", "Баянгол", "Сонгинохайрхан", "Баянзүрх", "Налайх"];

export function ListingForm({
  id,
  initial,
}: {
  id?: string;
  initial?: Partial<ListingInput>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  // amenities-г түүхий мөрөөр барина (таслал/зай бичих боломжтой); submit үед задална.
  const [amenitiesText, setAmenitiesText] = useState((initial?.amenities ?? []).join(", "));
  const [f, setF] = useState<ListingInput>({
    title: initial?.title ?? "",
    type: initial?.type ?? TYPES[0],
    district: initial?.district ?? DISTRICTS[0],
    rooms: initial?.rooms ?? 0,
    area: initial?.area ?? 0,
    floor: initial?.floor ?? "",
    price: initial?.price ?? 0,
    year: initial?.year ?? 0,
    parking: initial?.parking ?? 0,
    description: initial?.description ?? "",
    amenities: initial?.amenities ?? [],
    photos: [],
    status: (initial?.status as ListingInput["status"]) ?? "active",
    deal_type: (initial?.deal_type as DealType) ?? "sale",
    rent_advance_months: initial?.rent_advance_months ?? 1,
    rent_deposit_months: initial?.rent_deposit_months ?? 1,
    lat: initial?.lat ?? null,
    lng: initial?.lng ?? null,
  });
  const isRent = f.deal_type === "rent";
  const adv = f.rent_advance_months ?? 1;
  const dep = f.rent_deposit_months ?? 1;
  const upfront = isRent && f.price ? (adv + dep) * f.price : 0;

  const set = (k: keyof ListingInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  // Сөрөг/NaN-аас хамгаалсан тоон оролт.
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const sel = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.title.trim()) { setErr("Зарын гарчиг оруулна уу."); return; }
    if (!(f.price > 0)) { setErr("Үнэ 0-ээс их байх ёстой."); return; }
    const amenities = amenitiesText.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = { ...f, amenities, photos };
    startTransition(async () => {
      const res = id ? await updateListing(id, payload) : await createListing(payload);
      const failed = ("error" in res && res.error) || ("ok" in res && !res.ok);
      if (failed) {
        setErr(("error" in res && res.error) ? res.error : "Хадгалахад алдаа гарлаа.");
        return;
      }
      router.push("/agent/listings");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Зарын төрөл">
        <div role="radiogroup" aria-label="Зарын төрөл" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {(["sale", "rent"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              onClick={() => set("deal_type", d)}
              aria-checked={f.deal_type === d}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                f.deal_type === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink"
              }`}
            >
              {DEAL_TYPE_LABEL[d]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Зарын гарчиг" htmlFor="t">
        <Input id="t" required value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="3 өрөө · River Garden" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Төрөл">
          <select className={sel} value={f.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Дүүрэг">
          <select className={sel} value={f.district} onChange={(e) => set("district", e.target.value)}>
            {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Өрөө"><Input type="number" inputMode="numeric" min={0} value={f.rooms || ""} onChange={(e) => set("rooms", num(e.target.value))} placeholder="3" /></Field>
        <Field label="Талбай (м²)"><Input type="number" inputMode="numeric" min={0} value={f.area || ""} onChange={(e) => set("area", num(e.target.value))} placeholder="96" /></Field>
        <Field label="Давхар"><Input value={f.floor} onChange={(e) => set("floor", e.target.value)} placeholder="12/18" /></Field>
        <Field label="Зогсоол"><Input type="number" inputMode="numeric" min={0} value={f.parking || ""} onChange={(e) => set("parking", num(e.target.value))} placeholder="0" /></Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={isRent ? "Үнэ (₮/сар)" : "Үнэ (₮)"}><Input id="price" inputMode="numeric" required value={f.price ? f.price.toLocaleString("en-US") : ""} onChange={(e) => set("price", num(e.target.value.replace(/\D/g, "")))} placeholder={isRent ? "2,500,000" : "1,000,000"} /></Field>
        <Field label="Ашиглалтын он"><Input type="number" inputMode="numeric" min={0} value={f.year || ""} onChange={(e) => set("year", num(e.target.value))} placeholder="2024" /></Field>
      </div>

      {isRent && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
          <div>
            <p className="text-sm font-semibold text-ink">Түрээсийн төлбөрийн нөхцөл</p>
            <p className="mt-0.5 text-xs text-muted">
              «{rentTermCode(adv, dep)}» = {rentTermLabel(adv, dep)}. Эхэлж төлөх дүн.
            </p>
          </div>
          <div role="radiogroup" aria-label="Түрээсийн төлбөрийн нөхцөл" className="flex flex-wrap gap-2">
            {RENT_TERM_PRESETS.map((p) => {
              const active = adv === p.advance && dep === p.deposit;
              return (
                <button
                  key={rentTermCode(p.advance, p.deposit)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={rentTermLabel(p.advance, p.deposit)}
                  onClick={() => { set("rent_advance_months", p.advance); set("rent_deposit_months", p.deposit); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    active ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {rentTermCode(p.advance, p.deposit)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Урьдчилгаа түрээс (сар)">
              <Input type="number" inputMode="numeric" min={0} value={adv} onChange={(e) => set("rent_advance_months", Math.max(0, +e.target.value || 0))} />
            </Field>
            <Field label="Барьцаа (сар)">
              <Input type="number" inputMode="numeric" min={0} value={dep} onChange={(e) => set("rent_deposit_months", Math.max(0, +e.target.value || 0))} />
            </Field>
          </div>
          {upfront > 0 && (
            <p className="text-sm text-ink">
              Эхний төлбөр: <b>{adv + dep} сар = {fmtMNT(upfront)}</b>
              <span className="text-muted"> ({fmtMNT((dep) * f.price)} нь буцаагдах барьцаа)</span>
            </p>
          )}
        </div>
      )}

      <Field label="Тайлбар">
        <textarea
          className="min-h-24 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none"
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="Тохижилт (таслалаар тусгаарла)">
        <Input
          value={amenitiesText}
          onChange={(e) => setAmenitiesText(e.target.value)}
          placeholder="Лифт, Зогсоол, Камер"
        />
      </Field>

      <Field label="Байршил (газрын зураг)">
        <LocationPicker
          lat={f.lat}
          lng={f.lng}
          onChange={(lat, lng) => setF((s) => ({ ...s, lat, lng }))}
        />
      </Field>

      <Field label="Зураг (олон)">
        <MultiPhotoUpload value={photos} onChange={setPhotos} />
      </Field>

      <Field label="Төлөв">
        <select className={sel} value={f.status} onChange={(e) => set("status", e.target.value as ListingInput["status"])}>
          {LISTING_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{LISTING_STATUS[s].label}</option>
          ))}
        </select>
      </Field>

      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Хадгалж байна..." : id ? "Шинэчлэх" : "Зар нийтлэх"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Болих</Button>
      </div>
    </form>
  );
}

"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";
import { fmtPriceShort } from "@/lib/format";
import { LISTING_FEATURES } from "@/lib/listing-features";
import type { ListingFacets } from "@/lib/listing-facets";
import {
  DEAL_TABS,
  LOAN8_MAX_PRICE,
  POSTED_OPTIONS,
  districtList,
  filtersHref,
  filtersToParams,
  newBuildFrom,
  type FlagKey,
  type ListingFilters,
} from "@/lib/listing-filters";
import { cn } from "@/lib/utils";

import { COUNT, CTA, FEATURE_ICON, TYPE_ICON } from "./styles";

const KNOWN: readonly string[] = DISTRICTS;
const LOAN8_SAYA = Math.round(LOAN8_MAX_PRICE / 1e6);

const field =
  "h-11 w-full min-w-0 rounded-xl border border-line-control bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/30";
const option =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm text-ink transition has-[:checked]:border-ink has-[:checked]:bg-surface-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";
const box = "size-4 shrink-0 accent-ink";

/** Тоо (хуучирсан бол дуудагч null өгнө); тоолж байх үед бүдгэрнэ. */
function Count({ n, dim = false, className }: { n: number | null | undefined; dim?: boolean; className?: string }) {
  if (n == null) return null;
  return <span className={cn(COUNT, "text-xs transition-opacity", dim && "opacity-40", className ?? "ml-auto")}>{n}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-sm font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Үнийн талбарын амьд тайлбар («320 сая ₮»). Дагаваргүй («Доод: …») — ₮-ийн эгшиг зохицол алдахгүй. */
function priceHint(raw: string): string | null {
  const n = Number(raw.replace(/[\s,]/g, ""));
  return raw.trim() && Number.isFinite(n) && n > 0 ? fmtPriceShort(n) : null;
}

/**
 * Шүүлтүүрийн бүтэн GET маягт (хэсэг A–J). JS-гүй ч ажиллана — FilterPanel
 * hydration-оос өмнө <details> дотор, дараа нь sheet дотор ЯГ энэ маягтыг харуулна.
 *
 * Талбарууд удирдлагагүй (defaultValue/defaultChecked) — FormData-аас уншина.
 * `cur` = одоогийн (амьд) сонголт: тэг тоотой СОНГООГҮЙ утгыг идэвхгүй болгох,
 * Түрээс/Худалдааны хэсгийг нуух шийдвэрт. Сонгосон утга хэзээ ч идэвхгүй болохгүй
 * (идэвхгүй талбар илгээгддэггүй). Тэг-идэвхгүй нь зөвхөн facets ОДООГИЙН сонголтод
 * тооцоологдсон үед (countsPending=false), фокустай талбарт хэзээ ч үгүй (фокус алдагдана).
 */
export function FilterPanelForm({
  base,
  f,
  cur = f,
  facets,
  countsStale = false,
  countsPending = false,
  sticky = false,
  formRef,
  onChange,
  onSubmit,
  onReset,
}: {
  base: "/listings" | "/map";
  /** URL-ийн шүүлт (анхдагч утга). */
  f: ListingFilters;
  /** Амьд сонголт (анхдагч нь f). */
  cur?: ListingFilters;
  facets: ListingFacets | null;
  /** Сүүлийн RPC алдаатай — тоо хуучин байж магадгүй. */
  countsStale?: boolean;
  /** facets нь одоогийн сонголтод хараахан тооцоологдоогүй (debounce/RPC хүлээгдэж буй). */
  countsPending?: boolean;
  sticky?: boolean;
  formRef?: React.Ref<HTMLFormElement>;
  onChange?: (e: React.FormEvent<HTMLFormElement>) => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Sheet горим: «Арилгах» нь маягтыг цэвэрлэж sheet-ийг нээлттэй үлдээнэ (JS-гүй үед холбоос). */
  onReset?: () => void;
}) {
  const uid = useId();
  // Фокустай input-ийн «name=value» — тэг тоотой ч идэвхгүй болгохгүй (фокус <body> руу унахаас сэргийлнэ).
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const inputKey = (t: EventTarget | null) => (t instanceof HTMLInputElement ? `${t.name}=${t.value}` : null);
  const [minHint, setMinHint] = useState(() => priceHint(String(f.minPrice ?? "")));
  const [maxHint, setMaxHint] = useState(() => priceHint(String(f.maxPrice ?? "")));

  const sort = filtersToParams(f, { withSort: true }).get("sort");
  const selDistricts = districtList(cur);
  const initialDistricts = districtList(f);
  // Танихгүй сонгосон дүүрэг (жишээ нь нүүр хуудаснаас «Багануур») — илгээхэд алга болохгүй.
  const extraDistricts = initialDistricts.filter((d) => !KNOWN.includes(d));
  const roomOpts = [1, 2, 3, 4, ...(f.rooms && f.rooms > 4 ? [f.rooms] : [])];
  const newFrom = facets?.newFrom || newBuildFrom();
  const dealSum = facets ? Object.values(facets.deal).reduce((a, b) => a + b, 0) : null;
  // RPC алдаатай (stale) бол хуучин тоог огт харуулахгүй.
  const counts = facets != null && !countsStale ? facets : null;
  const dim = countsPending;
  const zero = (n: number | undefined, key: string) =>
    counts != null && !countsPending && focusKey !== key && (n ?? 0) === 0;
  const flagCount = (k: FlagKey) => (counts ? counts.flags[k] : null);
  const total = counts?.total ?? null;
  const submitLabel = countsPending
    ? "Тоолж байна…"
    : total == null
      ? "Зар харах"
      : total === 0
        ? "Тохирох зар алга"
        : `${total} зар харах`;
  const live = countsStale
    ? "Тоо шинэчлэгдсэнгүй"
    : countsPending || total == null
      ? ""
      : `${total} зар тохирч байна`;

  const flagBox = (k: FlagKey, label: string, hint?: string) => {
    const n = flagCount(k);
    const checked = !!cur[k];
    return (
      <label className={option}>
        <input
          type="checkbox"
          name={k}
          value="1"
          // cur: Түрээс/Худалдааны хэсэг дахин гарч ирэхэд амьд сонголттой таарна (URL биш).
          defaultChecked={checked}
          disabled={zero(n ?? undefined, `${k}=1`) && !checked}
          className={box}
        />
        <span className="min-w-0">
          {label}
          {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
        </span>
        <Count n={n} dim={dim} />
      </label>
    );
  };

  return (
    <form
      ref={formRef}
      action={base}
      method="get"
      onChange={onChange}
      onSubmit={onSubmit}
      onFocus={(e) => setFocusKey(inputKey(e.target))}
      onBlur={() => setFocusKey(null)}
      aria-labelledby={`${uid}-t`}
      aria-busy={countsPending || undefined}
      className="space-y-4"
    >
      <h2 id={`${uid}-t`} className="sr-only">
        Шүүлтүүр
      </h2>
      {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
      {sort ? <input type="hidden" name="sort" value={sort} /> : null}

      <Section title="Гүйлгээ">
        <div className="grid grid-cols-3 gap-2">
          {DEAL_TABS.map(([v, label]) => (
            // Утсанд 3 багана нарийн: тоог нэрийн доор (sm-ээс нэг мөрөнд) — нэр, тоо хоёул таслагдахгүй.
            <label
              key={label}
              className={cn(option, "min-h-14 flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 sm:min-h-11 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-0")}
            >
              <span className="flex items-center gap-1.5">
                <input type="radio" name="deal" value={v} defaultChecked={(f.deal ?? "") === v} className={box} />
                <span>{label}</span>
              </span>
              <Count
                n={counts ? (v ? (counts.deal[v] ?? 0) : dealSum) : null}
                dim={dim}
                className="pl-[1.375rem] sm:ml-auto sm:pl-0"
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Үл хөдлөхийн төрөл">
        <div className="grid grid-cols-3 gap-2">
          {(["", ...PROPERTY_TYPES] as string[]).map((t) => {
            const Icon = t ? TYPE_ICON[t] : null;
            const n = t ? (counts?.type[t] ?? 0) : null;
            const disabled = !!t && zero(n ?? undefined, `type=${t}`) && cur.type !== t;
            return (
              <label
                key={t || "all"}
                className={cn(option, "min-h-[72px] flex-col justify-center gap-1 px-2 py-2 text-center")}
              >
                <input
                  type="radio"
                  name="type"
                  value={t}
                  defaultChecked={(f.type ?? "") === t}
                  disabled={disabled}
                  className="sr-only"
                />
                {Icon ? <Icon className="size-5 text-muted" aria-hidden /> : null}
                <span className="text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{t || "Бүгд"}</span>
                {counts && t ? <Count n={n} dim={dim} className="" /> : null}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Дүүрэг">
        <div className="grid grid-cols-2 gap-2">
          {[...DISTRICTS, ...extraDistricts].map((d) => (
            <label key={d} className={option}>
              <input
                type="checkbox"
                name="district"
                value={d}
                defaultChecked={initialDistricts.includes(d)}
                className={box}
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{d}</span>
              <Count n={counts ? (counts.district[d] ?? 0) : null} dim={dim} />
            </label>
          ))}
        </div>
        {selDistricts.length > 1 ? <p className="text-xs text-muted">Сонгосон дүүргүүдийн аль нэгэнд.</p> : null}
      </Section>

      <Section title="Өрөө">
        <div className="flex flex-wrap gap-2">
          {(["", ...roomOpts.map(String)] as string[]).map((r) => (
            <label key={r || "all"} className={cn(option, "flex-1 justify-center")}>
              <input
                type="radio"
                name="rooms"
                value={r}
                defaultChecked={String(f.rooms ?? "") === r}
                className="sr-only"
              />
              <span className="font-semibold">{r ? `${r}+` : "Бүгд"}</span>
              {counts && r && Number(r) <= 4 ? (
                <Count n={counts.rooms[r as "1" | "2" | "3" | "4"]} dim={dim} className="" />
              ) : null}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Үнэ (₮)">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              name="minPrice"
              inputMode="numeric"
              defaultValue={f.minPrice ?? ""}
              placeholder="Доод"
              aria-label="Үнэ доод (₮)"
              aria-describedby={`${uid}-pmin`}
              onInput={(e) => setMinHint(priceHint(e.currentTarget.value))}
              className={field}
            />
            {/* aria-live ҮГҮЙ (товчлуур бүрт зарлахгүй) — aria-describedby-оор фокус дээр уншигдана. */}
            <p id={`${uid}-pmin`} className="mt-1 min-h-4 text-xs text-muted tabular-nums">
              {minHint ? `Доод: ${minHint}` : ""}
            </p>
          </div>
          <div>
            <input
              name="maxPrice"
              inputMode="numeric"
              defaultValue={f.maxPrice ?? ""}
              placeholder="Дээд"
              aria-label="Үнэ дээд (₮)"
              aria-describedby={`${uid}-pmax`}
              onInput={(e) => setMaxHint(priceHint(e.currentTarget.value))}
              className={field}
            />
            <p id={`${uid}-pmax`} className="mt-1 min-h-4 text-xs text-muted tabular-nums">
              {maxHint ? `Дээд: ${maxHint}` : ""}
            </p>
          </div>
        </div>
        <p className="pt-1 text-sm font-bold text-ink">Талбай (м²)</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="minArea"
            inputMode="decimal"
            defaultValue={f.minArea ?? ""}
            placeholder="Доод"
            aria-label="Талбай доод (м²)"
            className={field}
          />
          <input
            name="maxArea"
            inputMode="decimal"
            defaultValue={f.maxArea ?? ""}
            placeholder="Дээд"
            aria-label="Талбай дээд (м²)"
            className={field}
          />
        </div>
      </Section>

      <Section title="Барилга">{flagBox("newBuild", `Шинэ барилга (${newFrom}+)`)}</Section>

      {cur.deal !== "sale" ? (
        <Section title="Түрээсийн нөхцөл">
          <div className="grid gap-2 sm:grid-cols-2">
            {flagBox("adv1", "Урьдчилгаа 1 сар")}
            {flagBox("noDeposit", "Барьцаагүй")}
          </div>
        </Section>
      ) : null}

      {cur.deal !== "rent" ? (
        <Section title="Худалдаа">
          {flagBox(
            "loan8",
            "8%-ийн зээлд тохирох (тооцоолол)",
            `Тооцоолол: орон сууц, үнэ ≤ ${LOAN8_SAYA} сая ₮ (зээл ≤ 250 сая ₮, урьдчилгаа 30%). Зээлийн шийдвэрийг банк гаргана.`
          )}
        </Section>
      ) : null}

      <Section title="Онцлог">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LISTING_FEATURES.map(({ key, label }) => {
            const Icon = FEATURE_ICON[key];
            const n = counts ? counts.features[key] : null;
            const checked = (cur.features ?? []).includes(key);
            return (
              <label key={key} className={option}>
                <input
                  type="checkbox"
                  name="features"
                  value={key}
                  defaultChecked={(f.features ?? []).includes(key)}
                  disabled={zero(n ?? undefined, `features=${key}`) && !checked}
                  className={box}
                />
                <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">{label}</span>
                <Count n={n} dim={dim} />
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Зар оруулсан">
        <div className="grid gap-2 sm:grid-cols-2">
          {flagBox("ownerOnly", "Эзэн өөрөө")}
          <select
            name="posted"
            defaultValue={f.posted ? String(f.posted) : ""}
            aria-label="Нийтэлсэн хугацаа"
            className={field}
          >
            <option value="">Бүх хугацаа</option>
            {POSTED_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t border-line pt-4",
          sticky && "sticky bottom-0 -mx-4 bg-surface px-4 pb-4 sm:-mx-6 sm:px-6"
        )}
      >
        {onReset ? (
          <button
            type="button"
            data-filter-reset
            onClick={onReset}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Арилгах
          </button>
        ) : (
          <Link
            href={filtersHref(base, { deal: f.deal, sort: f.sort }, { withSort: true })}
            rel="nofollow"
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink underline-offset-2 hover:underline"
          >
            Арилгах
          </Link>
        )}
        {countsStale ? <p className="min-w-0 flex-1 text-xs text-muted">Тоо шинэчлэгдсэнгүй</p> : null}
        <button type="submit" className={cn(CTA, "inline-flex min-h-11 items-center rounded-xl px-5 text-sm")}>
          {submitLabel}
        </button>
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      </div>
    </form>
  );
}

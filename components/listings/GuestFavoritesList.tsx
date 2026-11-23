"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { LISTING_CARD_SELECT } from "@/lib/listing-card-select";
import { loginHref } from "@/lib/nav";
import { ButtonLink } from "@/components/ui/button";
import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard";
import { removeGuestIds, useFavoritesState } from "@/components/listings/favorites-store";

const REFRESH_FLAG = "nemi:fav-refresh";

function readFlag(): boolean {
  try {
    return !!window.sessionStorage.getItem(REFRESH_FLAG);
  } catch {
    return true; // sessionStorage хаалттай бол refresh хийхгүй (давталтаас сэргийлнэ).
  }
}

function setFlag(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(REFRESH_FLAG, "1");
    else window.sessionStorage.removeItem(REFRESH_FLAG);
  } catch {
    // ignore
  }
}

/**
 * /favorites — нэвтрээгүй үед энэ төхөөрөмж дээр (localStorage) хадгалсан зарууд.
 * Картыг browser anon клиентээр татна: RLS зөвхөн идэвхтэй зарыг, select зөвхөн
 * нийтийн баганыг (LISTING_CARD_SELECT) өгнө.
 *
 * Автоматаар юу ч устгахгүй: нийтлэгдээгүй (идэвхгүй/устсан) зарыг тоогоор
 * харуулж, хэрэглэгч өөрөө «Жагсаалтаас хасах» дарна. Татах алдаа → дахин оролдох.
 */
export function GuestFavoritesList() {
  const state = useFavoritesState();
  const router = useRouter();
  // null = татсан ч буцаж ирээгүй (нийтлэгдээгүй).
  const [cache, setCache] = useState<Map<string, ListingCardData | null>>(() => new Map());
  const [err, setErr] = useState(false);

  const ready = state.status === "ready";
  const ids = useMemo(() => [...state.ids], [state.ids]);
  const missingKey = ids
    .filter((id) => !cache.has(id))
    .sort()
    .join(",");

  // Сервер зочны хэсгийг зурсан ч клиент session баталгаажсан бол (жишээ нь өөр
  // табд нэвтэрсэн) — табын сешнд НЭГ л удаа refresh хийнэ (давталтгүй).
  const did = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (state.signedIn) {
      if (!did.current && !readFlag()) {
        did.current = true;
        setFlag(true);
        router.refresh();
      }
    } else {
      setFlag(false);
    }
  }, [ready, state.signedIn, router]);

  // Кэшид байхгүй id-уудыг л нэг удаа татна; зүрх авахад (id хасагдахад) дахин татахгүй.
  useEffect(() => {
    if (!ready || err || !missingKey) return;
    const list = missingKey.split(",");
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await createClient()
          .from("listings")
          .select(LISTING_CARD_SELECT)
          .in("id", list)
          .eq("status", "active");
        if (cancelled) return;
        if (error) {
          setErr(true);
          return;
        }
        const rows = (data ?? []) as unknown as ListingCardData[];
        setCache((prev) => {
          const m = new Map(prev);
          const got = new Set<string>();
          for (const r of rows) {
            const key = r.id.toLowerCase();
            m.set(key, r);
            got.add(key);
          }
          for (const id of list) if (!got.has(id)) m.set(id, null);
          return m;
        });
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, err, missingKey]);

  if (!ready) return <SkeletonGrid count={4} />;

  if (ids.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted">Одоогоор хадгалсан зар алга. Зар үзээд ❤ дарж хадгална уу.</p>
        <ButtonLink href={loginHref("/favorites")} className="mt-5">
          Нэвтрэх
        </ButtonLink>
      </div>
    );
  }

  const cards = ids.map((id) => cache.get(id)).filter((c): c is ListingCardData => !!c);
  const nullIds = ids.filter((id) => cache.get(id) === null);
  const loadingCount = err ? 0 : ids.filter((id) => !cache.has(id)).length;

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Энэ төхөөрөмж дээр хадгалсан ({ids.length})</p>
          <p className="mt-0.5 text-sm text-muted">
            Нэвтэрвэл эдгээр зар таны бүртгэлд хадгалагдаж, бүх төхөөрөмжөөс харагдана.
          </p>
        </div>
        <ButtonLink href={loginHref("/favorites")} size="sm" className="shrink-0">
          Нэвтрэх
        </ButtonLink>
      </div>

      {err ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-muted">
          <span>Зарыг ачаалж чадсангүй.</span>
          <button
            type="button"
            onClick={() => setErr(false)}
            className="min-h-11 rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-9"
          >
            Дахин оролдох
          </button>
        </div>
      ) : null}

      {cards.length > 0 || loadingCount > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <ListingCard key={c.id} l={c} />
          ))}
          {loadingCount > 0 ? <SkeletonCards count={Math.min(loadingCount, 4)} /> : null}
        </div>
      ) : null}

      {nullIds.length > 0 ? (
        <p className="text-sm text-muted">
          {nullIds.length} зар одоогоор нийтлэгдээгүй байна (зарагдсан эсвэл түр нуугдсан).{" "}
          <button
            type="button"
            onClick={() => removeGuestIds(nullIds)}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-brand-700 hover:underline sm:min-h-9"
          >
            Жагсаалтаас хасах
          </button>
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      <SkeletonCards count={count} />
    </div>
  );
}

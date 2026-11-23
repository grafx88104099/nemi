"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MapPin } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { fmtPriceShort } from "@/lib/format";
import { compactRpcArgs, filterRpcArgs } from "@/lib/listing-facets";
import type { ListingFilters } from "@/lib/listing-filters";
import { CTA } from "@/components/listings/filters/styles";
import { cn } from "@/lib/utils";

type Pin = {
  id: string;
  title: string;
  price: number;
  district: string | null;
  deal_type: string;
  lng: number;
  lat: number;
};

/**
 * Цэгийн popup-ыг DOM-оор угсарна. InfoWindow.setContent(мөр) нь мөрийг HTML
 * гэж тайлдаг тул агентын бичсэн гарчиг шууд оровол хөтөч дээр код ажиллана
 * (stored XSS). textContent нь бичвэрийг зөвхөн бичвэр хэвээр нь харуулна.
 */
export function pinPopup(l: Pick<Pin, "id" | "title" | "district" | "price" | "deal_type">): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = l.title;
  const meta = document.createElement("div");
  meta.style.cssText = "color:#5b6474;font-size:12px";
  meta.textContent = [fmtPriceShort(l.price, l.deal_type), l.district]
    .filter(Boolean)
    .join(" · ");
  const link = document.createElement("a");
  link.href = `/listings/${encodeURIComponent(l.id)}`;
  link.style.cssText = "color:#c2410c;font-size:12px";
  link.textContent = "Дэлгэрэнгүй →";
  root.append(title, meta, link);
  return root;
}

/**
 * Шүүлт → listings_map_search-ийн аргумент (жагсаалт, listing_facets-тэй ижил утга).
 * Зөвхөн тохируулсан түлхүүрийг илгээнэ (compactRpcArgs) — шүүлтгүй дуудлага {} тул
 * хуучин ба шинэ RPC гарын үсэгт хоёуланд таарна. Хуучин p_district/p_q-г илгээхгүй (p_districts).
 */
function rpcArgs(f: ListingFilters) {
  return compactRpcArgs({ ...filterRpcArgs(f) });
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const UB = { lat: 47.918, lng: 106.917 };
const NEAR_M = 4000;

export function ListingsMap({ filters = {} }: { filters?: ListingFilters }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [near, setNear] = useState(false);
  // Объект бүр шинэ байдаг тул шүүлтийг утгаар нь харьцуулна.
  const argsKey = JSON.stringify(rpcArgs(filters));

  const render = useCallback((pins: Pin[]) => {
    const map = mapRef.current;
    const lib = markerLibRef.current;
    const info = infoRef.current;
    if (!map || !lib || !info) return;

    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    for (const l of pins) {
      const el = document.createElement("div");
      el.style.cssText =
        "display:grid;place-items:center;background:#f97316;color:#0f1b2d;border:1px solid #0f1b2d;font-weight:700;font-size:11px;padding:3px 7px;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap;cursor:pointer";
      el.textContent = fmtPriceShort(l.price);

      const marker = new lib.AdvancedMarkerElement({
        map,
        position: { lat: l.lat, lng: l.lng },
        content: el,
        gmpClickable: true,
        title: l.title,
      });
      marker.addListener("click", () => {
        info.setContent(pinPopup(l));
        info.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    }
    setCount(pins.length);
  }, []);

  const load = useCallback(
    async (around?: { lng: number; lat: number }) => {
      const supabase = createClient();
      const args = JSON.parse(argsKey) as ReturnType<typeof rpcArgs>;
      const { data } = await supabase.rpc("listings_map_search", {
        ...args,
        ...(around ? { p_lng: around.lng, p_lat: around.lat, p_m: NEAR_M } : {}),
      });
      render((data ?? []) as Pin[]);
    },
    [argsKey, render]
  );

  // Газрын зургийг нэг удаа үүсгэнэ.
  useEffect(() => {
    if (!ref.current || !KEY) return;
    let cancelled = false;
    setOptions({ key: KEY, v: "weekly" });

    (async () => {
      const [{ Map, InfoWindow }, markerLib] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
      ]);
      if (cancelled || !ref.current) return;

      mapRef.current = new Map(ref.current, {
        center: UB,
        zoom: 11,
        mapId: MAP_ID || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        clickableIcons: false,
      });
      markerLibRef.current = markerLib;
      infoRef.current = new InfoWindow();
      setReady(true);
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
    };
  }, []);

  // Шүүлт өөрчлөгдөх бүрт (мөн анх бэлэн болоход) цэгүүдийг ачаална.
  useEffect(() => {
    if (!ready) return;
    let stale = false;
    (async () => {
      await load();
      if (!stale) setNear(false);
    })();
    return () => {
      stale = true;
    };
  }, [ready, load]);

  async function searchNearCenter() {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    await load({ lng: c.lng(), lat: c.lat() });
    setNear(true);
  }

  async function reset() {
    await load();
    setNear(false);
  }

  if (!KEY) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2 text-center text-sm text-muted">
        Газрын зургийн түлхүүр (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) тохируулаагүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={searchNearCenter}
          className={cn(CTA, "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm")}
        >
          <MapPin className="size-4" aria-hidden /> Энэ хавьд хайх (4км)
        </button>
        {near && (
          <button type="button" onClick={reset} className="min-h-11 px-2 text-sm text-muted hover:underline">
            Бүх бүсийг харах
          </button>
        )}
        {count != null && (
          <span className="text-sm text-muted tabular-nums" aria-live="polite">
            {near ? `Энэ хавьд ${count} зар` : `${count} зар`}
          </span>
        )}
      </div>
      <div ref={ref} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-line" />
    </div>
  );
}

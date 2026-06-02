"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

import { createClient } from "@/lib/supabase/client";
import { shortMNT } from "@/lib/format";

type Pin = {
  id: string;
  title: string;
  price: number;
  district: string | null;
  ai_score: number | null;
  lng: number;
  lat: number;
};

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const UB = { lat: 47.918, lng: 106.917 };

export function ListingsMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [near, setNear] = useState(false);

  function render(pins: Pin[]) {
    const map = mapRef.current;
    const lib = markerLibRef.current;
    const info = infoRef.current;
    if (!map || !lib || !info) return;

    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    for (const l of pins) {
      const el = document.createElement("div");
      el.style.cssText =
        "display:grid;place-items:center;background:#F97316;color:#fff;font-weight:700;font-size:11px;padding:3px 7px;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap;cursor:pointer";
      el.textContent = shortMNT(l.price);

      const marker = new lib.AdvancedMarkerElement({
        map,
        position: { lat: l.lat, lng: l.lng },
        content: el,
        gmpClickable: true,
      });
      marker.addListener("click", () => {
        info.setContent(
          `<div style="font-weight:600">${l.title}</div><div style="color:#64748b;font-size:12px">${l.district ?? ""} · AI ${l.ai_score ?? "—"}</div><a href="/listings/${l.id}" style="color:#EA580C;font-size:12px">Дэлгэрэнгүй →</a>`
        );
        info.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    }
    setCount(pins.length);
  }

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

      const map = new Map(ref.current, {
        center: UB,
        zoom: 11,
        mapId: MAP_ID || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      markerLibRef.current = markerLib;
      infoRef.current = new InfoWindow();

      const supabase = createClient();
      const { data } = await supabase.rpc("listings_map");
      if (!cancelled) render((data ?? []) as Pin[]);
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
    };
  }, []);

  async function searchNearCenter() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!c) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("listings_within", { p_lng: c.lng(), p_lat: c.lat(), p_m: 4000 });
    render((data ?? []) as Pin[]);
    setNear(true);
  }

  async function reset() {
    const supabase = createClient();
    const { data } = await supabase.rpc("listings_map");
    render((data ?? []) as Pin[]);
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
      <div className="flex items-center gap-3">
        <button
          onClick={searchNearCenter}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          📍 Энэ хавьд хайх (4км)
        </button>
        {near && (
          <button onClick={reset} className="text-sm text-muted hover:underline">
            Бүгдийг харах
          </button>
        )}
        {count != null && <span className="text-sm text-muted">{count} зар</span>}
      </div>
      <div ref={ref} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-line" />
    </div>
  );
}

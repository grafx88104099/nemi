"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { createClient } from "@/lib/supabase/client";
import { shortMNT } from "@/lib/format";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

type Pin = { id: string; title: string; price: number; district: string | null; ai_score: number | null; lng: number; lat: number };

export function ListingsMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [near, setNear] = useState(false);

  function render(pins: Pin[]) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const map = mapRef.current!;
    for (const l of pins) {
      const el = document.createElement("a");
      el.href = `/listings/${l.id}`;
      el.style.cssText =
        "display:grid;place-items:center;background:#F97316;color:#fff;font-weight:700;font-size:11px;padding:3px 7px;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap;cursor:pointer";
      el.textContent = shortMNT(l.price);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([l.lng, l.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(
            `<div style="font-weight:600">${l.title}</div><div style="color:#64748b;font-size:12px">${l.district ?? ""} · AI ${l.ai_score ?? "—"}</div><a href="/listings/${l.id}" style="color:#EA580C;font-size:12px">Дэлгэрэнгүй →</a>`
          )
        )
        .addTo(map);
      markersRef.current.push(marker);
    }
    setCount(pins.length);
  }

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: OSM_STYLE,
      center: [106.917, 47.918],
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("listings_map");
      render((data ?? []) as Pin[]);
    });
    return () => map.remove();
  }, []);

  async function searchNearCenter() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const supabase = createClient();
    const { data } = await supabase.rpc("listings_within", { p_lng: c.lng, p_lat: c.lat, p_m: 4000 });
    render((data ?? []) as Pin[]);
    setNear(true);
  }

  async function reset() {
    const supabase = createClient();
    const { data } = await supabase.rpc("listings_map");
    render((data ?? []) as Pin[]);
    setNear(false);
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

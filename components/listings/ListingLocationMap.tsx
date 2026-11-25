"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

/**
 * Зарын байршлыг харуулах газрын зураг (нэг тэмдэглэгээ).
 * Утсанд хуудасны доод хэсэгт байдаг тул Maps JS API-г (их хэмжээний скрипт,
 * dynamic map load-ын төлбөр) хэсэг дэлгэцэнд ойртох үед л ачаална.
 */
export function ListingLocationMap({ lat, lng }: { lat: number; lng: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // IntersectionObserver-гүй (хуучин) хөтөчид шууд ачаална. Тэмдэглэгээ ижил тул hydration зөрөхгүй.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  // Дэлгэцэнд 300px ойртоход нэг удаа «харагдсан» болно.
  useEffect(() => {
    const el = ref.current;
    if (!el || !KEY || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !ref.current || !KEY) return;
    let cancelled = false;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    setOptions({ key: KEY, v: "weekly" });

    (async () => {
      const [{ Map }, markerLib] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
      ]);
      if (cancelled || !ref.current) return;
      const map = new Map(ref.current, {
        center: { lat, lng },
        zoom: 15,
        mapId: MAP_ID || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      marker = new markerLib.AdvancedMarkerElement({ map, position: { lat, lng } });
    })();

    return () => {
      cancelled = true;
      if (marker) marker.map = null;
    };
  }, [visible, lat, lng]);

  if (!KEY) return null;
  return (
    <div
      ref={ref}
      aria-label="Зарын байршлын газрын зураг"
      className="h-64 w-full overflow-hidden rounded-xl border border-line bg-surface-2"
    />
  );
}

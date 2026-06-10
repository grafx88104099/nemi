"use client";

import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

/** Зарын байршлыг харуулах статик газрын зураг (нэг тэмдэглэгээ). */
export function ListingLocationMap({ lat, lng }: { lat: number; lng: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !KEY) return;
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
  }, [lat, lng]);

  if (!KEY) return null;
  return <div ref={ref} className="h-64 w-full overflow-hidden rounded-xl border border-line" />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Search, MapPin, X } from "lucide-react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const UB = { lat: 47.918, lng: 106.917 };

type LatLng = { lat: number; lng: number };

/**
 * Зарын байршил сонгогч — газрын зураг дээр цэг хатгах/чирэх, эсвэл хаягаар
 * хайж (geocode) тухайн цэгт байршуулна. lat/lng-г эцэг рүү дамжуулна.
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Эхний координатыг зөвхөн анхны init-д ашиглах тул ref-д барина.
  const initialRef = useRef<LatLng | null>(lat != null && lng != null ? { lat, lng } : null);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LatLng | null>(initialRef.current);
  const [err, setErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  function placeMarker(pos: LatLng, recenter = false) {
    const map = mapRef.current;
    const lib = markerLibRef.current;
    if (!map || !lib) return;
    if (!markerRef.current) {
      markerRef.current = new lib.AdvancedMarkerElement({ map, position: pos, gmpDraggable: true });
      markerRef.current.addListener("dragend", () => {
        const p = markerRef.current!.position;
        if (!p) return;
        const np = { lat: typeof p.lat === "function" ? p.lat() : (p.lat as number), lng: typeof p.lng === "function" ? p.lng() : (p.lng as number) };
        setPicked(np);
        onChangeRef.current(np.lat, np.lng);
      });
    } else {
      markerRef.current.position = pos;
    }
    if (recenter) { map.setCenter(pos); map.setZoom(16); }
    setPicked(pos);
    onChangeRef.current(pos.lat, pos.lng);
  }

  useEffect(() => {
    if (!ref.current || !KEY) return;
    let cancelled = false;
    setOptions({ key: KEY, v: "weekly" });

    (async () => {
      const [{ Map }, markerLib, geoLib] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("geocoding"),
      ]);
      if (cancelled || !ref.current) return;
      const start = initialRef.current ?? UB;
      const map = new Map(ref.current, {
        center: start,
        zoom: initialRef.current ? 16 : 12,
        mapId: MAP_ID || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      markerLibRef.current = markerLib;
      geocoderRef.current = new geoLib.Geocoder();

      if (initialRef.current) placeMarker(initialRef.current);
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) placeMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
    })();

    return () => {
      cancelled = true;
      if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
    };
  }, []);

  async function search() {
    const g = geocoderRef.current;
    if (!g || !query.trim()) return;
    setErr(null);
    setSearching(true);
    try {
      const { results } = await g.geocode({ address: query, componentRestrictions: { country: "mn" } });
      const loc = results[0]?.geometry?.location;
      if (loc) placeMarker({ lat: loc.lat(), lng: loc.lng() }, true);
      else setErr("Хаяг олдсонгүй. Газрын зураг дээр шууд цэг тавьж болно.");
    } catch {
      setErr("Хайлт амжилтгүй. Газрын зураг дээр шууд цэг тавьж болно.");
    } finally {
      setSearching(false);
    }
  }

  function clear() {
    if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
    setPicked(null);
    onChangeRef.current(null, null);
  }

  if (!KEY) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-4 text-sm text-muted">
        Газрын зургийн түлхүүр (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) тохируулаагүй тул байршил сонгох боломжгүй.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
            placeholder="Хаяг, барилга, хорооллын нэрээр хайх…"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {searching ? "Хайж байна…" : "Хайх"}
        </button>
      </div>

      <div ref={ref} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />

      <div className="flex items-center justify-between text-xs">
        {picked ? (
          <span className="flex items-center gap-1 text-muted">
            <MapPin className="size-3.5 text-brand-600" />
            {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
          </span>
        ) : (
          <span className="text-muted">Хаягаар хайх эсвэл газрын зураг дээр дарж цэг тавина уу.</span>
        )}
        {picked && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-muted hover:text-danger">
            <X className="size-3.5" /> Цэвэрлэх
          </button>
        )}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}

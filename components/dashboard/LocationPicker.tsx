"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Search, MapPin, X, Loader2 } from "lucide-react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const UB = { lat: 47.918, lng: 106.917 };

type LatLng = { lat: number; lng: number };
type Suggestion = { text: string; secondary: string; prediction: { toPlace: () => unknown } };

/**
 * Зарын байршил сонгогч — хаяг бичих явцад Places санал гаргаж (autocomplete)
 * сонгоход цэг тавина; мөн газрын зураг дээр шууд цэг хатгах/чирэх боломжтой.
 * lat/lng-г эцэг рүү дамжуулна.
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
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialRef = useRef<LatLng | null>(lat != null && lng != null ? { lat, lng } : null);
  const [picked, setPicked] = useState<LatLng | null>(initialRef.current);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const skipNextFetch = useRef(false);

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
    if (!mapElRef.current || !KEY) return;
    let cancelled = false;
    setOptions({ key: KEY, v: "weekly" });

    (async () => {
      let libs;
      try {
        libs = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
          importLibrary("places"),
        ]);
      } catch {
        if (!cancelled) setLoadError(true);
        return;
      }
      const [{ Map }, markerLib, placesLib] = libs;
      if (cancelled || !mapElRef.current) return;
      const start = initialRef.current ?? UB;
      const map = new Map(mapElRef.current, {
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
      placesRef.current = placesLib;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tokenRef.current = new (placesLib as any).AutocompleteSessionToken();

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

  // Бичих явцад санал татах (debounce).
  useEffect(() => {
    if (skipNextFetch.current) { skipNextFetch.current = false; return; }
    const places = placesRef.current;
    const text = query.trim();
    if (!places || text.length < 2) { setSuggestions([]); return; }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { suggestions: res } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          includedRegionCodes: ["mn"],
          locationBias: { center: UB, radius: 30000 },
          sessionToken: tokenRef.current,
        });
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: Suggestion[] = (res ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((s: any) => s.placePrediction)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => ({
            text: s.placePrediction.mainText?.text ?? s.placePrediction.text?.text ?? "",
            secondary: s.placePrediction.secondaryText?.text ?? "",
            prediction: s.placePrediction,
          }));
        setSuggestions(list);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  async function selectSuggestion(s: Suggestion) {
    skipNextFetch.current = true;
    setQuery(s.secondary ? `${s.text}, ${s.secondary}` : s.text);
    setSuggestions([]);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const place: any = s.prediction.toPlace();
      await place.fetchFields({ fields: ["location"] });
      const loc = place.location;
      if (loc) placeMarker({ lat: loc.lat(), lng: loc.lng() }, true);
      // Сонгосны дараа шинэ session token (billing best practice).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tokenRef.current = new (placesRef.current as any).AutocompleteSessionToken();
    } catch {
      /* сонголт амжилтгүй бол газрын зураг дээр гараар тавина */
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

  if (loadError) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-4 text-sm text-muted">
        Газрын зураг ачаалагдсангүй (сүлжээ эсвэл түлхүүрийн тохиргоо). Байршилгүйгээр зар хадгалах боломжтой.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Хаяг, барилга, хорооллын нэрээр хайх…"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm focus:border-brand-500 focus:outline-none"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span>
                    <span className="font-medium text-ink">{s.text}</span>
                    {s.secondary && <span className="block text-xs text-muted">{s.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={mapElRef} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />

      <div className="flex items-center justify-between text-xs">
        {picked ? (
          <span className="flex items-center gap-1 text-muted">
            <MapPin className="size-3.5 text-brand-600" />
            {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
          </span>
        ) : (
          <span className="text-muted">Хаягаар хайж сонгох эсвэл газрын зураг дээр дарж цэг тавина уу.</span>
        )}
        {picked && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-muted hover:text-danger">
            <X className="size-3.5" /> Цэвэрлэх
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { LocateFixed } from "lucide-react";

import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/dashboard/LocationPicker";

/**
 * Газрын зургийн цэг (өргөрөг, уртраг) + цэгийн текст хаяг (pin_address).
 * Цэгийг LocationPicker-ээр; хаягийг гараар эсвэл «Цэгээс хаяг авах» (Google
 * Geocoding — түлхүүрт идэвхгүй бол гараар бичнэ).
 */
export function PinField({
  idPrefix,
  lat,
  lng,
  address,
  onPin,
  onAddress,
  disabled,
  required,
}: {
  idPrefix: string;
  lat: number | null;
  lng: number | null;
  address: string;
  onPin: (lat: number | null, lng: number | null) => void;
  onAddress: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [geoState, setGeoState] = React.useState<"idle" | "loading" | "error">("idle");
  const hasKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const addrId = `${idPrefix}-pin-address`;

  async function fillAddress() {
    if (lat === null || lng === null) return;
    setGeoState("loading");
    try {
      const { Geocoder } = await importLibrary("geocoding");
      const res = await new Geocoder().geocode({ location: { lat, lng }, language: "mn" });
      const text = res.results?.[0]?.formatted_address?.trim();
      if (!text) throw new Error("no result");
      onAddress(text.slice(0, 300));
      setGeoState("idle");
    } catch (e) {
      console.error("crm2 geocode:", e);
      setGeoState("error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">
          Газрын зургийн цэг
          {required ? (
            <span className="ml-0.5 text-brand-600" title="Идэвхжүүлэхэд заавал">
              *
            </span>
          ) : null}
        </span>
        {disabled ? (
          <p className="text-sm text-muted">
            {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Цэг тавиагүй"}
          </p>
        ) : (
          <LocationPicker lat={lat} lng={lng} onChange={onPin} />
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={addrId} className="block text-sm font-medium text-ink">
          Цэгийн хаяг
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={addrId}
            value={address}
            maxLength={300}
            disabled={disabled}
            placeholder="Газрын зураг дээрх хаяг"
            onChange={(e) => onAddress(e.target.value)}
          />
          {hasKey && !disabled && lat !== null && lng !== null ? (
            <button
              type="button"
              onClick={fillAddress}
              disabled={geoState === "loading"}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              <LocateFixed className="size-4" aria-hidden />
              {geoState === "loading" ? "Хайж байна…" : "Цэгээс хаяг авах"}
            </button>
          ) : null}
        </div>
        {geoState === "error" ? (
          <p className="text-xs text-amber-700">Хаягийг автоматаар олж чадсангүй — гараар бичнэ үү.</p>
        ) : (
          <p className="text-xs text-muted">Цэгийн өргөрөг, уртрагтай хамт хадгалагдана.</p>
        )}
      </div>
    </div>
  );
}

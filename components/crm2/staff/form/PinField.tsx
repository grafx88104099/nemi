"use client";

import * as React from "react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { LocateFixed, MapPinPlus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/dashboard/LocationPicker";
import type { Crm2FieldStage } from "@/lib/crm2/labels";

import { StageTag } from "./fields";

/**
 * Газрын зургийн цэг (өргөрөг, уртраг) + цэгийн текст хаяг (pin_address).
 * Цэгийг LocationPicker-ээр; хаягийг гараар эсвэл «Цэгээс хаяг авах» (Google
 * Geocoding — зөвхөн товчоор; түлхүүрт идэвхгүй бол гараар бичнэ). collapsible үед (шинэ хөрөнгө)
 * цэг тавиагүй бол газрын зураг 44px «Газрын зураг дээр цэг тавих» товчны ард нуугдана.
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
  stage,
  collapsible,
}: {
  idPrefix: string;
  lat: number | null;
  lng: number | null;
  address: string;
  onPin: (lat: number | null, lng: number | null) => void;
  onAddress: (value: string) => void;
  disabled?: boolean;
  /** @deprecated stage-ийг ашиглана. */
  required?: boolean;
  stage?: Crm2FieldStage | null;
  /** Цэггүй үед газрын зургийг товчны ард нуух (шинэ хөрөнгө). */
  collapsible?: boolean;
}) {
  const [geoState, setGeoState] = React.useState<"idle" | "loading" | "error">("idle");
  const hasKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const addrId = `${idPrefix}-pin-address`;
  const hasPin = lat !== null && lng !== null;
  const [expanded, setExpanded] = React.useState(false);
  const tag = stage ?? (required ? "start" : null);

  if (collapsible && !hasPin && !expanded && !address) {
    return (
      <div className="space-y-1.5">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
          Газрын зургийн цэг
          {tag ? <StageTag stage={tag} /> : null}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setExpanded(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:border-brand-400 hover:bg-brand-50/50 disabled:opacity-50 sm:w-auto"
        >
          <MapPinPlus className="size-4" aria-hidden />
          Газрын зураг дээр цэг тавих
        </button>
      </div>
    );
  }

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
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
          Газрын зургийн цэг
          {tag ? <StageTag stage={tag} /> : null}
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

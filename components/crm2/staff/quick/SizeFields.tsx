"use client";

import { FormField } from "@/components/crm2/staff/form/fields";
import { FloorField, type FloorFieldValue } from "@/components/crm2/staff/form/FloorField";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ROOM_CHIPS = ["1", "2", "3", "4"] as const;

/**
 * Хэмжээ: талбай (м², аравтын гар), өрөө (1–4 товч, «5+» дарвал тоон талбар), давхар («12/18» нэг
 * талбар). Бүгд заавал биш — дараа нь картаас гүйцээнэ.
 */
export function SizeFields({
  area,
  rooms,
  floor,
  auto,
  errors,
  disabled,
  onArea,
  onRooms,
  onFloor,
  onBlurField,
  onConfirm,
}: {
  area: string;
  rooms: string;
  floor: FloorFieldValue;
  auto: (formKey: string) => boolean;
  errors: Record<string, string | null | undefined>;
  disabled?: boolean;
  onArea: (v: string) => void;
  onRooms: (v: string) => void;
  onFloor: (v: FloorFieldValue) => void;
  onBlurField: (formKey: string) => void;
  onConfirm: (...formKeys: string[]) => void;
}) {
  const many = rooms !== "" && !(ROOM_CHIPS as readonly string[]).includes(rooms);
  const roomsNum = Number(rooms);
  const showNumber = many || (rooms !== "" && roomsNum >= 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-[minmax(0,9rem)_1fr]">
        <FormField
          label="Талбай (м²)"
          htmlFor="qa-area_m2"
          error={errors.area_m2}
          unconfirmed={auto("area_m2")}
          onConfirm={() => onConfirm("area_m2")}
        >
          <Input
            id="qa-area_m2"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            placeholder="жишээ: 81.5"
            value={area}
            disabled={disabled}
            onChange={(e) => onArea(e.target.value.replace(/[^0-9.,\s]/g, "").slice(0, 12))}
            onBlur={() => onBlurField("area_m2")}
            className="h-12 text-base sm:h-11 sm:text-sm"
          />
        </FormField>
        <FormField label="Өрөө" htmlFor="qa-rooms" unconfirmed={auto("rooms")} onConfirm={() => onConfirm("rooms")}>
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Өрөөний тоо" className="flex flex-wrap gap-2">
              {ROOM_CHIPS.map((r) => {
                const on = rooms === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => onRooms(on ? "" : r)}
                    className={chip(on)}
                  >
                    {r}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={showNumber}
                disabled={disabled}
                onClick={() => onRooms(showNumber ? "" : "5")}
                className={chip(showNumber)}
              >
                5+
              </button>
            </div>
            {showNumber ? (
              <Input
                id="qa-rooms"
                aria-label="Өрөөний тоо"
                inputMode="numeric"
                enterKeyHint="next"
                value={rooms}
                disabled={disabled}
                onChange={(e) => onRooms(e.target.value.replace(/\D/g, "").slice(0, 2))}
                className="h-12 w-28 text-base sm:h-11 sm:text-sm"
              />
            ) : null}
          </div>
        </FormField>
      </div>
      <FloorField
        id="qa-floor"
        value={floor}
        onChange={onFloor}
        error={errors.floor}
        disabled={disabled}
        unconfirmed={auto("floor") || auto("building_floors")}
        onBlur={() => onBlurField("floor")}
      />
      {auto("floor") || auto("building_floors") ? (
        <div className="-mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onConfirm("floor", "building_floors")}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Давхар зөв
          </button>
        </div>
      ) : null}
    </div>
  );
}

function chip(on: boolean) {
  return cn(
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50",
    on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink hover:bg-surface-2"
  );
}

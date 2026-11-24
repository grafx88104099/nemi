"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { describeFloor, parseFloorText } from "@/lib/crm2/listing-text/floor";

/**
 * Давхар + барилгын давхар — НЭГ талбар: «12/18», «12 18», «12.18», «12».
 *
 * Гар утасны тоон гар (inputMode=numeric) дээр «/» байдаггүй тул талбарын
 * дотор «/» товч байна: pointerdown/mousedown дээр preventDefault хийж
 * фокусыг (гарыг) талбарт үлдээнэ, курсорын байрлалд setRangeText-ээр
 * оруулна. Зай болон «.» мөн тусгаарлагч болно (Android-ийн тоон гар).
 *
 * Эцэгт мөр хэлбэрээр (маягтын төлөвтэй ижил) буцаана: уншиж чадвал
 * {floor:"12", building_floors:"18"}; чадахгүй бол бичсэнийг floor-д нь
 * үлдээж (building_floors:"") — маягтын шалгалт «тоо биш» гэж барина,
 * бичсэн зүйл чимээгүй алга болохгүй.
 */

export type FloorFieldValue = { floor: string; building_floors: string };

/** Маягтын утгаас талбарын бичвэр: «12/18», «12», «». */
export function floorTextFromValues(v: FloorFieldValue): string {
  const f = v.floor.trim();
  const b = v.building_floors.trim();
  if (!f && !b) return "";
  if (!b) return f;
  return `${f}/${b}`;
}

/** Талбарын бичвэрээс маягтын утга (дээрх тайлбарын дүрмээр). */
export function floorValuesFromText(text: string): FloorFieldValue {
  const t = text.trim();
  if (!t) return { floor: "", building_floors: "" };
  const p = parseFloorText(t);
  if (!p) return { floor: t, building_floors: "" };
  return { floor: String(p.floor), building_floors: p.buildingFloors === null ? "" : String(p.buildingFloors) };
}

/** Шууд харагдах тайлбар: «12-р давхар / 18 давхартай»; уншигдахгүй бол null. */
export function floorPreview(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const p = parseFloorText(t);
  if (!p) return null;
  return describeFloor(p.floor, p.buildingFloors);
}

/** Фокус алдахад харуулах алдаа (хоосон бол алдаагүй). */
export function floorBlurError(text: string): string | null {
  const t = text.trim();
  if (!t || parseFloorText(t)) return null;
  const nums = t.match(/-?\d+/g) ?? [];
  if (nums.length === 2) {
    const a = Number(nums[0]);
    const b = Math.abs(Number(nums[1]));
    if (a > b) return "Давхар нь барилгын давхраас их байна";
  }
  return "Давхрыг «12/18» эсвэл «12» хэлбэрээр бичнэ үү";
}

/** Курсорын байрлалд текст оруулна (setRangeText-тэй ижил үр дүн; цэвэр функц). */
export function insertAtCaret(
  value: string,
  start: number | null,
  end: number | null,
  insert: string
): { value: string; caret: number } {
  const s = start ?? value.length;
  const e = end ?? s;
  const next = value.slice(0, s) + insert + value.slice(e);
  return { value: next, caret: s + insert.length };
}

/**
 * Эхний «-» тэмдгийг нэмнэ/хасна (подвал): iPhone-ий тоон гарт хасах товч байдаггүй.
 * Курсорыг тэмдгийн шилжилтийн хэмжээгээр зөөнө (цэвэр функц).
 */
export function toggleLeadingMinus(value: string, caret: number | null): { value: string; caret: number } {
  const lead = value.length - value.trimStart().length;
  const at = caret ?? value.length;
  if (value[lead] === "-" || value[lead] === "−") {
    return { value: value.slice(0, lead) + value.slice(lead + 1), caret: Math.max(lead, at - 1) };
  }
  return { value: `${value.slice(0, lead)}-${value.slice(lead)}`, caret: at + 1 };
}

export function FloorField({
  id,
  value,
  onChange,
  label = "Давхар",
  error,
  disabled,
  unconfirmed,
  onBlur,
}: {
  id?: string;
  value: FloorFieldValue;
  onChange: (value: FloorFieldValue) => void;
  label?: string;
  /** Серверийн / маягтын алдаа (дотоод blur шалгалтаас давамгайлна). */
  error?: string | null;
  disabled?: boolean;
  /** Наасан/санал болгосон, баталгаажаагүй утга — шар өнгөөр. */
  unconfirmed?: boolean;
  onBlur?: () => void;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const slashRef = React.useRef<HTMLButtonElement>(null);
  const minusRef = React.useRef<HTMLButtonElement>(null);

  const [text, setText] = React.useState(() => floorTextFromValues(value));
  const [blurError, setBlurError] = React.useState<string | null>(null);

  // Гаднаас (наалт, ноорог сэргээх) утга солигдвол бичвэрийг шинэчилнэ — гэхдээ
  // одоогийн бичвэрийн уншлагатай ижил бол хэрэглэгчийн бичсэн хэлбэрийг хөндөхгүй.
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue.floor !== value.floor || prevValue.building_floors !== value.building_floors) {
    setPrevValue(value);
    const mine = floorValuesFromText(text);
    if (mine.floor !== value.floor || mine.building_floors !== value.building_floors) {
      setText(floorTextFromValues(value));
      setBlurError(null);
    }
  }

  function update(next: string) {
    setText(next);
    if (blurError && !floorBlurError(next)) setBlurError(null);
    const v = floorValuesFromText(next);
    if (v.floor !== value.floor || v.building_floors !== value.building_floors) onChange(v);
  }

  function insertSlash() {
    const el = inputRef.current;
    if (!el || disabled) return;
    const focused = document.activeElement === el;
    const start = focused ? el.selectionStart : el.value.length;
    const end = focused ? el.selectionEnd : el.value.length;
    try {
      el.setRangeText("/", start ?? el.value.length, end ?? el.value.length, "end");
      update(el.value);
    } catch {
      const r = insertAtCaret(el.value, start, end, "/");
      update(r.value);
      requestAnimationFrame(() => el.setSelectionRange(r.caret, r.caret));
    }
    if (!focused) el.focus();
  }

  function toggleMinus() {
    const el = inputRef.current;
    if (!el || disabled) return;
    const focused = document.activeElement === el;
    const r = toggleLeadingMinus(el.value, focused ? el.selectionStart : el.value.length);
    update(r.value);
    requestAnimationFrame(() => {
      if (!focused) el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  }

  const preview = floorPreview(text);
  const shownError = error || blurError;

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-12 items-center rounded-xl border bg-surface pr-1 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 sm:h-11",
          shownError ? "border-danger" : unconfirmed ? "border-amber-300 bg-amber-50" : "border-line",
          disabled && "opacity-50"
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          placeholder="12/18"
          value={text}
          disabled={disabled}
          aria-invalid={!!shownError || undefined}
          aria-describedby={hintId}
          onChange={(e) => update(e.target.value)}
          onBlur={(e) => {
            // «/» товч дарахад талбар түр фокус алдаж болно — тэр үед шалгахгүй.
            if (e.relatedTarget && (e.relatedTarget === slashRef.current || e.relatedTarget === minusRef.current)) return;
            setBlurError(floorBlurError(e.currentTarget.value));
            onBlur?.();
          }}
          className="h-full min-w-0 flex-1 rounded-xl bg-transparent px-3.5 text-base text-ink tabular-nums placeholder:text-subtle focus:outline-none"
        />
        <button
          ref={minusRef}
          type="button"
          disabled={disabled}
          aria-label="Хасах тэмдэг (подвал) нэмэх эсвэл хасах"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMinus}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          −
        </button>
        <button
          ref={slashRef}
          type="button"
          disabled={disabled}
          aria-label="Тусгаарлагч «/» оруулах"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertSlash}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          /
        </button>
      </div>
      <p id={hintId} className={cn("text-xs", shownError ? "text-danger" : "text-muted")} role={shownError ? "alert" : undefined}>
        {shownError ? shownError : preview ? <span className="font-medium text-ink">{preview}</span> : "Давхар / барилгын давхар — жишээ нь 12/18. Подвал бол «−» товчоор хасах тоо."}
      </p>
    </div>
  );
}

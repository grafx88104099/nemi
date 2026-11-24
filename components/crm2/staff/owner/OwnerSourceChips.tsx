"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { OTHER_SOURCE, OWNER_SOURCE_NOTE_MAX, orderedSources } from "./owner-model";

/**
 * Эзний эх сурвалж (contact.sources) — нэг мөр чип. Юуг ч урьдчилан сонгохгүй; зөвхөн сүүлд
 * ашигласныг шар «шалгана уу»-тай харуулна (дахин товшвол баталгаажна). «Бусад» тайлбар ≤ 200.
 */
export function OwnerSourceChips({
  idPrefix,
  sources,
  value,
  guessed,
  note,
  noteError,
  disabled,
  onChange,
  onConfirm,
  onNoteChange,
}: {
  idPrefix: string;
  sources: Record<string, string>;
  value: string | null;
  /** Сүүлд ашигласнаар урьдчилан сонгосон. */
  guessed: boolean;
  note: string;
  /** Тайлбарын алдаа (blur-ийн дараа харуулна). */
  noteError?: string | null;
  disabled?: boolean;
  onChange: (code: string | null) => void;
  onConfirm: () => void;
  onNoteChange: (note: string) => void;
}) {
  const items = React.useMemo(() => orderedSources(sources), [sources]);
  const [noteTouched, setNoteTouched] = React.useState(false);
  const labelId = `${idPrefix}-source-label`;
  const noteId = `${idPrefix}-source-note`;
  const noteErrId = `${noteId}-err`;
  const showNoteError = noteTouched && noteError;

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-medium text-ink">
        Эзэн хаанаас ирсэн бэ?
        {value && guessed ? (
          <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">шалгана уу</span>
        ) : null}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = value === it.code;
          const yellow = on && guessed;
          return (
            <button
              key={it.code}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => {
                if (on && guessed) onConfirm();
                else if (on) onChange(null);
                else onChange(it.code);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-soft disabled:opacity-50",
                yellow
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : on
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line bg-surface text-ink hover:bg-surface-2"
              )}
            >
              {on && !guessed ? <Check className="size-3.5" aria-hidden /> : null}
              {it.label}
            </button>
          );
        })}
      </div>
      {value && guessed ? (
        <p className="text-xs text-amber-900">Өмнөх бүртгэлийнхээр сонгосон — зөв бол дахин товшино уу.</p>
      ) : null}
      {value === OTHER_SOURCE ? (
        <div className="space-y-1">
          <label htmlFor={noteId} className="block text-sm font-medium text-ink">
            Тайлбар
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            maxLength={OWNER_SOURCE_NOTE_MAX}
            disabled={disabled}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={showNoteError ? true : undefined}
            aria-describedby={showNoteError ? noteErrId : undefined}
            placeholder="Жишээ: хөршийн санал болгосноор"
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => setNoteTouched(true)}
            className={cn(
              "h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-ink sm:text-sm",
              "placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
              showNoteError ? "border-rose-300" : "border-line"
            )}
          />
          <div className="flex justify-between gap-2 text-xs">
            <span id={noteErrId} className="text-rose-700">
              {showNoteError ? noteError : ""}
            </span>
            <span className="text-muted">
              {note.length}/{OWNER_SOURCE_NOTE_MAX}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

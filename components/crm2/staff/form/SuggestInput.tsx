"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Санал гаргадаг оруулга (combobox): бичих явцад (debounce) `load`-оор санал
 * татаж жагсаана; сум, Enter, Escape-ээр удирдана. Сонгоход `onPick`, жагсаалтаас
 * сонгоогүй Enter-д `onEnter`. Төсөл, байршлын шүүлтүүр ба маягтад ашиглана.
 */

export type Suggestion = { key: string; label: string; hint?: string };

export function SuggestInput({
  id,
  value,
  onValueChange,
  onPick,
  onEnter,
  load,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  disabled,
  maxLength,
  debounceMs = 250,
  emptyText = "Санал олдсонгүй",
  invalid,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onPick: (item: Suggestion) => void;
  onEnter?: (value: string) => void;
  load: (query: string) => Promise<Suggestion[]>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  maxLength?: number;
  debounceMs?: number;
  /** Санал хоосон үед харуулах текст (null бол жагсаалтыг хаана). */
  emptyText?: string | null;
  invalid?: boolean;
}) {
  const autoId = React.useId();
  const listId = `${id ?? autoId}-list`;
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const timer = React.useRef<number | null>(null);
  const seq = React.useRef(0);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  function schedule(query: string, delay = debounceMs) {
    if (timer.current) window.clearTimeout(timer.current);
    const mySeq = ++seq.current;
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        const res = await load(query.trim());
        if (mySeq !== seq.current) return;
        setItems(res);
        setActive(-1);
        setLoaded(true);
      } catch (e) {
        console.error("SuggestInput:", e);
        if (mySeq === seq.current) setItems([]);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, delay);
  }

  function pick(item: Suggestion) {
    seq.current++;
    setOpen(false);
    setItems([]);
    setLoaded(false);
    setLoading(false);
    onPick(item);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        schedule(value, 0);
        return;
      }
      if (items.length) setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        pick(items[active]);
      } else if (onEnter) {
        e.preventDefault();
        setOpen(false);
        onEnter(value);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const showList = open && (items.length > 0 || (loaded && !loading && emptyText !== null));

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          schedule(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          if (!loaded) schedule(value, 0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-3.5 pr-9 text-sm text-ink placeholder:text-subtle",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
          invalid ? "border-danger" : "border-line",
          inputClassName
        )}
      />
      {loading && open ? (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle" aria-hidden />
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          ) : (
            items.map((it, i) => (
              <li
                key={it.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Blur-ээс өмнө сонгогдохын тулд mousedown дээр.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 text-sm",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2"
                )}
              >
                <span className="min-w-0 truncate font-medium text-ink">{it.label}</span>
                {it.hint ? <span className="shrink-0 text-xs text-muted">{it.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

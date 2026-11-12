"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { getStaffChatDirectory } from "@/lib/queries-staff-chat";
import type { StaffChatDirectoryEntry } from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Attendee = { profileId: string; name: string };

/** Урих хүмүүс: сонгосон чипүүд + оффисын ажилтнаас нэрээр хайж нэмэх. */
export function AttendeePicker({
  value,
  onChange,
  excludeId,
  disabled = false,
}: {
  value: Attendee[];
  onChange: (next: Attendee[]) => void;
  /** Эзэн өөрөө — жагсаалтад гарахгүй. */
  excludeId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<StaffChatDirectoryEntry[] | null | undefined>(undefined);
  const [query, setQuery] = useState("");

  // Оффисын жагсаалт (DB guard-ын зөвшөөрөх хүрээтэй ижил) — mount бүрт нэвтэрсэн хэрэглэгчийн
  // эрхээр. Модулийн түвшинд кэшлэхгүй: гарч өөр хүн орвол өмнөх оффисын жагсаалт үлдэнэ.
  useEffect(() => {
    if (!open || people !== undefined) return;
    let alive = true;
    getStaffChatDirectory(createClient()).then((list) => {
      if (alive) setPeople(list);
    });
    return () => {
      alive = false;
    };
  }, [open, people]);

  const selected = useMemo(() => new Set(value.map((a) => a.profileId)), [value]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? [])
      .filter((p) => p.profile_id !== excludeId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team_name ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [people, query, excludeId]);

  const toggle = (p: StaffChatDirectoryEntry) => {
    if (selected.has(p.profile_id)) onChange(value.filter((a) => a.profileId !== p.profile_id));
    else onChange([...value, { profileId: p.profile_id, name: p.name }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((a) => (
          <span
            key={a.profileId}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink"
          >
            <span className="truncate">{a.name}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((x) => x.profileId !== a.profileId))}
              aria-label={`${a.name}-г хасах`}
              className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          <UserPlus className="size-3.5" aria-hidden /> Хүн урих
        </button>
      </div>

      {open ? (
        <div className="space-y-2 rounded-xl border border-line p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Маягт дотор — Enter үйл явдлыг хадгалахгүй.
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Нэрээр хайх"
              aria-label="Урих хүн хайх"
              className="h-10 pl-9 text-base sm:text-sm"
            />
          </div>
          {people === undefined ? (
            <p className="px-1 py-2 text-xs text-muted" aria-busy="true">
              Ачаалж байна…
            </p>
          ) : people === null ? (
            <p className="px-1 py-2 text-xs text-danger">Жагсаалтыг ачаалж чадсангүй.</p>
          ) : shown.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted">Хүн олдсонгүй.</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain">
              {shown.map((p) => {
                const on = selected.has(p.profile_id);
                return (
                  <li key={p.profile_id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() => toggle(p)}
                      className={cn(
                        "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm",
                        on ? "bg-brand-50" : "hover:bg-surface-2"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{p.name}</span>
                        {p.team_name ? <span className="block truncate text-xs text-muted">{p.team_name}</span> : null}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border",
                          on ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong"
                        )}
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

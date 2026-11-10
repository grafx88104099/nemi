"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { getStaffChatDirectory } from "@/lib/queries-staff-chat";
import type { StaffChatDirectoryEntry } from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { ChatAvatar } from "./ChatAvatar";

const ROLE_LABEL: Partial<Record<StaffChatDirectoryEntry["role"], string>> = {
  agent: "Агент",
  office_admin: "Оффисын удирдлага",
};

/** Оффисын хүмүүсээс хайж сонгоно. selected өгвөл олон сонголтын горим. */
export function PersonPicker({
  onPick,
  selected,
  excludeIds,
  disabled = false,
}: {
  onPick: (profileId: string) => void;
  selected?: ReadonlySet<string>;
  excludeIds?: ReadonlySet<string>;
  disabled?: boolean;
}) {
  // undefined = ачаалж байна, null = алдаа.
  const [people, setPeople] = useState<StaffChatDirectoryEntry[] | null | undefined>(undefined);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    getStaffChatDirectory(createClient()).then((list) => {
      if (active) setPeople(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter(
      (p) =>
        !excludeIds?.has(p.profile_id) &&
        (!q || p.name.toLowerCase().includes(q) || p.team_name?.toLowerCase().includes(q))
    );
  }, [people, query, excludeIds]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Нэрээр хайх"
          aria-label="Хүн хайх"
          className="h-10 pl-9 text-base lg:text-sm"
        />
      </div>

      {people === undefined ? (
        <div className="space-y-2" aria-busy="true" aria-label="Ачаалж байна">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : people === null ? (
        <EmptyState compact title="Жагсаалтыг ачаалж чадсангүй" description="Цонхыг хаагаад дахин оролдоно уу." />
      ) : shown.length === 0 ? (
        <EmptyState compact title="Хүн олдсонгүй" />
      ) : (
        <ul className="space-y-0.5">
          {shown.map((person) => {
            const isSelected = selected?.has(person.profile_id) ?? false;
            return (
              <li key={person.profile_id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected ? isSelected : undefined}
                  onClick={() => onPick(person.profile_id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                    isSelected ? "bg-brand-50" : "hover:bg-surface-2"
                  )}
                >
                  <ChatAvatar kind="direct" avatarUrl={person.avatar_url} name={person.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {person.team_name ?? ROLE_LABEL[person.role] ?? "Ажилтан"}
                    </span>
                  </span>
                  {selected ? (
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        isSelected ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong"
                      )}
                    >
                      {isSelected ? <Check className="size-3" /> : null}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

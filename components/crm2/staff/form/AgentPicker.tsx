"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { foldSearchText } from "@/lib/search/fold";
import { useMediaQuery } from "@/components/crm2/ui/bottom-sheet";
import type { Crm2StaffMember } from "@/lib/crm2/types";

/**
 * Агент сонгох жагсаалт (listbox) — шууд маягт дотор эсвэл BottomSheet дотор.
 *
 * Дараалал: «Би», дараа нь миний баг, дараа нь бусад. Мөр бүр ≥ 44px.
 * Хайлт зөвхөн том дэлгэцэд (≥ 1024px) эсвэл 10-аас олон сонголттой үед.
 * Одоогийн утга жагсаалтад байхгүй (ажлаас гарсан г.м.) бол «(идэвхгүй)» мөр
 * сонгогдсон хэвээр харагдана — утга чимээгүй алга болохгүй.
 *
 * teamIds: миний багийн team_id-ууд ЭСВЭЛ багийн гишүүдийн profile_id — аль
 * нь ч таарвал «Миний баг» хэсэгт орно.
 */

export const AGENT_SEARCH_MIN_OPTIONS = 10;
const DESKTOP_QUERY = "(min-width: 1024px)";

export type AgentPickerRow = {
  id: string;
  name: string;
  team: string | null;
  group: "me" | "team" | "rest" | "inactive";
};

/** Жагсаалтын мөрүүдийг дараалалд оруулна (цэвэр функц). */
export function orderAgentRows(
  staff: readonly Pick<Crm2StaffMember, "profile_id" | "name" | "team_id" | "team_name">[],
  meId: string | null | undefined,
  teamIds: readonly string[] | null | undefined,
  value: string | null | undefined
): AgentPickerRow[] {
  const team = new Set(teamIds ?? []);
  const byName = (a: AgentPickerRow, b: AgentPickerRow) => a.name.localeCompare(b.name, "mn");
  const me: AgentPickerRow[] = [];
  const mine: AgentPickerRow[] = [];
  const rest: AgentPickerRow[] = [];
  const seen = new Set<string>();
  for (const s of staff) {
    if (seen.has(s.profile_id)) continue;
    seen.add(s.profile_id);
    const row = { id: s.profile_id, name: s.name, team: s.team_name };
    if (meId && s.profile_id === meId) me.push({ ...row, group: "me" });
    else if (team.has(s.profile_id) || (s.team_id && team.has(s.team_id))) mine.push({ ...row, group: "team" });
    else rest.push({ ...row, group: "rest" });
  }
  const inactive: AgentPickerRow[] =
    value && !seen.has(value) ? [{ id: value, name: "(идэвхгүй)", team: null, group: "inactive" }] : [];
  return [...inactive, ...me, ...mine.sort(byName), ...rest.sort(byName)];
}

/** Хайлтын шүүлт (фолдсон нэр + баг). «Би» болон идэвхгүй мөр үргэлж үлдэнэ. */
export function filterAgentRows(rows: AgentPickerRow[], query: string): AgentPickerRow[] {
  const q = foldSearchText(query).trim();
  if (!q) return rows;
  return rows.filter(
    (r) => r.group === "me" || r.group === "inactive" || foldSearchText(`${r.name} ${r.team ?? ""}`).includes(q)
  );
}

const GROUP_LABEL: Record<AgentPickerRow["group"], string | null> = {
  inactive: null,
  me: null,
  team: "Миний баг",
  rest: "Бусад",
};

export function AgentPicker({
  value,
  onChange,
  staff,
  meId,
  teamIds,
  label,
  allowEmpty,
}: {
  value: string;
  onChange: (value: string) => void;
  staff: Crm2StaffMember[];
  meId: string | null;
  teamIds: string[];
  label: string;
  /** «— Сонгоогүй —» мөр (утгыг хоослох). */
  allowEmpty?: boolean;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);

  const rows = React.useMemo(() => orderAgentRows(staff, meId, teamIds, value), [staff, meId, teamIds, value]);
  const showSearch = desktop || rows.length > AGENT_SEARCH_MIN_OPTIONS;
  const shown = showSearch ? filterAgentRows(rows, query) : rows;

  type Opt = { id: string; row: AgentPickerRow | null };
  const options: Opt[] = [...(allowEmpty ? [{ id: "", row: null }] : []), ...shown.map((r) => ({ id: r.id, row: r }))];
  const selectedIndex = options.findIndex((o) => o.id === value);
  const [active, setActive] = React.useState<number | null>(null);
  const activeIndex = active !== null && active < options.length ? active : Math.max(0, selectedIndex);

  function focusOption(i: number) {
    const n = Math.max(0, Math.min(options.length - 1, i));
    setActive(n);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${n}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = activeIndex;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusOption(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusOption(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusOption(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[i];
      if (o) onChange(o.id);
    }
  }

  function renderOption(o: Opt, i: number) {
    const selected = o.id === value;
    const r = o.row;
    const title = !r ? "— Сонгоогүй —" : r.group === "me" ? `Би · ${r.name}` : r.name;
    return (
      <div
        key={o.id || "__empty"}
        id={`${listId}-${i}`}
        role="option"
        aria-selected={selected}
        tabIndex={i === activeIndex ? 0 : -1}
        data-index={i}
        onClick={() => {
          setActive(i);
          onChange(o.id);
        }}
        onFocus={() => setActive(i)}
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-focus-soft",
          selected ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-surface-2"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", r?.group === "me" && "font-semibold", (!r || r.group === "inactive") && "text-muted")}>
            {title}
          </span>
          {r?.team ? <span className="block truncate text-xs text-muted">{r.team}</span> : null}
        </span>
        {selected ? <Check className="size-4 shrink-0 text-brand-600" aria-hidden /> : null}
      </div>
    );
  }

  // Бүлгийн гарчигтай хуваана (listbox > group > option).
  const sections: { key: string; label: string | null; items: { o: Opt; i: number }[] }[] = [];
  options.forEach((o, i) => {
    const group = o.row?.group ?? "me";
    const labelText = GROUP_LABEL[group];
    const last = sections[sections.length - 1];
    const key = labelText ?? "top";
    if (last && last.key === key) last.items.push({ o, i });
    else sections.push({ key, label: labelText, items: [{ o, i }] });
  });

  return (
    <div className="space-y-2">
      {showSearch ? (
        <label className="relative block">
          <span className="sr-only">{`${label} — хайх`}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusOption(0);
              }
            }}
            aria-controls={listId}
            placeholder="Нэр, багаар хайх"
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
          />
        </label>
      ) : null}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="space-y-1"
      >
        {sections.map((s) =>
          s.label ? (
            <div key={s.key} role="group" aria-label={s.label} className="space-y-1 pt-1">
              <div aria-hidden className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {s.label}
              </div>
              {s.items.map(({ o, i }) => renderOption(o, i))}
            </div>
          ) : (
            <React.Fragment key={s.key}>{s.items.map(({ o, i }) => renderOption(o, i))}</React.Fragment>
          )
        )}
        {options.length === 0 ? <p className="px-3 py-2 text-sm text-muted">Илэрц олдсонгүй.</p> : null}
      </div>
    </div>
  );
}

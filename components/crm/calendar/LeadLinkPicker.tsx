"use client";

import { useEffect, useState } from "react";
import { Link2, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchOpportunitySources } from "@/lib/actions/crm-opportunities";
import type { DealSourceOption } from "@/lib/queries-crm-pipeline";

/** Холбосон бүртгэл: сэжим эсвэл харилцагч (RLS-ийн хүрээнд хайна). */
export type CalendarLink = { kind: "lead" | "contact"; id: string; label: string };

const KIND_LABEL: Record<CalendarLink["kind"], string> = { lead: "Сэжим", contact: "Харилцагч" };

export function LeadLinkPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CalendarLink | null;
  onChange: (next: CalendarLink | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DealSourceOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = window.setTimeout(() => {
      setLoading(true);
      searchOpportunitySources(term)
        .then((r) => {
          if (alive) setResults(r.slice(0, 8));
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
        <Link2 className="size-4 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted">{KIND_LABEL[value.kind]}: </span>
          <span className="font-medium text-ink">{value.label}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          aria-label="Холбоосыг арилгах"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  const term = query.trim();
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Маягт дотор — Enter үйл явдлыг хадгалахгүй.
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Сэжим, харилцагчийн нэр эсвэл дугаар"
          aria-label="Холбох сэжим хайх"
          className="h-10 pl-9 text-base sm:text-sm"
        />
      </div>
      {term.length >= 2 ? (
        loading && !results.length ? (
          <p className="px-1 text-xs text-muted">Хайж байна…</p>
        ) : results.length ? (
          <ul className="max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-line">
            {results.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ kind: r.kind, id: r.id, label: r.label });
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex min-h-10 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {KIND_LABEL[r.kind]}
                      {r.sub ? ` · ${r.sub}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : loading ? null : (
          <p className="px-1 text-xs text-muted">Олдсонгүй.</p>
        )
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { Search, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { createContact, searchContacts } from "@/lib/crm2/actions/contacts";
import { formatPhone } from "@/lib/crm2/phone";
import type { ContactListItem } from "@/lib/crm2/queries/contacts";
import { SEPARATE_PERSON_LABEL } from "@/lib/crm2/labels";
import type { Crm2ContactDuplicate } from "@/lib/crm2/types";

export type OwnerValue = { id: string; code: string | null; full_name: string };

/**
 * Гэрээний эзэн сонгох: харах эрхтэй харилцагчаас нэр/код/дугаараар хайх,
 * олдохгүй бол шинээр бүртгэх (crm2_create_contact — давхардлыг шалгана).
 * Гэрээний <form> дотор байрладаг тул Enter (гар утасны «Go») гэрээг илгээхгүй.
 */
export function OwnerPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: OwnerValue | null;
  onChange: (v: OwnerValue | null) => void;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ContactListItem[]>([]);
  /** results аль хайлтынх — Enter-ээр хуучин хайлтын ганц илэрцийг сонгохгүй. */
  const [resultsFor, setResultsFor] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchContacts(text, 8);
        if (!cancelled) {
          setResults(res.ok ? res.data : []);
          setResultsFor(text);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <MaskedName name={value.full_name} visible />
          <CodeChip code={value.code} />
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink sm:size-9"
          aria-label="Эзнийг солих"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <QuickCreate
        onCancel={() => setCreating(false)}
        onCreated={(v) => {
          setCreating(false);
          onChange(v);
        }}
      />
    );
  }

  const showResults = q.trim().length >= 2;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Нэр, код эсвэл утасны дугаар"
          className="pl-9"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Гэрээний маягтыг (эзэнгүй ноорог) санамсаргүй илгээхгүй; ганц илэрц бол сонгоно.
            e.preventDefault();
            if (results.length === 1 && resultsFor === q.trim()) {
              const c = results[0];
              onChange({ id: c.id, code: c.code, full_name: c.full_name });
            }
          }}
        />
      </div>
      {showResults ? (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {searching && results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Хайж байна…</li> : null}
          {!searching && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Олдсонгүй (зөвхөн таны харах эрхтэй харилцагч).</li>
          ) : null}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange({ id: c.id, code: c.code, full_name: c.full_name })}
                className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 truncate font-medium text-ink">{c.full_name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
                  {c.phones[0] ? formatPhone(c.phones[0].phone) : null}
                  <CodeChip code={c.code} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" size="touch" variant="ghost" onClick={() => setCreating(true)}>
        <UserPlus className="size-4" aria-hidden /> Шинэ харилцагчаар бүртгэх
      </Button>
    </div>
  );
}

function QuickCreate({ onCancel, onCreated }: { onCancel: () => void; onCreated: (v: OwnerValue) => void }) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dups, setDups] = React.useState<Crm2ContactDuplicate[]>([]);

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // Гэрээний маягтыг илгээхгүй — бүрэн бол харилцагчийг бүртгэнэ.
    e.preventDefault();
    if (!pending && name.trim() && phone.trim()) void create(false);
  }

  async function create(allowDuplicate: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await createContact({ full_name: name, phones: phone.trim() ? [{ phone }] : [], allow_duplicate: allowDuplicate });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data.contact_id) {
        setDups(res.data.duplicates);
        return;
      }
      onCreated({ id: res.data.contact_id, code: res.data.code, full_name: name.trim() });
    } catch (err) {
      console.error("OwnerPicker create:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <p className="text-xs font-semibold text-muted">Шинэ харилцагч (эзэн)</p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onEnter}
        enterKeyHint="next"
        placeholder="Нэр"
        aria-label="Эзний нэр"
        maxLength={160}
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={onEnter}
        enterKeyHint="done"
        placeholder="Утасны дугаар"
        aria-label="Эзний утас"
        type="tel"
        inputMode="tel"
        maxLength={40}
      />
      {dups.length ? (
        <div className="space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <p>Энэ дугаартай харилцагч бүртгэлтэй:</p>
          {dups.map((d) => (
            <p key={d.contact_id} className="flex flex-wrap items-center gap-1">
              <MaskedName name={d.display_name} visible={d.can_open} /> <CodeChip code={d.code} /> · {d.responsible_agent_name}
            </p>
          ))}
          <p>Тэр хүн бол хайлтаар сонгоно уу. Өөр хүн бол:</p>
          <Button type="button" size="touch" variant="outline" onClick={() => void create(true)} disabled={pending}>
            {SEPARATE_PERSON_LABEL}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="touch" onClick={() => void create(false)} disabled={pending || !name.trim() || !phone.trim()}>
          {pending ? "Түр хүлээнэ үү…" : "Бүртгэх"}
        </Button>
        <Button type="button" size="touch" variant="ghost" onClick={onCancel} disabled={pending}>
          Болих
        </Button>
      </div>
    </div>
  );
}

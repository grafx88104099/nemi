"use client";

import * as React from "react";
import { Phone, Search, UserPlus, UserRound, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createContact, searchContacts } from "@/lib/crm2/actions/contacts";
import { formatPhone, isValidPhone } from "@/lib/crm2/phone";
import { CONTACT_MAX_PHONES, SEPARATE_PERSON_LABEL } from "@/lib/crm2/labels";
import type { Crm2ContactDuplicate } from "@/lib/crm2/types";

import { FormAlert } from "./fields";
import { ownerPhones, type OwnerRef } from "./form-model";
import { SuggestInput, type Suggestion } from "./SuggestInput";

/**
 * Хөрөнгийн (гэрээний) эзэн сонгох: өөрийн харах эрхтэй харилцагчаас хайх, эсвэл
 * шинэ эзэн бүртгэх (crm2_create_contact — дугаарын давхардал шалгана, автоматаар
 * нэгтгэхгүй). Давхардсан дугаартай хүн олдвол харах эрхтэй бол түүнийг сонгох,
 * эс бөгөөс тусдаа хүн гэж бүртгэх сонголт гарна.
 */
export function OwnerPicker({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: OwnerRef | null;
  onChange: (owner: OwnerRef | null) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const [mode, setMode] = React.useState<"search" | "new">("search");

  if (value) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <UserRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink">{value.name}</p>
            <p className="truncate text-xs text-muted">
              {[value.code, value.phone ? formatPhone(value.phone) : null].filter(Boolean).join(" · ") || "Харилцагч"}
            </p>
          </div>
        </div>
        {!disabled ? (
          <Button type="button" variant="outline" size="touch" onClick={() => onChange(null)}>
            Солих
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Эзэн сонгох арга" className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
        <ModeTab on={mode === "search"} onClick={() => setMode("search")} icon={Search} label="Бүртгэлээс хайх" />
        <ModeTab on={mode === "new"} onClick={() => setMode("new")} icon={UserPlus} label="Шинэ эзэн" />
      </div>
      {mode === "search" ? (
        <OwnerSearch idPrefix={idPrefix} disabled={disabled} onPick={onChange} />
      ) : (
        <OwnerCreate idPrefix={idPrefix} disabled={disabled} onCreated={onChange} />
      )}
    </div>
  );
}

function ModeTab({
  on,
  onClick,
  icon: Icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition sm:h-9",
        on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function OwnerSearch({
  idPrefix,
  disabled,
  onPick,
}: {
  idPrefix: string;
  disabled?: boolean;
  onPick: (owner: OwnerRef) => void;
}) {
  const [q, setQ] = React.useState("");
  const found = React.useRef(new Map<string, OwnerRef>());

  async function load(query: string): Promise<Suggestion[]> {
    if (!query) return [];
    const res = await searchContacts(query, 10);
    if (!res.ok) return [];
    return res.data.map((c) => {
      const phone = c.phones[0]?.phone ?? null;
      found.current.set(c.id, { id: c.id, name: c.full_name, code: c.code, phone });
      return { key: c.id, label: c.full_name, hint: [c.code, phone ? formatPhone(phone) : null].filter(Boolean).join(" · ") };
    });
  }

  return (
    <div className="space-y-1.5">
      <SuggestInput
        id={`${idPrefix}-owner-search`}
        value={q}
        onValueChange={setQ}
        disabled={disabled}
        ariaLabel="Эзнийг нэр, код, утсаар хайх"
        placeholder="Нэр, код эсвэл утасны дугаар"
        load={load}
        emptyText={q.trim() ? "Таны харах эрхтэй харилцагчаас олдсонгүй" : "Нэр, код эсвэл дугаар бичнэ үү"}
        onPick={(it) => {
          const owner = found.current.get(it.key) ?? { id: it.key, name: it.label };
          setQ("");
          onPick(owner);
        }}
      />
      <p className="text-xs text-muted">Зөвхөн таны харах эрхтэй харилцагч гарна. Олдохгүй бол «Шинэ эзэн»-ээр бүртгэнэ.</p>
    </div>
  );
}

function OwnerCreate({
  idPrefix,
  disabled,
  onCreated,
}: {
  idPrefix: string;
  disabled?: boolean;
  onCreated: (owner: OwnerRef) => void;
}) {
  const [name, setName] = React.useState("");
  const [phones, setPhones] = React.useState<string[]>([""]);
  const [error, setError] = React.useState<string | null>(null);
  const [duplicates, setDuplicates] = React.useState<Crm2ContactDuplicate[] | null>(null);
  const [pending, setPending] = React.useState(false);

  function reset() {
    setName("");
    setPhones([""]);
    setDuplicates(null);
    setError(null);
  }

  async function create(allowDuplicate: boolean) {
    const fullName = name.trim();
    const list = ownerPhones(phones);
    if (!fullName) return setError("Эзний нэрийг оруулна уу.");
    if (list.length === 0) return setError("Эзний утасны дугаарыг оруулна уу.");
    const bad = list.find((p) => !isValidPhone(p.phone));
    if (bad) return setError(`«${bad.phone}» дугаар буруу байна.`);
    setPending(true);
    setError(null);
    try {
      const res = await createContact({ full_name: fullName, phones: list, allow_duplicate: allowDuplicate });
      if (!res.ok) return setError(res.error);
      if (res.data.contact_id) {
        onCreated({ id: res.data.contact_id, name: fullName, code: res.data.code, phone: list[0]?.phone ?? null });
        reset();
        return;
      }
      setDuplicates(res.data.duplicates);
    } catch (e) {
      console.error("OwnerCreate:", e);
      setError("Эзэн бүртгэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  const nameId = `${idPrefix}-owner-name`;
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line-strong p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="block text-sm font-medium text-ink">
            Эзний нэр
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={160}
            disabled={disabled || pending}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setDuplicates(null);
            }}
          />
        </div>
        {phones.map((p, i) => (
          <div key={i} className="space-y-1.5">
            <label htmlFor={`${idPrefix}-owner-phone-${i}`} className="block text-sm font-medium text-ink">
              {i === 0 ? "Утасны дугаар" : `Нэмэлт дугаар ${i}`}
            </label>
            <div className="flex gap-2">
              <Input
                id={`${idPrefix}-owner-phone-${i}`}
                type="tel"
                inputMode="tel"
                value={p}
                maxLength={40}
                disabled={disabled || pending}
                autoComplete="off"
                placeholder="9911 2233"
                onChange={(e) => {
                  const v = e.target.value;
                  setPhones((list) => list.map((x, j) => (j === i ? v : x)));
                  setDuplicates(null);
                }}
              />
              {i > 0 ? (
                <button
                  type="button"
                  aria-label="Дугаар хасах"
                  onClick={() => setPhones((list) => list.filter((_, j) => j !== i))}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {phones.length < CONTACT_MAX_PHONES ? (
        <button
          type="button"
          onClick={() => setPhones((list) => [...list, ""])}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline sm:min-h-0"
        >
          <Phone className="size-3.5" aria-hidden />
          Дугаар нэмэх
        </button>
      ) : null}

      {duplicates && duplicates.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Энэ дугаартай харилцагч бүртгэлтэй байна</p>
          <ul className="space-y-1.5">
            {duplicates.map((d) => (
              <li key={d.contact_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-ink">{d.display_name}</span>
                  <span className="text-muted"> · {d.code}</span>
                  <span className="block text-xs text-muted">Хариуцагч: {d.responsible_agent_name}</span>
                </span>
                {d.can_open ? (
                  <Button
                    type="button"
                    size="touch"
                    variant="secondary"
                    onClick={() => {
                      onCreated({ id: d.contact_id, name: d.display_name, code: d.code, phone: phones[0]?.trim() || null });
                      reset();
                    }}
                  >
                    Энэ хүнийг сонгох
                  </Button>
                ) : (
                  <span className="text-xs text-amber-900">Өөр агентын харилцагч — эзнээр холбох эрхгүй</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-900">Ижил дугаартай боловч өөр хүн бол тусдаа бүртгэнэ (автоматаар нэгтгэхгүй).</p>
        </div>
      ) : null}

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="flex flex-wrap gap-2">
        {duplicates && duplicates.length > 0 ? (
          <Button type="button" size="touch" variant="outline" disabled={disabled || pending} onClick={() => create(true)}>
            {pending ? "Түр хүлээнэ үү…" : SEPARATE_PERSON_LABEL}
          </Button>
        ) : (
          <Button type="button" size="touch" variant="secondary" disabled={disabled || pending} onClick={() => create(false)}>
            <UserPlus className="size-4" aria-hidden />
            {pending ? "Шалгаж байна…" : "Эзэн бүртгэх"}
          </Button>
        )}
      </div>
    </div>
  );
}

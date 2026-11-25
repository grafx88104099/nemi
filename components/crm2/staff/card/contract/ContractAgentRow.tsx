"use client";

import * as React from "react";
import { UserCheck } from "lucide-react";

import { AgentPicker } from "@/components/crm2/staff/form/AgentPicker";
import type { Crm2StaffMember } from "@/lib/crm2/types";

/**
 * «Гэрээ байгуулсан агент: X · Солих». Сонгоогүй бол бүртгэхэд DB бүртгэгчийг тавьж баталгаажуулна;
 * гараар сольсон утгыг ContractSheet бүртгэхийн өмнө хөрөнгөд бичнэ (contractAgentPatch).
 */
export function ContractAgentRow({
  value,
  fallbackMe,
  onChange,
  staff,
  meId,
  teamIds,
  canChange,
  disabled,
}: {
  /** Одоогийн (эсвэл сольсон) гэрээ байгуулсан агент; null — сонгоогүй. */
  value: string | null;
  /** Сонгоогүй үед бүртгэгч (би) тавигдана гэж харуулах. */
  fallbackMe: boolean;
  onChange: (id: string) => void;
  staff: Crm2StaffMember[];
  meId: string;
  teamIds: string[];
  canChange: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ids = React.useId();
  const name = (id: string) => staff.find((s) => s.profile_id === id)?.name ?? "(идэвхгүй)";
  const shown = value ? (value === meId ? `Би · ${name(value)}` : name(value)) : fallbackMe ? "Би (бүртгэхэд тавигдана)" : "Сонгоогүй";
  return (
    <section className="space-y-1.5" aria-label="Гэрээ байгуулсан агент">
      <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm">
        <UserCheck className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p id={`${ids}-label`} className="text-xs text-muted">
            Гэрээ байгуулсан агент
          </p>
          <p className="truncate font-semibold text-ink">{shown}</p>
        </div>
        {canChange ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${ids}-list`}
            aria-describedby={`${ids}-label`}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="-my-1 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {open ? "Болих" : "Солих"}
          </button>
        ) : null}
      </div>
      {open && canChange ? (
        <div id={`${ids}-list`} className="rounded-xl border border-line p-1">
          <AgentPicker
            value={value ?? ""}
            onChange={(v) => {
              onChange(v);
              setOpen(false);
            }}
            staff={staff}
            meId={meId}
            teamIds={teamIds}
            label="Гэрээ байгуулсан агент"
          />
        </div>
      ) : null}
    </section>
  );
}

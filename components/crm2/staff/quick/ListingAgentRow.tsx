"use client";

import * as React from "react";
import { UserRound } from "lucide-react";

import { AgentPicker } from "@/components/crm2/staff/form/AgentPicker";
import { UnconfirmedTag } from "@/components/crm2/staff/form/fields";
import { PROPERTY_AGENT_ROLE_LABEL } from "@/lib/crm2/labels";
import type { Crm2StaffMember } from "@/lib/crm2/types";

/**
 * «Хөрөнгө авчирсан агент: Би · өөрчлөх». Гэрээний агентыг энд ТАВИХГҮЙ (гэрээний цонх тавина).
 * Оффисын панельд сонгогч шууд нээлттэй, анхдагч утга шар («шалгана уу»).
 */
export function ListingAgentRow({
  value,
  staff,
  meId,
  teamIds,
  expanded: expandedProp,
  unconfirmed,
  disabled,
  onChange,
  onConfirm,
}: {
  value: string;
  staff: Crm2StaffMember[];
  meId: string;
  teamIds: string[];
  /** Оффисын панель — сонгогч анхнаасаа нээлттэй. */
  expanded?: boolean;
  unconfirmed?: boolean;
  disabled?: boolean;
  onChange: (profileId: string) => void;
  onConfirm: () => void;
}) {
  const [open, setOpen] = React.useState(!!expandedProp);
  const label = PROPERTY_AGENT_ROLE_LABEL.listing_agent_id;
  const who = value === meId ? "Би" : (staff.find((s) => s.profile_id === value)?.name ?? (value ? "(идэвхгүй)" : "Сонгоогүй"));

  return (
    <div className={unconfirmed ? "rounded-xl ring-2 ring-amber-300 ring-offset-1" : undefined}>
      {/* Утсанд «шалгана уу · Зөв» багтахгүй бол дараагийн мөрөнд — «…агент: Би» тасрахгүй. */}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl border border-line bg-surface px-3 py-1.5">
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <UserRound className="size-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="text-muted">{label}:</span> <span className="font-semibold">{who}</span>
          </span>
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {unconfirmed ? <UnconfirmedTag onConfirm={onConfirm} disabled={disabled} /> : null}
          <button
            type="button"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {open ? "Хаах" : "өөрчлөх"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-2 rounded-xl border border-line bg-surface p-2">
          <AgentPicker
            value={value}
            onChange={(v) => {
              onChange(v);
              if (!expandedProp) setOpen(false);
            }}
            staff={staff}
            meId={meId}
            teamIds={teamIds}
            label={label}
          />
        </div>
      ) : null}
    </div>
  );
}

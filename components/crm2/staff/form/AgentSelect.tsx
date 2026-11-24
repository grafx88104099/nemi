"use client";

import * as React from "react";
import { ChevronDown, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import type { Crm2StaffMember } from "@/lib/crm2/types";

import { AgentPicker } from "./AgentPicker";

/**
 * Оффисын CRM ажилтнаас агент сонгох — AgentPicker-ийн нимгэн бүрхүүл: 44px товч дээр
 * одоогийн агент, дарахад доод цонхонд («Би», миний баг, бусад) жагсаалт. Одоогийн утга
 * жагсаалтад байхгүй (ажлаас гарсан) бол «(идэвхгүй)» гэж үлдээнэ.
 */
export function AgentSelect({
  id,
  value,
  onChange,
  staff,
  me,
  disabled,
  emptyLabel = "— Сонгоогүй —",
  allowEmpty = true,
  currentName,
  invalid,
  label = "Агент сонгох",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  staff: Crm2StaffMember[];
  me?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
  /** Жагсаалтад байхгүй одоогийн агентын нэр. */
  currentName?: string | null;
  invalid?: boolean;
  /** Доод цонхны гарчиг. */
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const meId = me ?? null;
  const teamIds = React.useMemo(() => {
    const t = staff.find((s) => s.profile_id === meId)?.team_id;
    return t ? [t] : [];
  }, [staff, meId]);

  const cur = value ? staff.find((s) => s.profile_id === value) : null;
  const shown = !value
    ? emptyLabel
    : cur
      ? `${cur.profile_id === meId ? "Би · " : ""}${cur.name}`
      : currentName
        ? `${currentName} (идэвхгүй)`
        : "Идэвхгүй ажилтан";

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border bg-surface px-3.5 text-left text-base text-ink transition sm:text-sm",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
          invalid ? "border-danger" : "border-line"
        )}
      >
        <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-subtle")}>
          {shown}
          {cur?.team_name ? <span className="text-muted"> · {cur.team_name}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <AgentPicker
          value={value}
          onChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
          staff={staff}
          meId={meId}
          teamIds={teamIds}
          label={label}
          allowEmpty={allowEmpty}
        />
      </BottomSheet>
    </>
  );
}

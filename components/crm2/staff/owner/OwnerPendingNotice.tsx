"use client";

import { UserRoundSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { OWNER_PENDING_LABEL } from "@/lib/crm2/labels";
import { formatPhone } from "@/lib/crm2/phone";
import type { Crm2OwnerPending } from "@/lib/crm2/types";

import { OWNER_NAME_UNVERIFIED, OWNER_STATUS_TEXT } from "./owner-model";

/**
 * Карт дээр хадгалагдсан owner_pending (утас, төлөв). «Шийдвэрлэх» — эцэг бүрэлдэхүүн эзний талбарыг
 * (OwnerPhoneField mode='live', initial = draftFromPending(pending)) нээнэ. Фокус хулгайлахгүй.
 * owner_pending зөвхөн хувийн талбар харах эрхтэнд ирдэг тул утсыг харуулж болно.
 */
export function OwnerPendingNotice({
  pending,
  onResolve,
  canResolve = true,
}: {
  pending: Crm2OwnerPending;
  onResolve?: () => void;
  canResolve?: boolean;
}) {
  const phone = pending.phone ? formatPhone(pending.phone) : null;
  const at = pending.at ? fmtDateTime(pending.at) : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">
          <UserRoundSearch className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-snug">
          <p className="text-sm font-semibold text-amber-900">{OWNER_PENDING_LABEL}</p>
          <p className="text-sm text-ink">
            {phone ? <span className="font-medium tabular-nums">{phone}</span> : "Утасгүй"}
            {" · "}
            {pending.name ? pending.name : <span className="text-muted">{OWNER_NAME_UNVERIFIED}</span>}
          </p>
          <p className="text-xs text-amber-900">
            {OWNER_STATUS_TEXT[pending.status] ?? OWNER_STATUS_TEXT.pending_review}
            {at ? <span className="text-muted"> · {at}</span> : null}
          </p>
        </div>
      </div>
      {canResolve && onResolve ? (
        <Button type="button" size="touch" variant="secondary" className="w-full sm:w-auto" onClick={onResolve}>
          Шийдвэрлэх
        </Button>
      ) : null}
    </div>
  );
}

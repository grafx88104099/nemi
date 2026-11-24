"use client";

import { OwnerPendingNotice } from "@/components/crm2/staff/owner/OwnerPendingNotice";
import type { Crm2OwnerPending } from "@/lib/crm2/types";

import { useCardSheet } from "./use-card-sheet";

/** Картын дээд хэсэгт: хадгалагдсан, шийдвэрлээгүй эзэн — «Шийдвэрлэх» эзний цонхыг нээнэ. */
export function OwnerPendingBanner({ pending, canResolve }: { pending: Crm2OwnerPending; canResolve: boolean }) {
  const { open } = useCardSheet();
  return <OwnerPendingNotice pending={pending} canResolve={canResolve} onResolve={() => open("owner")} />;
}

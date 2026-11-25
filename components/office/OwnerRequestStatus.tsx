"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { setOwnerRequestStatus } from "@/lib/actions/owner-listings";

const OPTIONS = [
  ["new", "Шинэ"],
  ["contacted", "Холбогдсон"],
  ["closed", "Хаагдсан"],
] as const;

export function OwnerRequestStatus({ id, status }: { id: string; status: "new" | "contacted" | "closed" }) {
  const router = useRouter();
  const [value, setValue] = React.useState(status);
  const [pending, startTransition] = React.useTransition();
  return (
    <select
      aria-label="Хүсэлтийн төлөв"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as typeof status;
        setValue(next);
        startTransition(async () => {
          const r = await setOwnerRequestStatus(id, next);
          if (!r.ok) {
            setValue(status);
            alert(r.error ?? "Шинэчилж чадсангүй.");
          }
          router.refresh();
        });
      }}
      className="h-11 rounded-xl border border-line bg-surface px-3 text-base focus:border-brand-500 focus:outline-none sm:text-sm"
    >
      {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

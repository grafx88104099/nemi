"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteOwnerListing } from "@/lib/actions/owner-listings";

export function OwnerListingDelete({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      aria-label={`${title} устгах`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`«${title}» зарыг устгах уу? Буцаах боломжгүй.`)) return;
        startTransition(async () => {
          const r = await deleteOwnerListing(id);
          if (!r.ok) alert(r.error ?? "Устгаж чадсангүй.");
          router.refresh();
        });
      }}
      className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteListing } from "@/lib/actions/listings";

export function DeleteListingButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm("Энэ зарыг устгах уу?")) return;
    startTransition(async () => {
      await deleteListing(id);
      router.refresh();
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded-lg p-2 text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      title="Устгах"
      aria-label="Зар устгах"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteActivity } from "@/lib/actions/crm";

export function DeleteActivityButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm("Энэ бүртгэлийг устгах уу?")) return;
        start(async () => {
          await deleteActivity(id);
          router.refresh();
        });
      }}
      disabled={pending}
      aria-label="Бүртгэл устгах"
      title="Устгах"
      className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

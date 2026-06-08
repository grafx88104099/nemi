"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteLead } from "@/lib/actions/crm";

export function DeleteLeadButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm("Энэ лидийг (бүх харилцааны түүхтэй нь) устгах уу?")) return;
        start(async () => {
          const res = await deleteLead(id);
          if (res.ok) {
            router.push("/agent/leads");
            router.refresh();
          }
        });
      }}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
    >
      <Trash2 className="size-4" /> Устгах
    </button>
  );
}

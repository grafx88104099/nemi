"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteProject } from "@/lib/actions/crm";

export function DeleteProjectButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm("Энэ төслийг устгах уу? (Лидүүд хэвээр үлдэж, холбоос л арилна)")) return;
        start(async () => {
          const res = await deleteProject(id);
          if (res.ok) {
            router.push("/agent/projects");
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

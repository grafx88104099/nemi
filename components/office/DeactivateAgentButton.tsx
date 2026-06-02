"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";

import { setAgentStatus } from "@/lib/actions/offices";

export function DeactivateAgentButton({ agentId }: { agentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm("Энэ агентыг идэвхгүй болгох уу? Нийтэд харагдахаа болино.")) return;
    startTransition(async () => {
      await setAgentStatus(agentId, "rejected");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      title="Идэвхгүйжүүлэх"
    >
      <UserX className="size-3.5" /> Идэвхгүй
    </button>
  );
}

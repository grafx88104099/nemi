"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { setAgentStatus } from "@/lib/actions/offices";
import { toast } from "@/components/ui/toast";

export function AgentApproval({ agentId }: { agentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function act(status: "active" | "rejected") {
    startTransition(async () => {
      const res = await setAgentStatus(agentId, status);
      // Хүлээлцэх хориг, эрхгүй г.м. шалтгааныг харуулна (өмнө нь чимээгүй унадаг байв).
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => act("active")}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 sm:min-h-0 sm:px-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        <Check className="size-3.5" /> Батлах
      </button>
      <button
        onClick={() => act("rejected")}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 py-1.5 sm:min-h-0 sm:px-2.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
      >
        <X className="size-3.5" /> Татгалзах
      </button>
    </div>
  );
}

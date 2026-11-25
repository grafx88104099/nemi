"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";

import { setAgentStatus } from "@/lib/actions/offices";
import { DEACTIVATE_CONFIRM_TEXT } from "@/lib/office/agent-status";
import { toast } from "@/components/ui/toast";

export function DeactivateAgentButton({ agentId }: { agentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm(DEACTIVATE_CONFIRM_TEXT)) return;
    startTransition(async () => {
      const res = await setAgentStatus(agentId, "rejected");
      // CRM-д нээлттэй эзэмшил, батлагдаагүй хүлээлцэх акт эсвэл удирдлагын эрх байвал шалтгааныг харуулна.
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 sm:min-h-0 sm:px-2 sm:py-1"
      title="Идэвхгүйжүүлэх"
    >
      <UserX className="size-3.5" /> Идэвхгүй
    </button>
  );
}

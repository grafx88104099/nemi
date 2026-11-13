"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { completeTask, reopenTask } from "@/lib/crm2/actions/tasks";

/** «Хийсэн» — ажлыг дуусгаж, toast-оор буцаах боломж өгнө. */
export function TaskDoneButton({ taskId, className }: { taskId: string; className?: string }) {
  const [pending, startTransition] = React.useTransition();

  function done() {
    startTransition(async () => {
      const r = await completeTask(taskId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Ажлыг хийсэн гэж тэмдэглэлээ", {
        action: {
          label: "Буцаах",
          onClick: () => {
            void reopenTask(taskId).then((u) => (u.ok ? toast.info("Ажлыг дахин нээлээ") : toast.error(u.error)));
          },
        },
      });
    });
  }

  return (
    <Button type="button" variant="outline" size="touch" onClick={done} disabled={pending} className={className}>
      <Check className="size-4" aria-hidden />
      {pending ? "Түр хүлээнэ үү…" : "Хийсэн"}
    </Button>
  );
}

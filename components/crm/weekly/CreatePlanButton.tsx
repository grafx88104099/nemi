"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { createWeeklyPlan } from "@/lib/actions/crm-weekly";

/** Долоо хоногийн картыг үүсгэнэ — өмнөх долоо хоногийн дүн, шилжих ажлаар урьдчилан бөглөнө. */
export function CreatePlanButton({ week, label = "Картаа бөглөж эхлэх" }: { week: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await createWeeklyPlan(week);
          if (!r.ok) {
            toast.error(r.error ?? "Карт үүсгэж чадсангүй.");
            return;
          }
          toast.success("Карт бэлэн — өмнөх долоо хоногийн мэдээллээр урьдчилан бөглөгдлөө.");
          router.refresh();
        })
      }
    >
      <ClipboardList className="size-4" /> {label}
    </Button>
  );
}

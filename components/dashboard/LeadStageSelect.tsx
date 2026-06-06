"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGES, LEAD_STAGE_LABEL, type LeadStage } from "@/lib/constants";

const STAGES: [LeadStage, string][] = LEAD_STAGES.map((k) => [k, LEAD_STAGE_LABEL[k]]);

export function LeadStageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      aria-label="Лидийн шат солих"
      defaultValue={stage}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateLeadStage(id, e.target.value as LeadStage);
          router.refresh();
        })
      }
      className="h-8 rounded-lg border border-line bg-surface px-2 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-50"
    >
      {STAGES.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

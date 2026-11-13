"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShowingScheduleDialog, type ScheduleDealOption } from "@/components/crm2/deals/ShowingScheduleDialog";
import type { StaffOption } from "@/components/crm2/deals/types";

/** Картын «Үзүүлэлт» табаас: нээлттэй хэлцлээ сонгоод үзүүлэх цаг товлох. */
export function ScheduleShowingButton({
  deals,
  agentOptions,
  me,
  meName,
  label = "Үзүүлэлт товлох",
}: {
  deals: ScheduleDealOption[];
  /** Гүйцэтгэгч сонгогч (менежер/ахлагч); бусдад null. */
  agentOptions: StaffOption[] | null;
  me: string | null;
  meName?: string | null;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="touch" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" aria-hidden /> {label}
      </Button>
      <ShowingScheduleDialog
        open={open}
        onClose={() => setOpen(false)}
        deals={deals}
        agentOptions={agentOptions}
        me={me}
        meName={meName}
      />
    </>
  );
}

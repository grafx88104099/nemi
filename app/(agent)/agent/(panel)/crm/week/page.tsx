import { redirect } from "next/navigation";

import { currentWeekStart } from "@/lib/crm/week";

/** /agent/crm/week → одоогийн (УБ) долоо хоногийн карт. */
export default function AgentWeekIndex() {
  redirect(`/agent/crm/week/${currentWeekStart()}`);
}

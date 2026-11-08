import { redirect } from "next/navigation";

import { getTodayData, myCrmContext } from "@/lib/queries-crm-today";
import { getMyWorklists } from "@/lib/queries-crm-worklists";
import { CrmNav } from "@/components/crm/CrmNav";
import { AgentDayboard } from "@/components/crm/AgentDayboard";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Өнөөдөр — CRM" };

/**
 * Агентын «Өнөөдөр» дэлгэц (§8.3 Агентын хяналтын самбар, §6.22, §6.23,
 * R16): нэвтэрмэгц ирэх нэг дараалал + самбарын 7 хэсэг.
 */
export default async function AgentCrmPage() {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");

  const [data, worklists] = await Promise.all([getTodayData("/agent/crm"), getMyWorklists("/agent/crm")]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      <div className="mb-4 hidden border-b border-line md:block">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>

      <h1 className="mb-3 text-xl font-bold text-ink">Өнөөдөр</h1>

      {!data ? (
        <EmptyState
          title="Мэдээлэл ачаалагдсангүй"
          description="Хуудсыг дахин ачаалж үзнэ үү. Асуудал давтагдвал системийн админд хандана уу."
          action={{ label: "Дахин ачаалах", href: "/agent/crm" }}
        />
      ) : (
        <AgentDayboard
          data={data}
          worklists={worklists ? { counts: worklists.counts, settings: worklists.settings } : null}
          basePath="/agent/crm"
        />
      )}
    </div>
  );
}

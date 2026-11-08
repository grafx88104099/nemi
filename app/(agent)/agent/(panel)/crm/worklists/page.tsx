import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";

import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getMyWorklists } from "@/lib/queries-crm-worklists";
import { worklistLabel, WORKLIST_CODES } from "@/lib/crm/worklists";
import { CrmNav } from "@/components/crm/CrmNav";
import { WorklistsNav } from "@/components/crm/mobile/WorklistsNav";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ажлын жагсаалт — CRM" };

/** R15 Оффисын бэлэн ажлын жагсаалт (тоолууртай chip — UX-15). */
export default async function WorklistsPage() {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  const data = await getMyWorklists("/agent/crm");

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      <div className="mb-4 hidden border-b border-line md:block">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <h1 className="mb-1 text-xl font-bold text-ink">Ажлын жагсаалт</h1>
      <p className="mb-3 text-sm text-muted">Оффисын бэлэн жагсаалт — нэг жагсаалтаар дараалан залгаж, үр дүнг шууд бүртгэнэ.</p>
      <WorklistsNav active="lists" showVitals={canSeeVitals(ctx.roles)} />

      {!data ? (
        <EmptyState title="Жагсаалт ачаалагдсангүй" description="Хуудсыг дахин ачаалж үзнэ үү." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WORKLIST_CODES.filter((c) => !data.settings.disabled.includes(c)).map((code) => {
            const l = worklistLabel(code, data.settings);
            const list = data.lists[code];
            return (
              <Card key={code}>
                <CardBody>
                  <Link href={`/agent/crm/worklists/${code}`} className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{l.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                        list.length ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-muted"
                      )}
                    >
                      {list.length}
                    </span>
                    <ChevronRight className="ml-auto size-4 text-subtle" />
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">{l.hint}</p>
                  {list.length ? (
                    <ul className="mt-2 space-y-1">
                      {list.slice(0, 3).map((e) => (
                        <li key={e.key} className="flex items-center gap-2 text-sm">
                          <Link href={e.href} className="min-w-0 flex-1 truncate text-ink hover:text-brand-700">
                            {e.name}
                            <span className="text-muted"> · {e.reason}</span>
                          </Link>
                          {e.phone ? (
                            <a href={`tel:${e.phone.replace(/\s+/g, "")}`} className="shrink-0 rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50" aria-label="Залгах">
                              <Phone className="size-4" />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-subtle">Энэ жагсаалтад бүртгэл алга.</p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {data?.truncated ? <p className="mt-3 text-xs text-amber-700">Жагсаалт хэт урт тул эхний хэсгийг харуулж байна.</p> : null}
    </div>
  );
}

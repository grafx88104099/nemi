import { redirect } from "next/navigation";

import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getMyEnrollments, getTrackTemplates } from "@/lib/queries-crm-worklists";
import { WorklistsNav } from "@/components/crm/mobile/WorklistsNav";
import { TrackList } from "@/components/crm/mobile/TrackList";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Ажлын цуваа — CRM" };

/** R13: бэлэн алхмын загвар ба миний идэвхтэй цуваа. */
export default async function TracksPage() {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  const [tpl, mine] = await Promise.all([getTrackTemplates(), getMyEnrollments()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 sm:py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Ажлын цуваа</h1>
      <p className="mb-3 text-sm text-muted">
        Алхам бүр таны даалгавар болж товлогдоно. Харилцагч хариу өгөх, шат солигдох эсвэл бүртгэл хаагдахад цуваа өөрөө зогсоно.
      </p>
      <WorklistsNav active="tracks" showVitals={canSeeVitals(ctx.roles)} />

      {tpl.unavailable ? (
        <EmptyState title="Ажлын цуваа идэвхжээгүй байна" description="Өгөгдлийн сангийн шинэчлэл хүлээгдэж байна." />
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-ink">Миний цуваа</h2>
          <TrackList rows={mine.rows} />
          <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">Бэлэн загвар</h2>
          {tpl.templates.length === 0 ? (
            <EmptyState compact title="Загвар бүртгэгдээгүй" description="Борлуулалт хариуцсан захирал загвар нэмнэ." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tpl.templates.map((t) => (
                <Card key={t.id}>
                  <CardBody>
                    <p className="text-sm font-semibold text-ink">{t.name}</p>
                    <p className="text-xs text-muted">
                      {t.target === "lead" ? "Сэжимд" : t.target === "opportunity" ? "Боломжид" : "Сэжим, боломжид"}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                    <ol className="mt-2 space-y-0.5 text-xs text-muted">
                      {t.steps.map((s, i) => (
                        <li key={i}>
                          <span className="text-subtle">{s.day === 0 ? "Өнөөдөр" : `${s.day} дэх өдөр`}</span> — {s.title}
                        </li>
                      ))}
                    </ol>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

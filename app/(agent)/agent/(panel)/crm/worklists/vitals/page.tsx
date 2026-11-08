import { redirect } from "next/navigation";

import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getVitals } from "@/lib/queries-crm-worklists";
import { WorklistsNav } from "@/components/crm/mobile/WorklistsNav";
import { VitalsBoard } from "@/components/crm/mobile/VitalsBoard";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Ажлын эрүүл мэнд — CRM" };

/** R20: багийн ахлагч, удирдлагад агент бүрийн ажлын жагсаалтын тоо. */
export default async function VitalsPage() {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  if (!canSeeVitals(ctx.roles)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <EmptyState
          title="Энэ самбар багийн ахлагч, удирдлагад зориулагдсан"
          description="Өөрийн ажлын жагсаалтыг «Ажлын жагсаалт» хэсгээс харна уу."
          action={{ label: "Ажлын жагсаалт", href: "/agent/crm/worklists" }}
        />
      </div>
    );
  }
  const data = await getVitals("/agent/crm");

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Ажлын эрүүл мэнд</h1>
      <p className="mb-3 text-sm text-muted">Агент бүрийн ажлын жагсаалтын тоо — нүдэн дээр дарж нэрсийг харна.</p>
      <WorklistsNav active="vitals" showVitals />
      {data ? (
        <VitalsBoard rows={data.rows} lists={data.lists} settings={data.settings} teams={data.teams} branches={data.branches} />
      ) : (
        <EmptyState title="Самбар ачаалагдсангүй" description="Хуудсыг дахин ачаалж үзнэ үү." />
      )}
      {data?.truncated ? <p className="mt-3 text-xs text-amber-700">Бүртгэл хэт олон тул эхний хэсгийг тооцсон.</p> : null}
    </div>
  );
}

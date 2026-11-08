import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getVitals } from "@/lib/queries-crm-worklists";
import { VitalsBoard } from "@/components/crm/mobile/VitalsBoard";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Ажлын эрүүл мэнд — CRM" };

/** R20 (оффисын панель): компани, салбар, багаар агент бүрийн ажлын жагсаалтын тоо. */
export default async function OfficeVitalsPage() {
  const ctx = await myCrmContext();
  if (!ctx || !canSeeVitals(ctx.roles)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Энэ самбар багийн ахлагч, удирдлагад зориулагдсан"
          description="Таны дүрд ажлын эрүүл мэндийн самбар харагдахгүй."
          action={{ label: "CRM самбар", href: "/office/crm" }}
        />
      </div>
    );
  }
  const data = await getVitals("/office/crm");
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
      <h1 className="mb-1 text-xl font-bold text-ink">Ажлын эрүүл мэнд</h1>
      <p className="mb-4 text-sm text-muted">
        Агент бүрийн ажлын жагсаалтын тоо (холбогдоогүй шинэ сэжим, хугацаа хэтэрсэн алхам, үзлэгийн дараа хариугүй г.м.) — нүдэн дээр дарж нэрсийг харна.
      </p>
      {data ? (
        <VitalsBoard rows={data.rows} lists={data.lists} settings={data.settings} teams={data.teams} branches={data.branches} />
      ) : (
        <EmptyState title="Самбар ачаалагдсангүй" description="Хуудсыг дахин ачаалж үзнэ үү." />
      )}
      {data?.truncated ? <p className="mt-3 text-xs text-amber-700">Бүртгэл хэт олон тул эхний хэсгийг тооцсон.</p> : null}
    </div>
  );
}

import { redirect } from "next/navigation";

import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getLeaderboard } from "@/lib/queries-crm-worklists";
import { WorklistsNav } from "@/components/crm/mobile/WorklistsNav";
import { LeaderboardBoard } from "@/components/crm/mobile/LeaderboardBoard";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Тэргүүлэгчид — CRM" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tv?: string }>;
}) {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  const sp = await searchParams;
  const period = sp.period === "month" ? "month" : "week";
  const tv = sp.tv === "1";
  const data = await getLeaderboard(period);

  return (
    <div className={tv ? "px-4 py-4" : "mx-auto max-w-4xl px-4 py-4 sm:py-6"}>
      {!tv ? (
        <>
          <h1 className="mb-1 text-xl font-bold text-ink">Тэргүүлэгчид</h1>
          <p className="mb-3 text-sm text-muted">Шалгагдах үр дүнд төвлөрсөн оноо — гар бүртгэлийн тоо биш.</p>
          <WorklistsNav active="leaderboard" showVitals={canSeeVitals(ctx.roles)} />
        </>
      ) : null}
      {!data || data.unavailable ? (
        <EmptyState title="Тэргүүлэгчдийн самбар идэвхжээгүй байна" description="Өгөгдлийн сангийн шинэчлэл хүлээгдэж байна." />
      ) : (
        <LeaderboardBoard
          rows={data.rows}
          me={data.me}
          weights={data.settings.weights}
          tv={tv}
          refreshSec={data.settings.tvRefreshSec}
          period={period}
          range={data.range}
        />
      )}
    </div>
  );
}

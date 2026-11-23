import Link from "next/link";
import { Megaphone } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { channelLabel } from "@/lib/attribution";
import { getAgentChannelStats } from "@/lib/distribute/share-kit";
import { formatCountsLine, summarizeByChannel, topListings } from "@/lib/distribute/stats-model";
import { createClient } from "@/lib/supabase/server";

/** R10: агентын зарын сувгийн үр дүн (үзэлт / чат / үзлэгийн хүсэлт), сүүлийн 30 хоног. */
export async function ChannelStatsCard({ agentId }: { agentId: string }) {
  const rows = await getAgentChannelStats(agentId, 30);
  const channels = summarizeByChannel(rows);
  const top = topListings(rows, 5);

  let titles: Record<string, string> = {};
  if (top.length) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("listings")
      .select("id, title")
      .in(
        "id",
        top.map((t) => t.listingId)
      );
    if (error) console.error("ChannelStatsCard titles:", error.message);
    titles = Object.fromEntries((data ?? []).map((l) => [l.id, l.title ?? ""]));
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <Megaphone className="size-4" aria-hidden /> Түгээлтийн үр дүн · сүүлийн 30 хоног
          </h2>
          <Link href="/agent/listings" className="shrink-0 text-sm text-brand-600 hover:underline">Миний зар →</Link>
        </div>
        {channels.length === 0 ? (
          <p className="text-sm text-muted">
            Одоогоор хэмжилт алга. Зараа «Түгээх» цэснээс Facebook, Viber, unegui.mn-д тараагаарай.{" "}
            <Link href="/agent/listings" className="font-semibold text-brand-600 hover:underline">Миний зар</Link>
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Сувгаар: үзэлт, чат, үзлэгийн хүсэлт (сүүлийн 30 хоног)</caption>
                <thead className="border-b border-line text-left text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Суваг</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Үзэлт</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Чат</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Үзлэгийн хүсэлт</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {channels.map((c) => (
                    <tr key={c.channel} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">{channelLabel(c.channel)}</th>
                      <td className="px-3 py-2 text-right text-ink">{c.views}</td>
                      <td className="px-3 py-2 text-right text-ink">{c.chats}</td>
                      <td className="py-2 pl-3 text-right text-ink">{c.viewings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {top.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ink">Их үзэлттэй зарууд</h3>
                <ul className="mt-2 space-y-1">
                  {top.map((t) => (
                    <li key={t.listingId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <Link href={`/listings/${t.listingId}`} className="min-w-0 truncate font-medium text-ink hover:underline">
                        {titles[t.listingId] || "Зар"}
                      </Link>
                      <span className="text-xs tabular-nums text-muted">{formatCountsLine(t)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

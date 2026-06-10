import Link from "next/link";
import { Plus, Pencil, Share2 } from "lucide-react";

import { getMyAgent, getAgentListings, getShareCounts, getSharedWithMe } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DeleteListingButton } from "@/components/dashboard/DeleteListingButton";
import { ShareListingButton } from "@/components/dashboard/ShareListingButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { shortMNT } from "@/lib/format";
import { LISTING_STATUS, DEAL_TYPE_LABEL, type DealType } from "@/lib/constants";

const statusMeta = (s: string) =>
  LISTING_STATUS[s as keyof typeof LISTING_STATUS] ?? { label: s, tone: "neutral" as const };

export default async function MyListingsPage() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-muted">Зөвхөн агент зар удирдана.</p>
        <ButtonLink href="/office-signup" className="mt-4">Оффис нээх</ButtonLink>
      </div>
    );
  }
  const listings = await getAgentListings(agent.id as string);
  const [shareCounts, sharedWithMe] = await Promise.all([
    getShareCounts(listings.map((l) => l.id)),
    getSharedWithMe(agent.id as string),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">Миний зар ({listings.length})</h1>
        <ButtonLink href="/agent/listings/new" size="sm">
          <Plus className="size-4" /> Шинэ зар
        </ButtonLink>
      </div>

      <Card className="mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Миний зарын жагсаалт</caption>
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr>
              <th scope="col" className="p-3 font-medium">Зар</th>
              <th scope="col" className="p-3 font-medium">Төрөл</th>
              <th scope="col" className="p-3 font-medium">Үнэ</th>
              <th scope="col" className="p-3 font-medium">Дүүрэг</th>
              <th scope="col" className="p-3 font-medium">Төлөв</th>
              <th scope="col" className="p-3 font-medium">AI</th>
              <th scope="col" className="p-3"><span className="sr-only">Үйлдэл</span></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => {
              const share = shareCounts[l.id];
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link href={`/listings/${l.id}`} className="font-medium text-ink hover:underline">{l.title}</Link>
                    {share && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-brand-600" title={share.names.join(", ")}>
                        <Share2 className="size-3" /> {share.count}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge tone={l.deal_type === "rent" ? "blue" : "brand"}>
                      {DEAL_TYPE_LABEL[(l.deal_type as DealType) ?? "sale"]}
                    </Badge>
                  </td>
                  <td className="p-3 text-ink">{shortMNT(l.price)}{l.deal_type === "rent" && <span className="text-muted">/сар</span>}</td>
                  <td className="p-3 text-muted">{l.district}</td>
                  <td className="p-3"><Badge tone={statusMeta(l.status).tone}>{statusMeta(l.status).label}</Badge></td>
                  <td className="p-3 text-muted">{l.ai_score ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <ShareListingButton listingId={l.id} sharedCount={share?.count ?? 0} />
                      <Link href={`/agent/listings/${l.id}/edit`} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title="Засах" aria-label={`${l.title} зар засах`}>
                        <Pencil className="size-4" />
                      </Link>
                      <DeleteListingButton id={l.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {listings.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted">Зар алга. «Шинэ зар» дарж эхлүүлнэ үү.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {sharedWithMe.length > 0 && (
        <>
          <div className="mt-10 flex items-center gap-2">
            <Share2 className="size-4 text-brand-600" />
            <h2 className="text-lg font-bold text-ink">Надтай хуваалцсан ({sharedWithMe.length})</h2>
          </div>
          <p className="mt-1 text-sm text-muted">Оффисын хамт олны хуваалцсан зарууд. Та худалдан авагчдадаа санал болгож болно.</p>
          <Card className="mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">Надтай хуваалцсан зарууд</caption>
              <thead className="border-b border-line bg-surface-2 text-left text-muted">
                <tr>
                  <th scope="col" className="p-3 font-medium">Зар</th>
                  <th scope="col" className="p-3 font-medium">Үнэ</th>
                  <th scope="col" className="p-3 font-medium">Дүүрэг</th>
                  <th scope="col" className="p-3 font-medium">Эзэн агент</th>
                  <th scope="col" className="p-3 font-medium">Төлөв</th>
                  <th scope="col" className="p-3 font-medium">AI</th>
                </tr>
              </thead>
              <tbody>
                {sharedWithMe.map((s) => (
                  <tr key={s.listing!.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <Link href={`/listings/${s.listing!.id}`} className="font-medium text-ink hover:underline">{s.listing!.title}</Link>
                    </td>
                    <td className="p-3 text-ink">{shortMNT(s.listing!.price)}</td>
                    <td className="p-3 text-muted">{s.listing!.district}</td>
                    <td className="p-3 text-muted">{s.owner?.display_name ?? "—"}</td>
                    <td className="p-3"><Badge tone={statusMeta(s.listing!.status).tone}>{statusMeta(s.listing!.status).label}</Badge></td>
                    <td className="p-3 text-muted">{s.listing!.ai_score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { ClipboardPlus, Pencil, Share2 } from "lucide-react";

import { getMyAgent, getAgentListings, getShareCounts, getSharedWithMe } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DeleteListingButton } from "@/components/dashboard/DeleteListingButton";
import { ShareListingButton } from "@/components/dashboard/ShareListingButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { NewListingButtons } from "@/components/dashboard/NewListingButtons";
import { DistributeListingButton } from "@/components/distribute/DistributeListingButton";
import { getAgentChannelStats } from "@/lib/distribute/share-kit";
import { formatCountsCompact, formatCountsLine, summarizeByListing, ZERO_COUNTS } from "@/lib/distribute/stats-model";
import { fmtMNT } from "@/lib/format";
import { listingStatusMeta as statusMeta, DEAL_TYPE_LABEL, type DealType } from "@/lib/constants";
import { getCrm2Context } from "@/lib/crm2/context";
import { crm2Paths } from "@/lib/crm2/paths";
import { listImportableListings } from "@/lib/crm2/queries/import";

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
  const [shareCounts, sharedWithMe, channelRows, crm2] = await Promise.all([
    getShareCounts(listings.map((l) => l.id)),
    getSharedWithMe(agent.id as string),
    getAgentChannelStats(agent.id as string, 30),
    getCrm2Context(),
  ]);
  // CRM-ийн гишүүнд: Staff-д хуулагдаагүй, холбогдоогүй зар дээр «Staff-д бүртгэх» чип (P12 — зар ХУУЛАГДАНА,
  // холболт зөвхөн нийтлэх үед; энэ хуудаснаас автоматаар шилжүүлэхгүй).
  const importable =
    crm2?.isMember && crm2.canWork ? new Set((await listImportableListings(200)).map((l) => l.id)) : new Set<string>();
  const crmPaths = crm2Paths("agent");
  const byListing = summarizeByListing(channelRows);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">Миний зар ({listings.length})</h1>
        <NewListingButtons />
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
              <th scope="col" className="hidden p-3 font-medium md:table-cell">
                30 хоног<span className="sr-only"> (үзэлт, чат, үзлэгийн хүсэлт)</span>
              </th>
              <th scope="col" className="p-3 font-medium">AI</th>
              <th scope="col" className="p-3"><span className="sr-only">Үйлдэл</span></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => {
              const share = shareCounts[l.id];
              const counts = byListing[l.id] ?? ZERO_COUNTS;
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link href={`/listings/${l.id}`} className="font-medium text-ink hover:underline">{l.title}</Link>
                    {importable.has(l.id) ? (
                      <Link
                        href={crmPaths.staffIncomplete({ import: l.id })}
                        className="mt-1 flex min-h-11 w-fit items-center gap-1 rounded-full bg-amber-50 px-2.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 sm:min-h-8"
                      >
                        <ClipboardPlus className="size-3.5 shrink-0" aria-hidden />
                        Эзэн, гэрээ бүртгэгдээгүй — Staff-д бүртгэх
                      </Link>
                    ) : null}
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
                  <td className="p-3 text-ink">{fmtMNT(l.price)}{l.deal_type === "rent" && <span className="text-muted">/сар</span>}</td>
                  <td className="p-3 text-muted">{l.district}</td>
                  <td className="p-3"><Badge tone={statusMeta(l.status).tone}>{statusMeta(l.status).label}</Badge></td>
                  <td className="hidden p-3 text-xs tabular-nums text-muted md:table-cell">
                    <span aria-hidden>{formatCountsCompact(counts)}</span>
                    <span className="sr-only">{formatCountsLine(counts)}</span>
                  </td>
                  <td className="p-3 text-muted">{l.ai_score ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      {l.status === "active" ? <DistributeListingButton listingId={l.id} title={l.title} /> : null}
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
              <tr><td colSpan={8} className="p-8 text-center text-muted">Зар алга. «Шинэ зар» дарж эхлүүлнэ үү.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 hidden text-xs text-muted md:block">30 хоног: үзэлт · чат · үзлэгийн хүсэлт</p>

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
                    <td className="p-3 text-ink">{fmtMNT(s.listing!.price)}</td>
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

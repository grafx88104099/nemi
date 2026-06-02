import Link from "next/link";
import { Plus, Pencil } from "lucide-react";

import { getMyAgent, getAgentDashboard } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DeleteListingButton } from "@/components/dashboard/DeleteListingButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { shortMNT } from "@/lib/format";

const STATUS: Record<string, { label: string; tone: "green" | "neutral" | "amber" | "rose" }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  draft: { label: "Ноорог", tone: "neutral" },
  review: { label: "Хянуулж буй", tone: "amber" },
  sold: { label: "Зарагдсан", tone: "rose" },
};

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
  const { listings } = await getAgentDashboard(agent.id as string);

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
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr>
              <th className="p-3 font-medium">Зар</th>
              <th className="p-3 font-medium">Үнэ</th>
              <th className="p-3 font-medium">Дүүрэг</th>
              <th className="p-3 font-medium">Төлөв</th>
              <th className="p-3 font-medium">AI</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <Link href={`/listings/${l.id}`} className="font-medium text-ink hover:underline">{l.title}</Link>
                </td>
                <td className="p-3 text-ink">{shortMNT(l.price)}</td>
                <td className="p-3 text-muted">{l.district}</td>
                <td className="p-3"><Badge tone={STATUS[l.status]?.tone ?? "neutral"}>{STATUS[l.status]?.label ?? l.status}</Badge></td>
                <td className="p-3 text-muted">{l.ai_score ?? "—"}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/agent/listings/${l.id}/edit`} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title="Засах">
                      <Pencil className="size-4" />
                    </Link>
                    <DeleteListingButton id={l.id} />
                  </div>
                </td>
              </tr>
            ))}
            {listings.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted">Зар алга. «Шинэ зар» дарж эхлүүлнэ үү.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

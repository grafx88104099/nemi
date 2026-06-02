import Link from "next/link";
import { Building2, Calendar, KeyRound } from "lucide-react";

import { getMyAgent, getAgentDashboard } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { shortMNT } from "@/lib/format";

export default async function RentalManagerPage() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-ink">Түрээс удирдах</h1>
        <p className="mt-2 text-muted">Энэ хэсэг зөвхөн агент/эзэмшигчид зориулагдсан.</p>
        <ButtonLink href="/office-signup" className="mt-5">Оффис нээх</ButtonLink>
      </div>
    );
  }

  const { listings, viewings } = await getAgentDashboard(agent.id as string);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Түрээс удирдах</h1>
          <p className="text-sm text-muted">Түрээсийн обьект, үзлэг, төлбөрийн хяналт</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card><CardBody><Building2 className="size-5 text-brand-600" /><div className="mt-1 text-2xl font-extrabold text-ink">{listings.length}</div><div className="text-sm text-muted">Удирдаж буй обьект</div></CardBody></Card>
        <Card><CardBody><Calendar className="size-5 text-amber-600" /><div className="mt-1 text-2xl font-extrabold text-ink">{viewings.length}</div><div className="text-sm text-muted">Товлосон үзлэг</div></CardBody></Card>
        <Card><CardBody><KeyRound className="size-5 text-emerald-600" /><div className="mt-1 text-2xl font-extrabold text-ink">{listings.filter((l) => l.status === "active").length}</div><div className="text-sm text-muted">Идэвхтэй</div></CardBody></Card>
      </div>

      <h2 className="mt-8 text-lg font-bold text-ink">Обьектууд</h2>
      <Card className="mt-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr><th className="p-3 font-medium">Обьект</th><th className="p-3 font-medium">Үнэ/сар</th><th className="p-3 font-medium">Дүүрэг</th><th className="p-3 font-medium">Төлөв</th></tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="p-3"><Link href={`/listings/${l.id}`} className="font-medium text-ink hover:underline">{l.title}</Link></td>
                <td className="p-3 text-ink">{shortMNT(l.price)}</td>
                <td className="p-3 text-muted">{l.district}</td>
                <td className="p-3"><Badge tone={l.status === "active" ? "green" : "neutral"}>{l.status}</Badge></td>
              </tr>
            ))}
            {listings.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">Обьект алга.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

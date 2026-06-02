import Link from "next/link";
import { Building2, ShieldCheck, Sparkles, ArrowRight, X } from "lucide-react";

import { getAgents, getOffices } from "@/lib/queries";
import { AgentCard } from "@/components/agents/AgentCard";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeRequestForm } from "@/components/office/OfficeRequestForm";

export const metadata = { title: "Агентууд — Нэми" };

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string }>;
}) {
  const { office: officeId } = await searchParams;
  const [offices, agents] = await Promise.all([getOffices(), getAgents(officeId)]);
  const active = officeId ? offices.find((o) => o.id === officeId) : null;
  const premier = agents.filter((a) => a.premier).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Толгой */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-ink">Баталгаажсан агентууд</h1>
          <p className="mt-1 text-sm text-muted">
            {agents.length} агент · {premier} Premier · бүгд оффист харьяалагдсан
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted"><ShieldCheck className="size-4 text-emerald-600" /> Баталгаатай</span>
          <span className="inline-flex items-center gap-1.5 text-muted"><Sparkles className="size-4 text-brand-500" /> Premier</span>
        </div>
      </div>

      {/* Оффисууд — сонгож шүүх */}
      {offices.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Building2 className="size-5 text-brand-600" /> Оффисууд</h2>
            {active && (
              <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand-600">
                <X className="size-3.5" /> Шүүлт цуцлах
              </Link>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            <Link
              href="/agents"
              className={`shrink-0 self-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${!officeId ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink hover:border-brand-200"}`}
            >
              Бүх агент
            </Link>
            {offices.map((o) => {
              const isActive = o.id === officeId;
              return (
                <div
                  key={o.id}
                  className={`flex shrink-0 items-center gap-3 rounded-2xl border p-2.5 pr-3 transition ${isActive ? "border-brand-300 bg-brand-50" : "border-line bg-surface hover:border-brand-200"}`}
                >
                  <Link href={`/agents?office=${o.id}`} className="flex items-center gap-2.5">
                    <Avatar initials={o.logo ?? o.name.slice(0, 2)} src={o.logo_url} color={o.color ?? "#C2410C"} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-sm font-bold text-ink">
                        <span className="max-w-[140px] truncate">{o.name}</span>
                        {o.verified && <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" />}
                      </div>
                      <div className="text-xs text-muted">{o.agents_count} агент · {o.listings_count} зар</div>
                    </div>
                  </Link>
                  <Link
                    href={`/offices/${o.id}`}
                    className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
                  >
                    Дэлгэрэнгүй <ArrowRight className="size-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Сонгосон оффисын мэдээ */}
      {active && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm">
          <Avatar initials={active.logo ?? active.name.slice(0, 2)} src={active.logo_url} color={active.color ?? "#C2410C"} size="sm" />
          <span className="font-semibold text-ink">«{active.name}» оффисын {agents.length} агент</span>
          <Link href={`/offices/${active.id}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
            Оффисын танилцуулга <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      {/* Агентууд */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <AgentCard key={a.id} a={a} />
        ))}
        {agents.length === 0 && (
          <p className="col-span-full py-16 text-center text-muted">
            {active ? `«${active.name}» оффист идэвхтэй агент алга.` : "Одоогоор баталгаажсан агент алга."}
          </p>
        )}
      </div>

      {/* Оффис нээх хүсэлтийн урсгал */}
      <section id="open-office" className="mt-16 grid items-center gap-8 rounded-3xl bg-ink p-8 text-white md:grid-cols-2 md:p-12">
        <div className="space-y-4">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-500">
            <Building2 className="size-6" />
          </div>
          <h2 className="text-2xl font-extrabold">Үл хөдлөхийн оффисоо Нэми дээр нээх үү?</h2>
          <p className="text-white/70">
            Оффисоо бүртгүүлж, өөрийн агентуудаа удирдаж, баталгаажуулж эхэлнэ үү.
            Хүсэлтийг Нэми админ хянаж баталгаажуулна.
          </p>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-logo" /> Баталгаатай оффис тэмдэг</li>
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-logo" /> Агентуудаа өөрөө бүртгэж, батлах</li>
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-logo" /> Бүх зарын нэгдсэн хяналт</li>
          </ul>
        </div>
        <Card>
          <CardBody className="p-6">
            <h3 className="mb-4 text-lg font-bold text-ink">Оффис нээх хүсэлт илгээх</h3>
            <OfficeRequestForm next="/agents#open-office" />
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

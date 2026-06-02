import { Building2, ShieldCheck, Sparkles } from "lucide-react";

import { getAgents } from "@/lib/queries";
import { AgentCard } from "@/components/agents/AgentCard";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeRequestForm } from "@/components/office/OfficeRequestForm";

export const metadata = { title: "Агентууд — Нэми" };

export default async function AgentsPage() {
  const agents = await getAgents();
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

      {/* Агентууд */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <AgentCard key={a.id} a={a} />
        ))}
        {agents.length === 0 && (
          <p className="col-span-full py-16 text-center text-muted">Одоогоор баталгаажсан агент алга.</p>
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

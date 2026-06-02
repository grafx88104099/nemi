import Link from "next/link";
import { UserCheck, Home, Clock, ShieldCheck } from "lucide-react";

import { getMyOffice } from "@/lib/queries-office";
import { getMyAgent } from "@/lib/queries-agent";
import { Badge } from "@/components/ui/badge";
import { MyAgentRoleToggle } from "@/components/office/MyAgentRoleToggle";

export const metadata = { title: "Оффисын самбар — Нэми" };

export default async function OfficeOverview() {
  const [data, myAgent] = await Promise.all([getMyOffice(), getMyAgent()]);
  if (!data) return null; // layout-аар хамгаалагдсан
  const { office, agents, listings } = data;
  const isAgentActive = myAgent?.status === "active";
  const pending = agents.filter((a) => a.status === "pending").length;
  const active = agents.filter((a) => a.status === "active").length;
  const color = (office.color as string) ?? "#C2410C";

  const stats = [
    { label: "Идэвхтэй агент", value: active, icon: UserCheck, href: "/office/agents" },
    { label: "Зар", value: listings.length, icon: Home, href: "/office/listings" },
    { label: "Батлах хүлээж буй", value: pending, icon: Clock, href: "/office/agents" },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ background: color }}>
          {office.logo as string}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{office.name as string}</h1>
            {(office.verified as boolean) && <Badge tone="green"><ShieldCheck /> Баталгаатай</Badge>}
          </div>
          <p className="text-sm text-muted">Оффисын удирдлагын самбар</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:shadow-md">
            <s.icon className={`size-5 ${s.label.includes("Батлах") && s.value > 0 ? "text-amber-600" : "text-brand-600"}`} />
            <div className="mt-2 text-3xl font-extrabold text-ink">{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </Link>
        ))}
      </div>

      {pending > 0 && (
        <Link href="/office/agents" className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 hover:bg-amber-100">
          <Clock className="size-5" /> {pending} агент таны баталгаажуулалтыг хүлээж байна →
        </Link>
      )}

      <MyAgentRoleToggle active={isAgentActive} />
    </div>
  );
}

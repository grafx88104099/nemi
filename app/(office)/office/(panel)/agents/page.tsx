import Link from "next/link";
import { Sparkles } from "lucide-react";

import { getMyOffice } from "@/lib/queries-office";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody } from "@/components/ui/card";
import { VerifyToggle } from "@/components/office/VerifyToggle";
import { AgentApproval } from "@/components/office/AgentApproval";
import { AddAgentForm } from "@/components/office/AddAgentForm";
import { DeactivateAgentButton } from "@/components/office/DeactivateAgentButton";

export const metadata = { title: "Агентууд — Оффис" };

export default async function OfficeAgentsPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { office, agents } = data;
  const color = (office.color as string) ?? "#C2410C";
  const pending = agents.filter((a) => a.status === "pending");
  const active = agents.filter((a) => a.status === "active");
  const inactive = agents.filter((a) => a.status === "rejected");

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Агентууд</h1>
          <p className="text-sm text-muted">{active.length} идэвхтэй · {pending.length} хүлээгдэж буй</p>
        </div>
        <AddAgentForm />
      </div>

      {pending.length > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/40">
          <CardBody>
            <h2 className="mb-3 font-bold text-ink">Батлах хүсэлт</h2>
            <div className="space-y-2">
              {pending.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                  <Avatar initials={a.avatar ?? "NA"} color={color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/office/agents/${a.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">{a.display_name}</Link>
                    <div className="text-xs text-muted">{a.phone || "утасгүй"}</div>
                  </div>
                  <AgentApproval agentId={a.id} />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-3 font-bold text-ink">Идэвхтэй агентууд</h2>
          <div className="space-y-2">
            {active.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <Avatar initials={a.avatar ?? "NA"} color={color} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/office/agents/${a.id}`} className="flex items-center gap-1 truncate text-sm font-semibold text-ink hover:underline">
                    {a.display_name}
                    {a.premier && <Sparkles className="size-3 text-brand-500" />}
                  </Link>
                  <div className="text-xs text-muted">{a.specialty} · ★ {a.rating ?? "—"} · {a.sold} зарсан</div>
                </div>
                <VerifyToggle kind="agent" id={a.id} initial={a.verified} />
                <DeactivateAgentButton agentId={a.id} />
              </div>
            ))}
            {active.length === 0 && <p className="text-sm text-muted">Идэвхтэй агент алга.</p>}
          </div>
        </CardBody>
      </Card>

      {inactive.length > 0 && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="mb-1 font-bold text-ink">Идэвхгүй болсон ({inactive.length})</h2>
            <p className="mb-3 text-xs text-muted">Нийтэд харагдахгүй. Дэлгэрэнгүйд орж дахин идэвхжүүлэх эсвэл бүрэн устгах боломжтой.</p>
            <div className="space-y-2">
              {inactive.map((a) => (
                <Link
                  key={a.id}
                  href={`/office/agents/${a.id}`}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 opacity-70 transition hover:opacity-100"
                >
                  <Avatar initials={a.avatar ?? "NA"} color={color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{a.display_name}</div>
                    <div className="text-xs text-muted">{a.specialty ?? "—"}</div>
                  </div>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">Идэвхгүй</span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

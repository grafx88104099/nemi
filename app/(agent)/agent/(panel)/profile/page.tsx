import Link from "next/link";

import { getMyAgent } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { AgentProfileForm } from "@/components/dashboard/AgentProfileForm";

export const metadata = { title: "Миний профайл — Нэми" };

export default async function AgentProfilePage() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-ink">Зөвхөн агентад</h1>
        <p className="mt-2 text-muted">Энэ хэсэг зөвхөн агентад зориулагдсан.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Миний профайл</h1>
          <p className="text-sm text-muted">Нийтэд харагдах мэдээллээ шинэчлэх</p>
        </div>
        {agent.status === "active" && (
          <Link href={`/agents/${agent.id as string}`} className="text-sm font-semibold text-brand-600 hover:underline">
            Нийтийн профайл →
          </Link>
        )}
      </div>
      <Card className="mt-6">
        <CardBody>
          <AgentProfileForm
            initial={{
              display_name: (agent.display_name as string) ?? "",
              phone: (agent.phone as string) ?? "",
              avatar: (agent.avatar as string) ?? "",
              avatar_url: (agent.avatar_url as string) ?? "",
              bio: (agent.bio as string) ?? "",
              specialty: (agent.specialty as string) ?? "",
              response_time: (agent.response_time as string) ?? "",
              areas: (agent.areas as string[]) ?? [],
              languages: (agent.languages as string[]) ?? [],
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Sparkles, ExternalLink, Building2, Star, Award, Clock, KeyRound, AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getOfficeAgent } from "@/lib/queries-office";
import { getAgentAccount } from "@/lib/actions/agent-account";
import { AgentAccountManager } from "@/components/office/AgentAccountManager";
import { DeleteAgentButton } from "@/components/office/DeleteAgentButton";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { VerifyToggle } from "@/components/office/VerifyToggle";
import { AgentApproval } from "@/components/office/AgentApproval";
import { DeactivateAgentButton } from "@/components/office/DeactivateAgentButton";
import { shortMNT } from "@/lib/format";

export const metadata = { title: "Агент удирдах — Оффис" };

const STATUS: Record<string, { label: string; tone: "amber" | "green" | "rose" }> = {
  pending: { label: "Хүлээгдэж буй", tone: "amber" },
  active: { label: "Идэвхтэй", tone: "green" },
  rejected: { label: "Идэвхгүй", tone: "rose" },
};

export default async function OfficeAgentManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getOfficeAgent(id);
  if (!data) notFound();
  const { agent, listings } = data;
  const account = await getAgentAccount(id);

  // Оффис админ өөрийн agent профайлаа устгахаас сэргийлэх — товчийг нуух
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSelf = !!user && agent.profile_id === user.id;
  const color = (agent.office?.color as string) ?? "#C2410C";
  const status = (agent.status as string) ?? "active";
  const areas = (agent.areas as string[]) ?? [];
  const languages = (agent.languages as string[]) ?? [];

  const stats = [
    { icon: Building2, label: "Идэвхтэй зар", value: agent.listings_count ?? 0 },
    { icon: Award, label: "Зарсан", value: agent.sold ?? 0 },
    { icon: Star, label: "Үнэлгээ", value: agent.rating ?? "—" },
    { icon: Clock, label: "Туршлага", value: agent.years ? `${agent.years} жил` : "—" },
  ];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link href="/office/agents" className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <ArrowLeft className="size-4" /> Агентууд
      </Link>

      {/* Толгой + статус удирдлага */}
      <Card className="mt-4">
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar initials={(agent.avatar as string) ?? "NA"} color={color} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-ink">{agent.display_name as string}</h1>
                {(agent.premier as boolean) && <Sparkles className="size-4 text-brand-500" />}
                <Badge tone={STATUS[status]?.tone ?? "neutral"}>{STATUS[status]?.label ?? status}</Badge>
              </div>
              <p className="text-sm text-muted">{(agent.specialty as string) ?? "—"} · {agent.office?.name as string}</p>
              {agent.phone ? (
                <a href={`tel:${agent.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
                  <Phone className="size-4" /> {agent.phone as string}
                </a>
              ) : null}
            </div>
          </div>

          {/* Статусын дагуу үйлдэл */}
          <div className="flex flex-col items-end gap-2">
            {status === "pending" && <AgentApproval agentId={id} />}
            {status === "rejected" && (
              <div className="text-right">
                <p className="mb-1 text-xs text-muted">Дахин идэвхжүүлэх:</p>
                <AgentApproval agentId={id} />
              </div>
            )}
            {status === "active" && (
              <div className="flex items-center gap-2">
                <VerifyToggle kind="agent" id={id} initial={agent.verified as boolean} />
                <DeactivateAgentButton agentId={id} />
              </div>
            )}
            {status === "active" && (
              <Link href={`/agents/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
                <ExternalLink className="size-3.5" /> Нийтийн профайл
              </Link>
            )}
          </div>
        </CardBody>
      </Card>

      {status === "pending" && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Энэ агент таны оффисын баталгаажуулалтыг хүлээж байна. Батлах хүртэл нийтэд харагдахгүй, зар оруулж чадахгүй.
        </div>
      )}

      {/* Гүйцэтгэл */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody className="space-y-1">
              <s.icon className="size-5 text-brand-600" />
              <div className="text-2xl font-extrabold text-ink">{String(s.value)}</div>
              <div className="text-sm text-muted">{s.label}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Профайл мэдээлэл */}
      <Card className="mt-6">
        <CardBody className="space-y-4">
          <h2 className="font-bold text-ink">Профайл</h2>
          {agent.bio ? <p className="text-sm text-muted">{agent.bio as string}</p> : <p className="text-sm text-subtle">Танилцуулга оруулаагүй.</p>}
          {areas.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-subtle">Үйлчлэх бүс</div>
              <div className="flex flex-wrap gap-1.5">{areas.map((a) => <span key={a} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">{a}</span>)}</div>
            </div>
          )}
          {languages.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-subtle">Хэл</div>
              <div className="flex flex-wrap gap-1.5">{languages.map((l) => <span key={l} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">{l}</span>)}</div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Системийн бүртгэл / нэвтрэлт */}
      <Card className="mt-6">
        <CardBody className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold text-ink"><KeyRound className="size-4" /> Системийн нэвтрэлт</h2>
          {account ? (
            <AgentAccountManager agentId={id} account={account} />
          ) : (
            <p className="text-sm text-muted">Мэдээлэл ачаалж чадсангүй.</p>
          )}
        </CardBody>
      </Card>

      {/* Зарууд */}
      <h2 className="mt-6 text-lg font-bold text-ink">Зарууд ({listings.length})</h2>
      <Card className="mt-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr><th className="p-3 font-medium">Зар</th><th className="p-3 font-medium">Үнэ</th><th className="p-3 font-medium">Дүүрэг</th><th className="p-3 font-medium">Төлөв</th></tr>
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
            {listings.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">Зар алга.</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* Аюултай бүс — агентыг бүрэн устгах (өөрийгөө устгах боломжгүй) */}
      {!isSelf && (
        <Card className="mt-6 border-rose-200">
          <CardBody className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-rose-600">
              <AlertTriangle className="size-4" /> Аюултай бүс
            </h2>
            <p className="text-sm text-muted">
              Агентыг системээс бүрмөсөн устгана — бүх зар, лид, сэтгэгдэл, мөн нэвтрэлтийн
              бүртгэл устах ба сэргээх боломжгүй.
            </p>
            <DeleteAgentButton
              agentId={id}
              agentName={agent.display_name as string}
              listingsCount={listings.length}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

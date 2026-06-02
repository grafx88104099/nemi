import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Star, Sparkles, Phone, Clock } from "lucide-react";

import { getAgentById } from "@/lib/queries";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ListingCard } from "@/components/listings/ListingCard";
import { StartAgentChatButton } from "@/components/chat/StartAgentChatButton";

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { agent, listings, reviews } = await getAgentById(id);
  if (!agent) notFound();

  const office = (agent.office ?? null) as Record<string, unknown> | null;
  const sub = (agent.sub_ratings ?? {}) as Record<string, number>;
  const subLabels: Record<string, string> = {
    knowledge: "Мэдлэг",
    process: "Үйл явц",
    response: "Хариу",
    negotiation: "Хэлэлцээ",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/agents" className="text-sm text-muted hover:underline">← Агентууд</Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Header */}
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar
                initials={(agent.avatar as string) ?? "NA"}
                src={agent.avatar_url as string | null}
                color={(office?.color as string) ?? "#C2410C"}
                size="lg"
                className="size-20 text-2xl"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-ink">{agent.display_name as string}</h1>
                  {agent.verified ? <Badge tone="green"><ShieldCheck /> Баталгаатай</Badge> : null}
                  {agent.premier ? <Badge tone="brand"><Sparkles /> Premier</Badge> : null}
                </div>
                <p className="text-muted">{(office?.name as string) ?? ""} · {(agent.specialty as string) ?? ""}</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Star className="size-4 fill-amber-400 text-amber-400" />
                    <b className="text-ink">{agent.rating as number}</b>
                    <span className="text-muted">({agent.reviews_count as number} сэтгэгдэл)</span>
                  </span>
                  <span className="text-muted"><b className="text-ink">{agent.sold as number}</b> зарсан</span>
                  <span className="text-muted"><b className="text-ink">{agent.years as number}</b> жил туршлага</span>
                  {agent.response_time ? (
                    <span className="flex items-center gap-1 text-muted">
                      <Clock className="size-4" /> {agent.response_time as string}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardBody>
          </Card>

          {agent.bio ? (
            <div>
              <h2 className="mb-2 text-lg font-bold text-ink">Танилцуулга</h2>
              <p className="text-muted">{agent.bio as string}</p>
            </div>
          ) : null}

          {/* Sub ratings */}
          {Object.keys(sub).length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(subLabels).map(([k, label]) => (
                <div key={k} className="rounded-xl bg-surface-2 p-3 text-center">
                  <div className="text-lg font-bold text-ink">{sub[k] ?? "—"}</div>
                  <div className="text-xs text-muted">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Listings */}
          {listings.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold text-ink">Идэвхтэй зарууд ({listings.length})</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {listings.map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
            </div>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold text-ink">Сэтгэгдэл ({reviews.length})</h2>
              <div className="space-y-3">
                {reviews.map((r) => (
                  <Card key={r.id}>
                    <CardBody className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          {r.author_name}
                          {r.verified ? <ShieldCheck className="size-3.5 text-emerald-600" /> : null}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: r.rating ?? 0 }).map((_, i) => (
                            <Star key={i} className="size-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-muted">{r.area} · {r.deal_type} · {r.created_at?.slice(0, 10)}</div>
                      <p className="text-sm text-muted">{r.text}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-2">
              <StartAgentChatButton agentId={id} />
              {agent.phone ? (
                <a href={`tel:${agent.phone}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-surface-2">
                  <Phone className="size-4" /> {agent.phone as string}
                </a>
              ) : null}
              {(agent.languages as string[])?.length > 0 && (
                <div className="pt-2 text-sm">
                  <div className="text-muted">Хэл</div>
                  <div className="font-medium text-ink">{(agent.languages as string[]).join(", ")}</div>
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

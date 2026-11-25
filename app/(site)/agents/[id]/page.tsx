import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Star, Sparkles, Phone, Clock } from "lucide-react";

import { getAgentById } from "@/lib/queries";
import { AGENT_PROFILE_LISTINGS, agentStats } from "@/lib/agent-stats";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ListingCard } from "@/components/listings/ListingCard";
import { StartAgentChatButton } from "@/components/chat/StartAgentChatButton";
import { getAgentSeo } from "@/lib/queries-seo";
import { agentMetaFor } from "@/lib/seo/profiles";
import { isUuid } from "@/lib/seo/site";

/** Нийтийн client-ээр (утас/profile_id-гүй). DB алдааг барихгүй. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return agentMetaFor(id, null);
  return agentMetaFor(id, await getAgentSeo(id));
}

export default async function AgentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zar?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // «Бүх N зар» — ?zar=all үед бүх идэвхтэй зар (canonical нь /agents/<id> хэвээр).
  const showAll = sp.zar === "all";
  const { agent, listings, listingsTotal, reviews } = await getAgentById(id, {
    listingsLimit: showAll ? null : AGENT_PROFILE_LISTINGS,
  });
  if (!agent) notFound();

  const office = agent.office;
  const stats = agentStats(agent);
  const sub = agent.sub_ratings ?? {};
  const subLabels: Record<string, string> = {
    knowledge: "Мэдлэг",
    process: "Үйл явц",
    response: "Хариу",
    negotiation: "Хэлэлцээ",
  };
  // Дор хаяж нэг дэд үнэлгээтэй үед л (хоосон «—» дөрвөн нүд харуулахгүй).
  const hasSub = Object.keys(subLabels).some((k) => typeof sub[k] === "number");
  const subtitle = [office?.name, agent.specialty].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/agents" className="text-sm text-muted hover:underline">← Агентууд</Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Header */}
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar
                initials={agent.avatar ?? "NA"}
                src={agent.avatar_url}
                color={office?.color ?? "#C2410C"}
                size="lg"
                className="size-20 text-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-extrabold text-ink">{agent.display_name}</h1>
                  {agent.verified ? <Badge tone="green"><ShieldCheck /> Баталгаатай</Badge> : null}
                  {agent.premier ? <Badge tone="brand"><Sparkles /> Premier</Badge> : null}
                </div>
                {subtitle ? <p className="text-muted">{subtitle}</p> : null}
                {/* Хоосон/0 утгыг харуулахгүй (lib/agent-stats) — «0 зарсан», « жил» гэж бичихгүй. */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {stats.rating ? (
                    <span className="flex items-center gap-1">
                      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                      <b className="text-ink">{stats.rating.value}</b>
                      <span className="text-muted">({stats.rating.reviews} сэтгэгдэл)</span>
                    </span>
                  ) : (
                    <span className="text-muted">Сэтгэгдэл алга</span>
                  )}
                  {stats.sold ? (
                    <span className="text-muted"><b className="text-ink">{stats.sold}</b> зарсан</span>
                  ) : null}
                  {stats.years ? (
                    <span className="text-muted"><b className="text-ink">{stats.years}</b> жил туршлага</span>
                  ) : null}
                  {agent.response_time ? (
                    <span className="flex items-center gap-1 text-muted">
                      <Clock className="size-4" aria-hidden /> {agent.response_time}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardBody>
          </Card>

          {agent.bio ? (
            <div>
              <h2 className="mb-2 text-lg font-bold text-ink">Танилцуулга</h2>
              {/* Агентын бичсэн мөр таслалтыг хадгална (текст хэвээр — HTML тайлахгүй). */}
              <p className="whitespace-pre-line break-words text-muted">{agent.bio}</p>
            </div>
          ) : null}

          {/* Sub ratings */}
          {hasSub && (
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
              <h2 className="mb-3 text-lg font-bold text-ink">Идэвхтэй зарууд ({listingsTotal})</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {listings.map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
              {listingsTotal > listings.length ? (
                <div className="mt-5 text-center">
                  <Link
                    href={`/agents/${id}?zar=all`}
                    scroll={false}
                    className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2"
                  >
                    Бүх {listingsTotal} зарыг харах
                  </Link>
                </div>
              ) : null}
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
                      <p className="whitespace-pre-line break-words text-sm text-muted">{r.text}</p>
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
                  <Phone className="size-4" /> {agent.phone}
                </a>
              ) : null}
              {agent.languages?.length > 0 && (
                <div className="pt-2 text-sm">
                  <div className="text-muted">Хэл</div>
                  <div className="font-medium text-ink">{agent.languages.join(", ")}</div>
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

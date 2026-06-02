import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Flame, Star, Phone, MapPin, Check } from "lucide-react";

import { getListingById } from "@/lib/queries";
import { isFavorited } from "@/lib/queries-user";
import { recordView } from "@/lib/actions/viewings";
import { fmtMNT, shortMNT } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/listings/FavoriteButton";
import { BookViewingButton } from "@/components/listings/BookViewingButton";
import { StartChatButton } from "@/components/chat/StartChatButton";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const l = await getListingById(id);
  if (!l) notFound();

  const [favorited] = await Promise.all([isFavorited(id), recordView(id)]);

  const agent = l.agent as Record<string, unknown> | null;
  const office = (agent?.office ?? null) as Record<string, unknown> | null;
  const photos = (l.photos ?? []).length
    ? l.photos.map((p) => p.url)
    : l.photo
      ? [l.photo as string]
      : [];
  const amenities = (l.amenities as string[]) ?? [];
  const spec = (label: string, val: React.ReactNode) => (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-bold text-ink">{val}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/listings" className="text-sm text-muted hover:underline">← Жагсаалт руу</Link>

      {/* Gallery */}
      <div className="mt-4 grid gap-2 overflow-hidden rounded-2xl md:grid-cols-4 md:grid-rows-2">
        {photos.slice(0, 5).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={l.title as string}
            className={`h-full w-full object-cover ${i === 0 ? "md:col-span-2 md:row-span-2 aspect-[4/3] md:aspect-auto" : "aspect-[4/3]"}`}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main */}
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {l.hot ? <Badge tone="rose"><Flame /> Эрэлттэй</Badge> : null}
              {l.verified ? <Badge tone="green"><ShieldCheck /> Баталгаатай</Badge> : null}
              <Badge tone="neutral">{l.type as string}</Badge>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold text-ink">{shortMNT(l.price as number)}</h1>
            <p className="mt-1 text-lg text-ink">{l.title as string}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-4" /> {l.district as string}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(l.rooms as number) > 0 ? spec("Өрөө", l.rooms as number) : null}
            {spec("Талбай", `${l.area} м²`)}
            {l.floor && l.floor !== "-" ? spec("Давхар", l.floor as string) : null}
            {(l.year as number) > 0 ? spec("Он", l.year as number) : null}
            {spec("Зогсоол", (l.parking as number) || "—")}
          </div>

          {l.ai_score != null && (
            <Card>
              <CardBody className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Star className="size-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">AI чанарын оноо: {l.ai_score as number}/100</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{(l.ai_note as string) ?? "Зах зээлийн үнэлгээ боловсруулагдсан."}</p>
                </div>
              </CardBody>
            </Card>
          )}

          {l.description ? (
            <div>
              <h2 className="mb-2 text-lg font-bold text-ink">Тайлбар</h2>
              <p className="text-muted">{l.description as string}</p>
            </div>
          ) : null}

          {amenities.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-bold text-ink">Тохижилт</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-ink">
                    <Check className="size-4 text-emerald-600" /> {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
            м² үнэ: <b className="text-ink">{l.price_per_m2 ? fmtMNT(l.price_per_m2 as number) : "—"}</b>
          </div>
        </div>

        {/* Agent sidebar */}
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              {agent ? (
                <>
                  <Link href={`/agents/${agent.id}`} className="flex items-center gap-3">
                    <Avatar
                      initials={(agent.avatar as string) ?? "NA"}
                      color={(office?.color as string) ?? "#C2410C"}
                      size="lg"
                    />
                    <div>
                      <div className="flex items-center gap-1 font-bold text-ink">
                        {agent.display_name as string}
                        {agent.verified ? <ShieldCheck className="size-4 text-emerald-600" /> : null}
                      </div>
                      <div className="text-sm text-muted">{(office?.name as string) ?? ""}</div>
                      {agent.rating != null && (
                        <div className="mt-0.5 flex items-center gap-1 text-sm">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-ink">{agent.rating as number}</span>
                          <span className="text-muted">({agent.reviews_count as number})</span>
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="grid gap-2">
                    <StartChatButton listingId={id} />
                    <BookViewingButton listingId={id} agentId={(agent.id as string) ?? null} />
                    <FavoriteButton listingId={id} initial={favorited} withLabel />
                    {agent.phone ? (
                      <a
                        href={`tel:${agent.phone}`}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-surface-2"
                      >
                        <Phone className="size-4" /> {agent.phone as string}
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">Агент тодорхойгүй.</p>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

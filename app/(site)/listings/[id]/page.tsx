import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Flame, Star, Phone, MapPin, Check, Clock, Sparkles } from "lucide-react";

import { getListingById, getListingPoint } from "@/lib/queries";
import { isFavorited } from "@/lib/queries-user";
import { recordView } from "@/lib/actions/viewings";
import { fmtMNT, shortMNT, relativeDate, fmtDate, isFresh } from "@/lib/format";
import { rentTermCode, rentTermLabel } from "@/lib/constants";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/listings/FavoriteButton";
import { BookViewingButton } from "@/components/listings/BookViewingButton";
import { ListingLocationMap } from "@/components/listings/ListingLocationMap";
import { StartChatButton } from "@/components/chat/StartChatButton";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const l = await getListingById(id);
  if (!l) notFound();

  const [favorited, point] = await Promise.all([isFavorited(id), getListingPoint(id), recordView(id)]);

  const agent = l.agent as Record<string, unknown> | null;
  const office = (agent?.office ?? null) as Record<string, unknown> | null;
  const photos = (l.photos ?? []).length
    ? l.photos.map((p) => p.url)
    : l.photo
      ? [l.photo as string]
      : [];
  const amenities = (l.amenities as string[]) ?? [];
  const isRent = l.deal_type === "rent";
  const advM = l.rent_advance_months as number | null;
  const depM = l.rent_deposit_months as number | null;
  const hasRentTerms = isRent && advM != null && depM != null;
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
      <div className="mt-4 grid gap-2 overflow-hidden rounded-2xl md:h-[460px] md:grid-cols-4 md:grid-rows-2">
        {photos.slice(0, 5).map((src, i) => (
          <div
            key={i}
            className={`relative aspect-[4/3] md:aspect-auto ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}
          >
            <Image
              src={src}
              alt={l.title as string}
              fill
              sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
              priority={i === 0}
              className="object-cover"
            />
          </div>
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
              {l.created_at && isFresh(l.created_at as string) ? (
                <Badge tone="brand"><Sparkles /> Шинэ</Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold text-ink">
              {shortMNT(l.price as number)}
              {isRent && <span className="text-xl font-medium text-muted">/сар</span>}
            </h1>
            <p className="mt-1 text-lg text-ink">{l.title as string}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" /> {l.district as string}
              </span>
              {l.created_at ? (
                <span className="flex items-center gap-1" title={fmtDate(l.created_at as string)}>
                  <Clock className="size-4" /> {relativeDate(l.created_at as string)} нийтэлсэн
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(l.rooms as number) > 0 ? spec("Өрөө", l.rooms as number) : null}
            {spec("Талбай", `${l.area} м²`)}
            {l.floor && l.floor !== "-" ? spec("Давхар", l.floor as string) : null}
            {(l.year as number) > 0 ? spec("Он", l.year as number) : null}
            {spec("Зогсоол", (l.parking as number) || "—")}
          </div>

          {hasRentTerms && (
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Түрээсийн нөхцөл</span>
                <Badge tone="blue">{rentTermCode(advM, depM)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{rentTermLabel(advM, depM)}</p>
              <p className="mt-2 text-sm text-ink">
                Эхэлж төлөх: <b>{advM + depM} сар = {fmtMNT((advM + depM) * (l.price as number))}</b>
                <span className="text-muted"> ({fmtMNT(depM * (l.price as number))} нь буцаагдах барьцаа)</span>
              </p>
            </div>
          )}

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

          {point && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-lg font-bold text-ink">
                <MapPin className="size-5 text-brand-600" /> Байршил
              </h2>
              <ListingLocationMap lat={point.lat} lng={point.lng} />
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

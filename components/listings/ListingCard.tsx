import Link from "next/link";
import { Flame, ShieldCheck, Star, Clock, Sparkles } from "lucide-react";

import { shortMNT, relativeDate, isFresh } from "@/lib/format";
import { rentTermCode } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export type ListingCardData = {
  id: string;
  title: string;
  price: number;
  ai_score: number | null;
  rooms: number;
  area: number | null;
  floor: string | null;
  district: string | null;
  photo: string | null;
  hot: boolean;
  verified: boolean;
  deal_type?: "sale" | "rent";
  rent_advance_months?: number | null;
  rent_deposit_months?: number | null;
  created_at?: string;
  agent: {
    display_name: string;
    avatar: string | null;
    avatar_url: string | null;
    verified: boolean;
    office: { color: string | null } | null;
  } | null;
};

export function ListingCard({ l }: { l: ListingCardData }) {
  return (
    <Link
      href={`/listings/${l.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        {l.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.photo}
            alt={l.title}
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <div className="absolute left-3 top-3">
          {l.hot ? (
            <Badge tone="rose">
              <Flame /> Эрэлттэй
            </Badge>
          ) : l.verified ? (
            <Badge tone="green">
              <ShieldCheck /> Баталгаатай
            </Badge>
          ) : null}
        </div>
        {l.created_at && isFresh(l.created_at) && (
          <div className="absolute right-3 top-3">
            <Badge tone="brand">
              <Sparkles /> Шинэ
            </Badge>
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <span>
              {shortMNT(l.price)}
              {l.deal_type === "rent" && <span className="text-sm font-medium text-muted">/сар</span>}
            </span>
            {l.deal_type === "rent" && l.rent_advance_months != null && l.rent_deposit_months != null && (
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">
                {rentTermCode(l.rent_advance_months, l.rent_deposit_months)}
              </span>
            )}
          </div>
          {l.ai_score != null && (
            <span
              title="AI чанарын оноо"
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700"
            >
              <Star className="size-3 fill-current" /> {l.ai_score}
            </span>
          )}
        </div>
        <div className="line-clamp-1 font-semibold text-ink">{l.title}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {l.rooms > 0 && <span>{l.rooms} өрөө</span>}
          {l.area != null && <span>{l.area} м²</span>}
          {l.floor && l.floor !== "-" && <span>{l.floor}</span>}
          {l.district && <span>{l.district}</span>}
        </div>
        {l.agent && (
          <div className="flex items-center gap-2 border-t border-line pt-2.5">
            <Avatar
              initials={l.agent.avatar ?? "NA"}
              src={l.agent.avatar_url}
              size="sm"
              color={l.agent.office?.color ?? "#C2410C"}
            />
            <span className="flex-1 truncate text-sm font-medium text-ink">
              {l.agent.display_name}
            </span>
            {l.agent.verified && <ShieldCheck className="size-4 text-emerald-600" />}
          </div>
        )}
        {l.created_at && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3" /> {relativeDate(l.created_at)} нийтэлсэн
          </div>
        )}
      </div>
    </Link>
  );
}

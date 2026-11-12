"use client";

import Link from "next/link";
import { AlignLeft, Clock, ExternalLink, EyeOff, Lock, MapPin, UserRound, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CALENDAR_EVENT_KIND_LABEL,
  CALENDAR_SOURCE_LABEL,
  itemWhenLabel,
  type CalendarItem,
} from "@/lib/crm/calendar-view";
import { cn } from "@/lib/utils";

import { SOURCE_ICON, type ColorClasses } from "./colors";

const OPEN_LABEL: Record<CalendarItem["source"], string> = {
  event: "Холбосон бүртгэлийг нээх",
  task: "Даалгаврыг нээх",
  next_step: "Сэжмийг нээх",
  showing: "Үзлэгийн хуудсыг нээх",
  opportunity_meeting: "Боломжийг нээх",
  viewing: "Зарыг нээх",
};

function eventLinkLabel(item: CalendarItem): string {
  const e = item.event;
  if (e?.opportunityId) return "Холбосон боломжийг нээх";
  if (e?.leadId) return "Холбосон сэжмийг нээх";
  if (e?.contactId) return "Холбосон харилцагчийг нээх";
  return OPEN_LABEL.event;
}

/** Зүйлийн дэлгэрэнгүй (popover-ийн агуулга). Нуугдсан бол зөвхөн «Завгүй» ба цаг. */
export function EventDetail({
  item,
  color,
  showPerson,
  viewerId,
  titleId,
}: {
  item: CalendarItem;
  color: ColorClasses;
  /** Хэний календарийнх болохыг харуулах (олон хүн / өөр хүн). */
  showPerson: boolean;
  /** Харж буй хэрэглэгч — өөр хүний үүсгэсэн үйл явдалд зохион байгуулагчийг харуулна. */
  viewerId: string;
  titleId?: string;
}) {
  const Icon = SOURCE_ICON[item.source];
  const when = itemWhenLabel(item);

  if (item.masked) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded", color.dot)} />
          <h3 id={titleId} className="text-lg font-bold text-ink">
            {item.title}
          </h3>
        </div>
        <p className="flex items-center gap-3 text-sm text-ink">
          <Clock className="size-4 shrink-0 text-muted" aria-hidden /> {when}
        </p>
      </div>
    );
  }

  const e = item.event;
  const organizer = e && e.ownerId !== viewerId ? (e.ownerName ?? "Нэргүй") : null;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded", color.dot)} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className={cn("break-words text-lg font-bold text-ink", item.done && "line-through decoration-1")}>
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              <Icon aria-hidden /> {e ? CALENDAR_EVENT_KIND_LABEL[e.kind] : CALENDAR_SOURCE_LABEL[item.source]}
            </Badge>
            {e?.isPrivate ? (
              <Badge tone="neutral">
                <EyeOff aria-hidden /> Хувийн
              </Badge>
            ) : null}
            {item.done ? <Badge tone="green">Дууссан</Badge> : null}
          </div>
        </div>
      </div>

      <p className="flex items-start gap-3 text-sm text-ink">
        <Clock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> <span>{when}</span>
      </p>

      {organizer ? (
        <p className="flex items-start gap-3 text-sm text-ink">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="text-muted">Зохион байгуулагч: </span>
            {organizer}
          </span>
        </p>
      ) : showPerson && item.personName ? (
        <p className="flex items-start gap-3 text-sm text-ink">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> <span>{item.personName}</span>
        </p>
      ) : null}

      {e?.location || (!e && item.subtitle) ? (
        <p className="flex items-start gap-3 text-sm text-ink">
          {e || item.source === "opportunity_meeting" ? (
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <AlignLeft className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="min-w-0 break-words">{e ? e.location : item.subtitle}</span>
        </p>
      ) : null}

      {e?.description ? (
        <p className="flex items-start gap-3 text-sm text-ink">
          <AlignLeft className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 whitespace-pre-wrap break-words">{e.description}</span>
        </p>
      ) : null}

      {e && e.attendees.length ? (
        <div className="flex items-start gap-3 text-sm text-ink">
          <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted">{e.attendees.length} хүн урьсан</p>
            <ul className="mt-0.5 space-y-0.5">
              {e.attendees.map((a) => (
                <li key={a.profileId} className="truncate">
                  {a.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {!item.canMove && item.lockedReason ? (
        <p className="flex items-start gap-3 text-xs text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{item.lockedReason}</span>
        </p>
      ) : null}

      {item.href ? (
        <Link
          href={item.href}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden />
          {item.source === "event" ? eventLinkLabel(item) : OPEN_LABEL[item.source]}
        </Link>
      ) : null}
    </div>
  );
}

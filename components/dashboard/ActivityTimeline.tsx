import { Phone, Users, MessageSquare, StickyNote, Home, Mail } from "lucide-react";

import { fmtDateTime } from "@/lib/format";
import { ACTIVITY_KIND_LABEL, type ActivityKind } from "@/lib/constants";
import type { LeadActivity } from "@/lib/queries-agent";
import { DeleteActivityButton } from "@/components/dashboard/DeleteActivityButton";

const ICON: Record<ActivityKind, typeof Phone> = {
  call: Phone,
  meeting: Users,
  message: MessageSquare,
  note: StickyNote,
  viewing: Home,
  email: Mail,
};

const TONE: Record<ActivityKind, string> = {
  call: "bg-sky-100 text-sky-700",
  meeting: "bg-indigo-100 text-indigo-700",
  message: "bg-emerald-100 text-emerald-700",
  note: "bg-amber-100 text-amber-700",
  viewing: "bg-brand-100 text-brand-700",
  email: "bg-violet-100 text-violet-700",
};

type TimelineItem = LeadActivity & { leadName?: string | null };

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        Бүртгэл алга. Эхний дуудлага/тэмдэглэлээ нэмнэ үү.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const kind = (a.kind as ActivityKind) in ICON ? (a.kind as ActivityKind) : "note";
        const Icon = ICON[kind];
        return (
          <li key={a.id} className="flex gap-3">
            <div className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${TONE[kind]}`}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">{ACTIVITY_KIND_LABEL[kind]}</span>
                  {a.duration_min != null && (
                    <span className="text-xs text-muted">· {a.duration_min} мин</span>
                  )}
                  {a.leadName && (
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">{a.leadName}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <time className="text-xs text-muted">{fmtDateTime(a.occurred_at)}</time>
                  <DeleteActivityButton id={a.id} />
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.summary}</p>
              {a.outcome && (
                <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                  → {a.outcome}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

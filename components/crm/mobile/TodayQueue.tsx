"use client";

import { fmtDayMonth, fmtTime } from "@/lib/format";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  Flame,
  ListTodo,
  MessageSquareText,
  Phone,
  UserCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { QuickLogSheet } from "@/components/crm/QuickLogSheet";
import { completeTodayTask, snoozeTodayItem } from "@/lib/actions/crm-worklists";
import {
  canSnooze,
  clockLabel,
  daysOverdue,
  slaClock,
  TODAY_KIND_LABEL,
  type TodayItem,
  type TodayKind,
} from "@/lib/crm/today";
import type { RecontactRanges } from "@/lib/crm/scoring";
import type { LeadGrade } from "@/lib/constants-crm";
import { cn } from "@/lib/utils";

/**
 * Өнөөдрийн нэг дараалал (R16, §8.3 «Өнөөдөр», UX-18): мөр бүр зорьсон
 * карт руу; Залгах → буцаж ирэхэд үр дүн бүртгэх цонх өөрөө нээгдэнэ;
 * даалгаврыг нэг товчоор дуусгана; хойшлуулалт аудитад бичигдэж, эхний
 * холболтын хугацааг хойшлуулахгүй.
 */

const KIND_ICON: Record<TodayKind, typeof Flame> = {
  sla: AlarmClock,
  accept: UserCheck,
  lead_step: CalendarClock,
  opp_step: CalendarClock,
  feedback: MessageSquareText,
  task: ListTodo,
  showing: Eye,
  meeting: Users,
};

const CALL_FLAG = "crm:today-call";
const VISIBLE_DEFAULT = 12;

/** Залгах товч дарагдсаныг тэмдэглэнэ (апп руу буцахад бүртгэлийн цонх нээгдэнэ). */
function rememberCall(key: string) {
  try {
    sessionStorage.setItem(CALL_FLAG, JSON.stringify({ key, at: Date.now() }));
  } catch {
    // sessionStorage хаалттай орчинд алгасна
  }
}


function fmtDay(iso: string): string {
  return fmtDayMonth(iso);
}

export function TodayQueue({
  items,
  nowIso,
  todayIso,
  slaWarnMin,
  snoozeHours,
  snoozedCount,
  retryHours,
  recontactRanges,
  basePath = "/agent/crm",
}: {
  items: TodayItem[];
  nowIso: string;
  todayIso: string;
  slaWarnMin: number;
  snoozeHours: number[];
  snoozedCount: number;
  retryHours: number;
  recontactRanges: RecontactRanges;
  basePath?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(nowIso));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [logFor, setLogFor] = useState<TodayItem | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Залгасны дараа апп руу буцаж ирэхэд тухайн мөрийн бүртгэлийн цонхыг нээнэ (R5).
  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = sessionStorage.getItem(CALL_FLAG);
        if (!raw) return;
        sessionStorage.removeItem(CALL_FLAG);
        const v = JSON.parse(raw) as { key: string; at: number };
        if (Date.now() - v.at > 2 * 3600_000) return;
        const it = items.find((i) => i.key === v.key);
        if (it && it.contactId) setLogFor(it);
      } catch {
        // алгасна
      }
    }
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [items]);

  const list = useMemo(() => items.filter((i) => !hidden.has(i.key)), [items, hidden]);
  const shown = showAll ? list : list.slice(0, VISIBLE_DEFAULT);

  function hide(key: string) {
    setHidden((h) => new Set(h).add(key));
  }
  function unhide(key: string) {
    setHidden((h) => {
      const n = new Set(h);
      n.delete(key);
      return n;
    });
  }

  function complete(it: TodayItem) {
    hide(it.key);
    start(async () => {
      const res = await completeTodayTask(it.id);
      if (!res.ok) {
        unhide(it.key);
        toast.error(res.error ?? "Дуусгаж чадсангүй.");
        return;
      }
      toast.success("Даалгавар дууслаа");
      router.refresh();
    });
  }

  function snooze(it: TodayItem, hours: number) {
    setSnoozeFor(null);
    hide(it.key);
    start(async () => {
      const res = await snoozeTodayItem({ kind: it.kind, id: it.id, hours });
      if (!res.ok) {
        unhide(it.key);
        toast.error(res.error ?? "Хойшлуулж чадсангүй.");
        return;
      }
      toast.info(`${hours} цагаар хойшлууллаа`, { description: "Алхмын огноо өөрчлөгдөөгүй — хэтрэлтийн тооцоонд хэвээр." });
    });
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="Өнөөдрийн дараалал хоосон"
        description={
          snoozedCount > 0
            ? `${snoozedCount} мөр хойшлогдсон байна. Ажлын жагсаалтаас дараагийн харилцагчаа сонгоорой.`
            : "Хугацаа хэтэрсэн алхам, даалгавар алга. Ажлын жагсаалтаас идэвхтэй хайлт хийгээрэй."
        }
        action={{ label: "Ажлын жагсаалт", href: `${basePath}/worklists` }}
        compact
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {shown.map((it) => {
          const Icon = KIND_ICON[it.kind];
          let due: { text: string; tone: "rose" | "amber" | "green" | "neutral" } | null = null;
          if ((it.kind === "sla" || it.kind === "accept") && it.dueAt) {
            const c = slaClock(it.dueAt, now, slaWarnMin);
            due = { text: clockLabel(c.minutesLeft), tone: c.tone };
          } else if (it.dueDate) {
            const d = daysOverdue(it.dueDate, todayIso);
            due = d > 0 ? { text: `${d} хоног хэтэрсэн`, tone: "rose" } : { text: "Өнөөдөр", tone: "amber" };
          } else if (it.dueAt) {
            const sameDay = it.dueAt.slice(0, 10) === nowIso.slice(0, 10);
            due = { text: it.overdue && !sameDay ? `${fmtDay(it.dueAt)} ${fmtTime(it.dueAt)}` : fmtTime(it.dueAt), tone: it.overdue ? "rose" : "neutral" };
          }
          return (
            <li key={it.key} className="py-2.5">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                    it.kind === "sla" || it.kind === "accept"
                      ? "bg-rose-50 text-rose-600"
                      : it.overdue
                        ? "bg-amber-50 text-amber-700"
                        : "bg-brand-50 text-brand-600"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <Link href={it.href} className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{it.title}</span>
                    {it.grade ? <Badge tone={it.grade === "a" ? "rose" : it.grade === "b" ? "amber" : "neutral"}>{it.grade.toUpperCase()}</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {TODAY_KIND_LABEL[it.kind]}
                    {it.subtitle ? ` · ${it.subtitle}` : ""}
                  </span>
                </Link>
                {due ? (
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium tabular-nums",
                      due.tone === "rose" ? "text-rose-600" : due.tone === "amber" ? "text-amber-700" : due.tone === "green" ? "text-emerald-700" : "text-muted"
                    )}
                  >
                    {due.text}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
                {it.phone && (it.action === "log" || it.kind === "feedback") ? (
                  <a
                    href={`tel:${it.phone.replace(/\s+/g, "")}`}
                    onClick={() => rememberCall(it.key)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    <Phone className="size-4" /> Залгах
                  </a>
                ) : null}
                {it.action === "log" && it.contactId ? (
                  <Button size="sm" variant="secondary" onClick={() => setLogFor(it)} disabled={pending}>
                    Үр дүн бүртгэх
                  </Button>
                ) : null}
                {it.action === "complete" ? (
                  <Button size="sm" variant="secondary" onClick={() => complete(it)} disabled={pending}>
                    <Check className="size-4" /> Хийсэн
                  </Button>
                ) : null}
                {it.action === "open" || it.kind === "feedback" ? (
                  <Link href={it.href} className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
                    {it.kind === "feedback" ? "Эргэх холбоо бүртгэх" : it.kind === "accept" ? "Хүлээн авах" : "Нээх"} <ChevronRight className="size-4" />
                  </Link>
                ) : null}
                {canSnooze(it.kind) ? (
                  snoozeFor === it.key ? (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {snoozeHours.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => snooze(it, h)}
                          className="h-9 rounded-xl border border-line px-2.5 text-sm text-ink hover:bg-surface-2"
                        >
                          {h >= 24 && h % 24 === 0 ? `${h / 24} хоног` : `${h} цаг`}
                        </button>
                      ))}
                      <button type="button" onClick={() => setSnoozeFor(null)} className="h-9 px-2 text-sm text-muted">
                        Болих
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSnoozeFor(it.key)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm text-muted hover:bg-surface-2"
                    >
                      <Clock3 className="size-4" /> Хойшлуулах
                    </button>
                  )
                ) : (
                  <span className="text-xs text-subtle">Хойшлуулахгүй — хугацаандаа холбогдоно</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > VISIBLE_DEFAULT ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 w-full rounded-xl py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
          {showAll ? "Хураах" : `Бүгдийг харах (${list.length})`}
        </button>
      ) : null}
      {snoozedCount > 0 ? <p className="mt-2 text-xs text-subtle">{snoozedCount} мөр хойшлогдсон.</p> : null}

      {logFor && logFor.contactId ? (
        <QuickLogSheet
          open
          onClose={() => setLogFor(null)}
          contactId={logFor.contactId}
          leadId={logFor.leadId}
          opportunityId={logFor.opportunityId}
          grade={(logFor.grade as LeadGrade | null) ?? null}
          leadIsNew={logFor.leadIsNew}
          retryHours={retryHours}
          recontactRanges={recontactRanges}
          onFull={() => {
            const href = logFor.href;
            setLogFor(null);
            router.push(href);
          }}
        />
      ) : null}
    </div>
  );
}

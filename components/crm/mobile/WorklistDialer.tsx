"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquare, Phone, PhoneCall, SkipForward, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickLogSheet } from "@/components/crm/QuickLogSheet";
import { TrackEnrollButton } from "@/components/crm/mobile/TrackEnrollButton";
import type { WorklistEntry } from "@/lib/crm/worklists";
import type { TrackTemplate } from "@/lib/queries-crm-worklists";
import type { RecontactRanges } from "@/lib/crm/scoring";
import { LEAD_GRADE_LABEL, type LeadGrade } from "@/lib/constants-crm";
import { cn } from "@/lib/utils";

/**
 * Ажлын жагсаалт ба дараалсан залгалт (R15): жагсаалтаас «Дараалан
 * залгах» горимд нэг харилцагчийг том картаар харуулж, Залгах → буцаж
 * ирэхэд үр дүн бүртгэх → «Дараагийнх». VoIP шаардахгүй (tel:).
 */

const CALL_FLAG = "crm:worklist-call";

function tel(p: string) {
  return `tel:${p.replace(/\s+/g, "")}`;
}

export function WorklistDialer({
  entries,
  templates,
  retryHours,
  recontactRanges,
  emptyHref,
}: {
  entries: WorklistEntry[];
  templates: TrackTemplate[];
  retryHours: number;
  recontactRanges: RecontactRanges;
  emptyHref: string;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(false);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [logFor, setLogFor] = useState<WorklistEntry | null>(null);

  const queue = useMemo(() => entries.filter((e) => !done.has(e.key)), [entries, done]);
  const current = queue[Math.min(idx, Math.max(queue.length - 1, 0))] ?? null;

  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = sessionStorage.getItem(CALL_FLAG);
        if (!raw) return;
        sessionStorage.removeItem(CALL_FLAG);
        const v = JSON.parse(raw) as { key: string; at: number };
        const e = entries.find((x) => x.key === v.key);
        if (e && Date.now() - v.at < 2 * 3600_000) setLogFor(e);
      } catch {
        // алгасна
      }
    }
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [entries]);

  function markCall(e: WorklistEntry) {
    try {
      sessionStorage.setItem(CALL_FLAG, JSON.stringify({ key: e.key, at: Date.now() }));
    } catch {
      // алгасна
    }
  }

  function next() {
    if (current) setDone((d) => new Set(d).add(current.key));
    setIdx((i) => Math.max(0, Math.min(i, queue.length - 2)));
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Энэ жагсаалт хоосон байна"
        description="Шаардлага хангасан бүртгэл алга — сайн байна. Бусад жагсаалтыг шалгаарай."
        action={{ label: "Бүх жагсаалт", href: emptyHref }}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => { setFocus(true); setIdx(0); }} disabled={!queue.length}>
          <PhoneCall className="size-4" /> Дараалан залгах ({queue.length})
        </Button>
        {done.size ? <span className="text-xs text-muted">{done.size} харилцагч энэ удаад дууссан</span> : null}
      </div>

      {focus && current ? (
        <div className="mb-4 rounded-2xl border-2 border-brand-200 bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span className="tabular-nums">
              {Math.min(idx, queue.length - 1) + 1} / {queue.length}
            </span>
            <button type="button" onClick={() => setFocus(false)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-surface-2">
              <X className="size-3.5" /> Хаах
            </button>
          </div>
          <Link href={current.href} className="block">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
              {current.name}
              {current.grade ? <Badge tone={LEAD_GRADE_LABEL[current.grade as LeadGrade]?.tone ?? "neutral"}>{LEAD_GRADE_LABEL[current.grade as LeadGrade]?.label ?? ""}</Badge> : null}
            </p>
            <p className="text-sm text-muted">{current.reason}</p>
            {current.phone ? <p className="mt-1 text-sm tabular-nums text-ink">{current.phone}</p> : <p className="mt-1 text-sm text-amber-700">Утасны дугаар бүртгэгдээгүй</p>}
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {current.phone ? (
              <a
                href={tel(current.phone)}
                onClick={() => markCall(current)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700"
              >
                <Phone className="size-5" /> Залгах
              </a>
            ) : null}
            {current.phone ? (
              <a
                href={`sms:${current.phone.replace(/\s+/g, "")}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-surface-2"
              >
                <MessageSquare className="size-4" /> Мессеж
              </a>
            ) : null}
            {current.kind === "lead" ? (
              <Button size="lg" variant="secondary" onClick={() => setLogFor(current)}>
                Үр дүн бүртгэх
              </Button>
            ) : (
              <Link href={current.href} className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-50 px-4 text-sm font-medium text-brand-700">
                Эргэх холбоо бүртгэх
              </Link>
            )}
            <Button size="lg" variant="outline" onClick={next}>
              <SkipForward className="size-4" /> Дараагийнх
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2" disabled={idx === 0}>
              <ChevronLeft className="size-4" /> Өмнөх
            </button>
            <TrackEnrollButton templates={templates} leadId={current.leadId} opportunityId={current.leadId ? null : current.opportunityId} name={current.name} />
          </div>
        </div>
      ) : null}
      {focus && !current ? (
        <div className="mb-4">
          <EmptyState compact title="Жагсаалт дууслаа" description="Энэ удаагийн бүх харилцагчийг дамжлаа." action={{ label: "Шинэчлэх", onClick: () => { setDone(new Set()); setFocus(false); router.refresh(); } }} />
        </div>
      ) : null}

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {entries.map((e) => (
          <li key={e.key} className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5", done.has(e.key) && "opacity-50")}>
            <Link href={e.href} className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{e.name}</span>
                {e.grade ? <Badge tone={LEAD_GRADE_LABEL[e.grade as LeadGrade]?.tone ?? "neutral"}>{e.grade.toUpperCase()}</Badge> : null}
              </span>
              <span className="block truncate text-xs text-muted">{e.reason}</span>
            </Link>
            <span className="flex items-center gap-1">
              {e.phone ? (
                <a href={tel(e.phone)} onClick={() => markCall(e)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white">
                  <Phone className="size-4" /> <span className="hidden sm:inline">Залгах</span>
                </a>
              ) : null}
              {e.kind === "lead" ? (
                <Button size="sm" variant="ghost" onClick={() => setLogFor(e)}>
                  Бүртгэх
                </Button>
              ) : null}
              <TrackEnrollButton templates={templates} leadId={e.leadId} opportunityId={e.leadId ? null : e.opportunityId} name={e.name} />
              <Link href={e.href} className="hidden h-9 items-center rounded-xl px-2 text-muted hover:bg-surface-2 sm:inline-flex" aria-label="Карт нээх">
                <ChevronRight className="size-4" />
              </Link>
            </span>
          </li>
        ))}
      </ul>

      {logFor && logFor.kind === "lead" ? (
        <QuickLogSheet
          open
          onClose={() => {
            setLogFor(null);
            router.refresh();
          }}
          contactId={logFor.contactId}
          leadId={logFor.leadId}
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

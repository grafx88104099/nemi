"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, Circle, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import { StageTag } from "@/components/crm2/staff/form/fields";
import type { Checklist, ChecklistItem, ChecklistTarget, NextStep } from "@/lib/crm2/checklist";
import { CHECKLIST_GROUP_LABEL } from "@/lib/crm2/labels";

import { AutoTag } from "./sheets/AutoTag";
import { useCardSheet } from "./sheets/use-card-sheet";
import type { CardSheetParam } from "./sheets/sheet-model";

/** Шалгах жагсаалтын гүйцэтгэлийн мөр (хувь). */
function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-label="Бүртгэлийн гүйцэтгэл"
      className={cn("block h-2 overflow-hidden rounded-full bg-surface-2", className)}
    >
      <span className={cn("block h-full rounded-full", p >= 100 ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${p}%` }} />
    </span>
  );
}

function ItemRow({ item, onOpen, canEdit }: { item: ChecklistItem; onOpen: (t: ChecklistTarget) => void; canEdit: boolean }) {
  const Icon = item.done ? CircleCheck : Circle;
  const clickable = canEdit && item.target.sheet !== "checklist";
  const body = (
    <>
      <Icon className={cn("size-5 shrink-0", item.done ? "text-emerald-600" : item.required ? "text-amber-600" : "text-muted")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block break-words text-sm", item.done ? "text-muted" : "font-medium text-ink")}>{item.label}</span>
        {!item.done && (item.auto || (item.required && item.stage)) ? (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.auto ? <AutoTag /> : null}
            {item.required && item.stage && !item.auto ? <StageTag stage={item.stage} /> : null}
          </span>
        ) : null}
      </span>
      <span className="sr-only">{item.done ? "— бөглөсөн" : item.required ? "— дутуу, заавал" : "— дутуу"}</span>
      {clickable ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  if (!clickable) return <div className="flex min-h-11 items-center gap-3 px-3 py-2">{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.target)}
      className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
    >
      {body}
    </button>
  );
}

/**
 * Шалгах жагсаалт (P3): 4 бүлэг (Бүртгэл, Гэрээ, Нийтлэхэд бэлэн, Нэмэлт), бүлэг бүрийн гүйцсэн/нийт,
 * мөр бүр тухайн талбарын цонхыг (?sheet=…&field=…) нээнэ. Баталгаажаагүй утга «автомат».
 */
export function ChecklistSheet({
  checklist,
  next,
  canEdit,
  onClose,
  onOpen,
}: {
  checklist: Checklist;
  next: NextStep;
  canEdit: boolean;
  onClose: () => void;
  onOpen: (sheet: CardSheetParam, field: string | null) => void;
}) {
  const open = (t: ChecklistTarget) => onOpen(t.sheet as CardSheetParam, t.field);
  return (
    <BottomSheet open onClose={onClose} title="Шалгах жагсаалт">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Гүйцэтгэл</p>
            <p className="text-sm font-bold tabular-nums text-ink">{checklist.percent}%</p>
          </div>
          <ProgressBar percent={checklist.percent} />
          {next.group ? (
            canEdit ? (
              <button
                type="button"
                onClick={() => open(next.target)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-brand-50 px-3 text-left text-sm font-semibold text-brand-800 hover:bg-brand-100"
              >
                <span className="min-w-0 flex-1">Дараагийн алхам: {next.label}</span>
                <ChevronRight className="size-4 shrink-0" aria-hidden />
              </button>
            ) : (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">Дараагийн алхам: {next.label}</p>
            )
          ) : null}
        </div>
        {checklist.groups.map((g) =>
          g.total ? (
            <section key={g.group} aria-labelledby={`cl-${g.group}`} className="space-y-1.5">
              <h3 id={`cl-${g.group}`} className="flex items-baseline justify-between gap-2 text-sm font-bold text-ink">
                {CHECKLIST_GROUP_LABEL[g.group]}
                <span className={cn("text-xs font-semibold tabular-nums", g.done === g.total ? "text-emerald-700" : "text-muted")}>
                  {g.done}/{g.total}
                </span>
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {g.items.map((item) => (
                  <li key={item.key}>
                    <ItemRow item={item} onOpen={open} canEdit={canEdit} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Шалгах жагсаалтын товч (картын «Үндсэн мэдээлэл», засах хуудас): хувь, бүлэг тус бүрийн гүйцсэн/нийт,
 * дараагийн алхам. href өгвөл холбоос (засах хуудаснаас карт руу), эс бөгөөс картын цонхыг нээнэ.
 */
export function ChecklistSummary({ checklist, next, href }: { checklist: Checklist; next: NextStep; href?: string }) {
  const content = (
    <>
      <span className="flex items-center gap-2">
        <ListChecks className="size-4 shrink-0 text-brand-700" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-bold text-ink">Шалгах жагсаалт</span>
        <span className="text-sm font-bold tabular-nums text-ink">{checklist.percent}%</span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </span>
      <ProgressBar percent={checklist.percent} className="mt-2" />
      <span role="list" className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
        {checklist.groups.map((g) =>
          g.total ? (
            <span
              role="listitem"
              key={g.group}
              className={cn(
                "flex items-center justify-between gap-1 rounded-lg px-2 py-1.5",
                g.done === g.total ? "bg-emerald-50 text-emerald-900" : "bg-surface-2 text-ink"
              )}
            >
              <span className="min-w-0 truncate">{CHECKLIST_GROUP_LABEL[g.group]}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {g.done}/{g.total}
              </span>
            </span>
          ) : null
        )}
      </span>
      {next.group ? (
        <span className="mt-2 block text-sm text-muted">
          Дараагийн алхам: <span className="font-semibold text-ink">{next.label}</span>
        </span>
      ) : null}
    </>
  );
  const cls = "block w-full rounded-2xl border border-line bg-surface p-3 text-left shadow-sm transition hover:border-line-strong sm:p-4";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return <SummaryButton className={cls}>{content}</SummaryButton>;
}

function SummaryButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { open } = useCardSheet();
  return (
    <button type="button" className={className} onClick={() => open("checklist")}>
      {children}
    </button>
  );
}

import Link from "next/link";
import { AlarmClock, Clock3, PhoneCall } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateNum, fmtDateTime } from "@/lib/format";
import { taskBucket } from "@/lib/crm2/datetime";
import { requirementLines, requirementTitle, type RequirementLookup } from "@/lib/crm2/contacts-requirements";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2WaitlistRow } from "@/lib/crm2/queries/waitlist";
import { Badge } from "@/components/ui/badge";
import { AgentChip, CodeChip, TaskBucketBadge } from "@/components/crm2/ui";

import { waitingText } from "./list-params";
import { ReminderButton } from "./ReminderButton";
import { WaitlistMatches } from "./WaitlistMatches";

/**
 * T10 — хүлээж буй нэг үйлчлүүлэгчийн карт: хэн, юу хүсэж байна, хэдийнээс
 * хүлээж байна, хэн хариуцаж байна, хэдэн тохирох хөрөнгө байна.
 * Тохирол байхгүй нь алдаа биш — чимээгүйхэн харагдана.
 */
export function WaitlistCard({
  row,
  panel,
  lookup,
  now,
}: {
  row: Crm2WaitlistRow;
  panel: Crm2Panel;
  lookup: RequirementLookup;
  /** Хүлээсэн хугацааг бодох агшин (нэг хуудсанд нэг). */
  now: number;
}) {
  const paths = crm2Paths(panel);
  const contactHref = paths.contact(row.contactId);
  const lines = requirementLines(row.requirement, lookup);
  const reminderBucket = row.nextTask ? taskBucket(row.nextTask.dueAt, now) : null;

  return (
    <li className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5">
            <CodeChip code={row.contactCode} href={contactHref} />
            <Link href={contactHref} className="truncate font-bold text-ink hover:text-brand-700 hover:underline">
              {row.contactName}
            </Link>
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">{requirementTitle(row.requirement, lookup)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {row.exactCount > 0 ? (
            <Badge tone="green" className="tabular-nums">
              {row.exactCount} тохирох
            </Badge>
          ) : null}
          {row.nearCount > 0 ? (
            <Badge tone="neutral" className="tabular-nums">
              {row.nearCount} ойрхон
            </Badge>
          ) : null}
          {row.exactCount + row.nearCount === 0 ? (
            <span className="text-xs text-subtle">Тохирох хөрөнгө одоогоор алга</span>
          ) : null}
        </div>
      </div>

      {lines.length ? (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {lines.map((l) => (
            <div key={l.field} className={cn("min-w-0", (l.field === "notes" || l.field === "must_haves") && "sm:col-span-2")}>
              <dt className="text-xs text-muted">{l.label}</dt>
              <dd className="whitespace-pre-line break-words text-ink">{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">Шалгуур бөглөөгүй — харилцагчийн карт дээр шаардлагыг нь дэлгэрүүлнэ.</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <span className="flex min-w-0 items-center gap-1.5 text-muted">
          <Clock3 className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Хүлээж байгаа: <span className="font-semibold text-ink">{waitingText(row.waitingSince, now)}</span>{" "}
            <span className="text-subtle tabular-nums">({fmtDateNum(row.waitingSince)}-наас)</span>
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-muted">
          <PhoneCall className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {row.lastActivityAt ? (
              <>
                Сүүлд холбогдсон: <span className="tabular-nums text-ink">{fmtDateTime(row.lastActivityAt)}</span>
              </>
            ) : (
              "Холбогдсон бүртгэл алга"
            )}
          </span>
        </span>
        <AgentChip name={row.agentName} role="Хариуцагч" className="min-w-0" />
      </div>

      {row.nextTask && reminderBucket ? (
        <p className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted">
          <AlarmClock className="size-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums text-ink">
            Сануулга: {row.nextTask.dueAt ? fmtDateTime(row.nextTask.dueAt) : "хугацаагүй"}
          </span>
          <TaskBucketBadge bucket={reminderBucket} />
          {row.nextTask.note ? <span className="min-w-0 break-words">· {row.nextTask.note}</span> : null}
        </p>
      ) : null}

      <div className="mt-3 border-t border-line pt-3">
        <WaitlistMatches
          panel={panel}
          requirementId={row.requirementId}
          contactId={row.contactId}
          contactName={row.contactName}
          exactCount={row.exactCount}
          nearCount={row.nearCount}
          categoryLabels={lookup.categoryLabels ?? {}}
          typeLabels={lookup.types ?? {}}
        >
          <ReminderButton
            contactId={row.contactId}
            contactName={row.contactName}
            requirementId={row.requirementId}
            hasReminder={!!row.nextTask}
          />
        </WaitlistMatches>
      </div>
    </li>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ChevronRight, Circle, ListChecks, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmPropertyFields } from "@/lib/crm2/actions/quick-add";
import { CHECKLIST_GROUP_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { ChecklistTarget } from "@/lib/crm2/checklist";
import { cn } from "@/lib/utils";

import { Note, Section } from "../parts";
import { PUBLIC_RISK_LABEL, type ConfirmRow } from "./publish-model";
import { readinessCount, type PublishReadiness } from "./readiness";

const GENERIC_FAIL_TEXT = "Алдаа гарлаа. Дахин оролдоно уу.";

/**
 * «Нийтлэхэд бэлэн» (P3) — ноорог шатнаас харагдана. Мөр бүр картын тухайн доод цонхыг (?sheet=…) нээнэ.
 * Автоматаар бөглөгдсөн нийтийн утгыг агент «Зөв» гэж баталгаажуулна — DB баталгаажаагүй утгатай
 * хөрөнгийг нийтлэхгүй (crm2_publish_blockers).
 */
export function ReadinessSection({
  panel,
  propertyId,
  readiness,
}: {
  panel: Crm2Panel;
  propertyId: string;
  readiness: PublishReadiness;
}) {
  const paths = crm2Paths(panel);
  const { done, total } = readinessCount(readiness);
  const ready = done === total;
  const items = readiness.group?.items ?? [];
  const href = (t: ChecklistTarget) =>
    t.sheet === "publish" ? null : paths.property(propertyId, undefined, { sheet: t.sheet });

  return (
    <Section
      title={CHECKLIST_GROUP_LABEL.publish}
      icon={ListChecks}
      action={
        <Badge tone={ready ? "green" : "amber"}>
          <span className="tabular-nums">
            {done}/{total}
          </span>
        </Badge>
      }
    >
      <div className="space-y-3">
        <ul className="-mx-1 divide-y divide-line">
          {readiness.gates.map((g) => (
            <ReadyRow key={g.key} label={g.label} done={g.done} href={g.done ? null : href(g.target)} />
          ))}
          {items.map((i) => (
            <ReadyRow
              key={i.key}
              label={i.label}
              done={i.done}
              auto={i.auto}
              optional={!i.required}
              href={i.done ? null : href(i.target)}
            />
          ))}
        </ul>

        {readiness.confirmRows.length > 0 ? (
          <ConfirmList propertyId={propertyId} rows={readiness.confirmRows} canConfirm={readiness.canConfirm} />
        ) : null}

        {readiness.textFindings.length > 0 ? (
          <div className="space-y-1.5">
            <Note icon={TriangleAlert} tone="amber">
              Карт дээрх нийтийн бичвэрт хувийн мэдээлэл байж болзошгүй — анхдагч гарчиг, танилцуулгад орно:
            </Note>
            <ul className="space-y-1 pl-1 text-xs text-amber-900">
              {readiness.textFindings.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{f.label}:</span>
                  <span>{f.risks.map((r) => PUBLIC_RISK_LABEL[r]).join(", ")}</span>
                  <Link
                    href={paths.property(propertyId, undefined, { sheet: f.key === "location_text" ? "location" : "details" })}
                    className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline sm:min-h-0"
                  >
                    Засах
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function ReadyRow({
  label,
  done,
  auto,
  optional,
  href,
}: {
  label: string;
  done: boolean;
  auto?: boolean;
  optional?: boolean;
  href: string | null;
}) {
  const body = (
    <>
      {done ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Circle className={cn("size-5 shrink-0", optional ? "text-subtle" : "text-amber-500")} aria-hidden />
      )}
      <span className={cn("min-w-0 flex-1 text-sm", done ? "text-muted" : "text-ink")}>
        {label}
        <span className="sr-only">{done ? " — бэлэн" : " — дутуу"}</span>
      </span>
      {auto ? (
        <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">автомат</span>
      ) : null}
      {optional && !done ? <span className="shrink-0 text-[11px] text-subtle">сануулга</span> : null}
      {href ? <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden /> : null}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} scroll={false} className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 hover:bg-surface-2">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-2.5 px-1">{body}</div>
      )}
    </li>
  );
}

/** Баталгаажаагүй (автомат) нийтийн утга — мөр бүр «Зөв». */
function ConfirmList({ propertyId, rows, canConfirm }: { propertyId: string; rows: ConfirmRow[]; canConfirm: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [doneIds, setDoneIds] = React.useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = React.useState("");
  const visible = rows.filter((r) => !doneIds.has(r.id));

  async function confirm(targets: ConfirmRow[], busyId: string) {
    setBusy(busyId);
    try {
      const res = await confirmPropertyFields(propertyId, targets.flatMap((r) => r.keys));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDoneIds((prev) => new Set([...prev, ...targets.map((r) => r.id)]));
      setStatus(targets.length === 1 ? `${targets[0].label} баталгаажлаа` : `${targets.length} утга баталгаажлаа`);
      router.refresh();
    } catch (e) {
      console.error("ReadinessSection зөв:", e);
      toast.error(GENERIC_FAIL_TEXT);
    } finally {
      setBusy(null);
    }
  }

  if (visible.length === 0) {
    return (
      <p className="text-xs text-emerald-700" role="status" aria-live="polite">
        {status || "Бүх утга баталгаажлаа"}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-900">Автомат утгыг шалгана уу</p>
        {canConfirm && visible.length > 1 ? (
          <Button type="button" size="touch" variant="outline" disabled={busy !== null} onClick={() => void confirm(visible, "all")}>
            <Check className="size-4" aria-hidden /> {busy === "all" ? "Хадгалж байна…" : "Бүгд зөв"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-amber-900/80">
        Зараас, наасан текстээс эсвэл төслөөс автоматаар бөглөгдсөн. Баталгаажуулах хүртэл нийтлэхгүй. Буруу бол мөрийг нь
        дарж засна.
      </p>
      <ul className="space-y-1.5">
        {visible.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{r.label}</p>
              <p className="break-words text-sm font-semibold text-ink">{r.value}</p>
            </div>
            {canConfirm ? (
              <Button
                type="button"
                size="touch"
                variant="secondary"
                className="min-w-11 shrink-0"
                disabled={busy !== null}
                aria-label={`${r.label}: ${r.value} — зөв`}
                onClick={() => void confirm([r], r.id)}
              >
                {busy === r.id ? "…" : "Зөв"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

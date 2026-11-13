"use client";

import * as React from "react";
import { Archive, ChevronDown, ClipboardList, History, Pencil, Plus, RotateCcw, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateNum, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog, RecordStatusBadge } from "@/components/crm2/ui";
import { updateRequirement } from "@/lib/crm2/actions/contacts";
import {
  changedRequirementFields,
  lineFieldsOf,
  requirementLines,
  requirementTitle,
  toRequirementData,
  type RequirementData,
} from "@/lib/crm2/contacts-requirements";
import type { Crm2RecordStatus, Json } from "@/lib/crm2/types";

import { RequirementFormDrawer, type RequirementLists } from "./RequirementForm";

/**
 * Харилцагчийн шаардлагууд (идэвхтэй / архив): тойм, засах, архивлах/сэргээх,
 * «өмнөх хувилбарууд» (crm2_requirement_versions — өөрчлөгдсөн талбарыг тодруулна).
 */

export type RequirementItem = {
  id: string;
  status: Crm2RecordStatus;
  version: number;
  updated_at: string;
  data: RequirementData;
};

export type RequirementVersion = {
  id: number;
  version: number;
  snapshot: Json;
  replacedAt: string;
  replacedByName: string | null;
};

export function RequirementsPanel({
  contactId,
  items,
  versions,
  canEdit,
  lists,
}: {
  contactId: string;
  items: RequirementItem[];
  /** requirement id → өмнөх хувилбарууд (шинэ нь эхэнд). */
  versions: Record<string, RequirementVersion[]>;
  canEdit: boolean;
  lists: RequirementLists;
}) {
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<{ id: string | null; data: RequirementData | null } | null>(null);
  const [archiving, setArchiving] = React.useState<RequirementItem | null>(null);
  const [pending, startTransition] = React.useTransition();

  const active = items.filter((r) => r.status === "active");
  const archived = items.filter((r) => r.status !== "active");
  const shown = showArchived ? [...active, ...archived] : active;

  function restore(r: RequirementItem) {
    startTransition(async () => {
      const res = await updateRequirement({ requirement_id: r.id, status: "active" });
      if (!res.ok) toast.error(res.error);
      else toast.success("Шаардлагыг сэргээлээ");
    });
  }

  return (
    // #requirements — хэлцэл цуцалсны дараах «Шаардлага шинэчлэх» холбоос энд ирнэ.
    <Card id="requirements" className="scroll-mt-20">
      <CardBody className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ClipboardList className="size-4 text-brand-600" aria-hidden />
            Шаардлага
            <span className="text-sm font-normal text-muted">({active.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="touch" disabled title="Дараагийн шатанд нээгдэнэ">
              <Search className="size-4" aria-hidden />
              Тохирох хөрөнгө хайх
              <Badge tone="neutral">удахгүй</Badge>
            </Button>
            {canEdit ? (
              <Button type="button" size="touch" onClick={() => setEditing({ id: null, data: null })}>
                <Plus className="size-4" aria-hidden />
                Шаардлага нэмэх
              </Button>
            ) : null}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {archived.length ? "Идэвхтэй шаардлага алга." : "Шаардлага бүртгээгүй."}
            {canEdit ? " Хүссэн хөрөнгийн ангилал, төсөв, байршлыг бүртгэвэл тохирох санал хайхад ашиглана." : ""}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {shown.map((r) => (
              <RequirementCard
                key={r.id}
                item={r}
                versions={versions[r.id] ?? []}
                lists={lists}
                canEdit={canEdit}
                pending={pending}
                onEdit={() => setEditing({ id: r.id, data: r.data })}
                onArchive={() => setArchiving(r)}
                onRestore={() => restore(r)}
              />
            ))}
          </ul>
        )}

        {archived.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
            aria-expanded={showArchived}
          >
            <ChevronDown className={cn("size-4 transition", showArchived && "rotate-180")} aria-hidden />
            {showArchived ? "Архивласныг нуух" : `Архивласан шаардлага (${archived.length})`}
          </button>
        ) : null}
      </CardBody>

      <RequirementFormDrawer
        open={!!editing}
        onClose={() => setEditing(null)}
        contactId={contactId}
        requirementId={editing?.id ?? null}
        initial={editing?.data ?? null}
        lists={lists}
      />

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        title="Шаардлагыг архивлах уу?"
        description="Архивласан шаардлага тохирол хайлтад орохгүй. Түүх, өмнөх хувилбарууд хадгалагдана; дараа нь сэргээж болно."
        confirmLabel="Архивлах"
        onConfirm={async () => {
          if (!archiving) return null;
          const r = await updateRequirement({ requirement_id: archiving.id, status: "archived" });
          if (!r.ok) return r.error;
          toast.success("Шаардлагыг архивлалаа");
          return null;
        }}
      />
    </Card>
  );
}

function RequirementCard({
  item,
  versions,
  lists,
  canEdit,
  pending,
  onEdit,
  onArchive,
  onRestore,
}: {
  item: RequirementItem;
  versions: RequirementVersion[];
  lists: RequirementLists;
  canEdit: boolean;
  pending: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [showVersions, setShowVersions] = React.useState(false);
  const lookup = { categoryLabels: lists.categoryLabels, types: lists.types, features: lists.features };
  const lines = requirementLines(item.data, lookup);
  const archived = item.status !== "active";

  return (
    <li className={cn("rounded-xl border p-3", archived ? "border-line bg-surface-2/60" : "border-line bg-surface")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
            {requirementTitle(item.data, lookup)}
            {archived ? <RecordStatusBadge status={item.status} /> : null}
            <span className="text-xs font-normal text-subtle">
              {item.version}-р хувилбар · {fmtDateNum(item.updated_at)}
            </span>
          </p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1">
            {!archived ? (
              <>
                <Button type="button" variant="ghost" size="touch" onClick={onEdit} disabled={pending}>
                  <Pencil className="size-4" aria-hidden />
                  Засах
                </Button>
                <Button type="button" variant="ghost" size="touch" onClick={onArchive} disabled={pending}>
                  <Archive className="size-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Архивлах</span>
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="touch" onClick={onRestore} disabled={pending}>
                <RotateCcw className="size-4" aria-hidden />
                Сэргээх
              </Button>
            )}
          </div>
        ) : null}
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
        <p className="mt-2 text-sm text-muted">Шалгуур бөглөөгүй.</p>
      )}

      {versions.length > 0 ? (
        <div className="mt-3 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setShowVersions((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            aria-expanded={showVersions}
          >
            <History className="size-4" aria-hidden />
            Өмнөх хувилбарууд ({versions.length})
            <ChevronDown className={cn("size-4 transition", showVersions && "rotate-180")} aria-hidden />
          </button>
          {showVersions ? (
            <ol className="mt-2 space-y-2">
              {versions.map((v, i) => {
                const data = toRequirementData(v.snapshot);
                // Энэ хувилбарыг дараагийнх нь (шинэ) солисон: юу өөрчлөгдсөн бэ.
                const newer = i === 0 ? item.data : toRequirementData(versions[i - 1].snapshot);
                const changed = lineFieldsOf(changedRequirementFields(data, newer));
                const vLines = requirementLines(data, lookup);
                return (
                  <li key={v.id} className="rounded-lg bg-surface-2 p-2.5">
                    <p className="text-xs text-muted">
                      <span className="font-semibold text-ink">{v.version}-р хувилбар</span> · {fmtDateTime(v.replacedAt)} хүртэл
                      {v.replacedByName ? ` · сольсон ${v.replacedByName}` : ""}
                    </p>
                    {vLines.length ? (
                      <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
                        {vLines.map((l) => (
                          <div key={l.field} className="min-w-0">
                            <dt className="text-xs text-muted">{l.label}</dt>
                            <dd
                              className={cn(
                                "whitespace-pre-line break-words",
                                changed.has(l.field) ? "font-medium text-amber-800" : "text-ink"
                              )}
                            >
                              {l.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Шалгуур хоосон байсан.</p>
                    )}
                    {changed.size > 0 ? (
                      <p className="mt-1 text-xs text-muted">Шараар тодруулсан нь дараагийн хувилбарт өөрчлөгдсөн.</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

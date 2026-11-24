"use client";

import * as React from "react";
import { FileText, Lock } from "lucide-react";

import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { approveBrokerage } from "@/lib/crm2/actions/brokerage";
import { BROKERAGE_FILE_KIND_LABEL, missingItemLabel, type Crm2BrokerageFileKindKey } from "@/lib/crm2/labels";
import type { Crm2BrokerageApproveResult } from "@/lib/crm2/types";

import { approveFileArg, needsFileCheck } from "@/components/crm2/staff/card/contract/contract-model";

export const FILE_CHECK_LABEL = "Гэрээний файлтай тулгаж шалгасан";

export type ApproveFile = { id: string; file_name: string | null; kind: string | null; url: string | null };

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm";

/** Батлалтын хариуг хүнд ойлгомжтой мэдэгдэл болгоно. */
export function approveToast(r: Crm2BrokerageApproveResult): void {
  if (r.property_status === "active") toast.success("Гэрээ батлагдлаа. Хөрөнгө идэвхтэй боллоо.");
  else if (r.activate_on_start) toast.success("Гэрээ батлагдлаа. Эхлэх өдөр нь хөрөнгө идэвхжинэ.");
  else if (r.property_missing?.length) {
    toast.info("Гэрээ батлагдлаа. Хөрөнгө идэвхжээгүй — дутуу мэдээлэлтэй.", {
      description: r.property_missing.map(missingItemLabel).join(", "),
      durationMs: 10000,
    });
  } else if (r.activation_mode === "manual") {
    toast.success("Гэрээ батлагдлаа", { description: "Хөрөнгийг картын «Идэвхжүүлэх»-ээр идэвхжүүлнэ." });
  } else toast.success("Гэрээ батлагдлаа.");
}

/**
 * Зуучлалын гэрээ батлах цонх (карт ба «Батлах» дэлгэц). brokerage.require_file үед
 * «Гэрээний файлтай тулгаж шалгасан»-ыг заавал тэмдэглэнэ → approveBrokerage({file_checked: true}).
 * Файлын жагсаалт RLS-ээр ирсэн мөрүүд — хязгаарлагдсан баримт эрхгүй хүнд ирэхгүй.
 */
export function ApproveBrokerageDialog({
  open,
  onClose,
  contractId,
  title,
  updatedAt,
  requireFile,
  files,
  onApproved,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  title: string;
  updatedAt: string;
  requireFile: boolean;
  files?: readonly ApproveFile[];
  onApproved?: (r: Crm2BrokerageApproveResult) => void;
}) {
  const ids = React.useId();
  const [note, setNote] = React.useState("");
  const [checked, setChecked] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setNote("");
      setChecked(false);
    }
  }
  const mustCheck = needsFileCheck(requireFile);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={title}
      description="Батлагдсан гэрээний агуулгыг дахин засахгүй. Баталсан хүн, огноо хадгалагдана."
      confirmLabel="Батлах"
      disabled={mustCheck && !checked}
      onConfirm={async () => {
        const r = await approveBrokerage({
          contract_id: contractId,
          note,
          expected_updated_at: updatedAt,
          file_checked: approveFileArg(requireFile, checked),
        });
        if (!r.ok) return r.error;
        approveToast(r.data);
        onApproved?.(r.data);
        return null;
      }}
    >
      <div className="space-y-4">
        {files ? (
          files.length ? (
            <ul className="space-y-1" aria-label="Гэрээний файл">
              {files.map((f) => {
                const kind = (f.kind ?? "contract") as Crm2BrokerageFileKindKey;
                const label = f.file_name || BROKERAGE_FILE_KIND_LABEL[kind] || "Файл";
                const restricted = kind === "ownership" || kind === "id";
                return (
                  <li key={f.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                    {restricted ? <Lock className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-brand-700 hover:underline">
                        {label}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate text-muted">{label}</span>
                    )}
                    <span className="ml-auto shrink-0 rounded-md bg-surface-2 px-1.5 text-xs text-muted">{BROKERAGE_FILE_KIND_LABEL[kind] ?? kind}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-amber-800">Файл хавсаргаагүй.</p>
          )
        ) : null}
        {mustCheck ? (
          <label htmlFor={`${ids}-check`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 text-sm font-medium text-ink">
            <input
              id={`${ids}-check`}
              type="checkbox"
              className="size-5 accent-brand-500"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {FILE_CHECK_LABEL}
          </label>
        ) : null}
        <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`} hint={`${note.length}/2000`}>
          <textarea id={`${ids}-note`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={TEXTAREA} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

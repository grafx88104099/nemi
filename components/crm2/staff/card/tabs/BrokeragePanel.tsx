"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  Check,
  FilePlus2,
  FileText,
  Paperclip,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { BrokerageStatusBadge } from "@/components/crm2/ui/badges";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import type { StaffOption } from "@/components/crm2/deals/types";
import {
  approveBrokerage,
  discardBrokerage,
  rejectBrokerage,
  renewBrokerage,
  submitBrokerage,
  terminateBrokerage,
  withdrawBrokerage,
} from "@/lib/crm2/actions/brokerage";
import { deleteBrokerageFile } from "@/lib/crm2/actions/media";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { DOC_ACCEPT, fmtFileSize } from "@/lib/crm2/files";
import { BROKERAGE_STATUS_LABEL, PROPERTY_STATUS_LABEL, missingItemLabel } from "@/lib/crm2/labels";
import { formatCommission } from "@/lib/crm2/money";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { BrokerageItem } from "@/lib/crm2/queries/properties";
import { uploadBrokerageFile, uploadMany } from "@/lib/crm2/storage";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { BrokerageForm, type BrokerageFormValues } from "./BrokerageForm";
import type { OwnerValue } from "./OwnerPicker";
import { brokerageActions, brokerageChain, brokerageEndInfo, renewableExpired } from "../logic";

/**
 * «Зуучлалын гэрээ» таб: хувилбарын гинж, гэрээ бүрийн төлөв, огноо, шимтгэл,
 * хариуцагч, файл (signed URL). Үйлдэл төлөв ба эрхээр: ноорог — засах, файл,
 * илгээх, хаях; илгээсэн — буцааж авах, батлах/татгалзах (батлагч); батлагдсан —
 * цуцлах, сунгах. Эцсийн шалгалт RPC дээр, алдааг нь харуулна.
 */
export function BrokeragePanel({
  panel,
  propertyId,
  officeId,
  contracts,
  canCreate,
  staff,
  defaultOwner,
  limits,
  requireOwner,
  requireFile,
  names,
  approverOf,
  now,
}: {
  panel: Crm2Panel;
  propertyId: string;
  officeId: string;
  contracts: BrokerageItem[];
  canCreate: boolean;
  staff: StaffOption[];
  defaultOwner: OwnerValue | null;
  limits: { maxDocMb: number; maxDocsPerContract: number };
  requireOwner: boolean;
  requireFile: boolean;
  names: Record<string, string>;
  /** Илгээсэн гэрээнд хэрэглэгч батлагч эсэх (өөрийгөө батлах дүрмээс өмнө). */
  approverOf: Record<string, boolean>;
  now: number;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrokerageFormValues | null>(null);
  const chain = brokerageChain(contracts);
  const toRenew = renewableExpired(contracts);
  const live = contracts.some((c) => c.status === "draft" || c.status === "pending" || c.status === "active");
  const numberById = Object.fromEntries(contracts.map((c) => [c.id, c.number]));

  function openEdit(c: BrokerageItem) {
    setEditing({
      id: c.id,
      number: c.number,
      owner: c.owner ? { id: c.owner.id, code: c.owner.code, full_name: c.owner.full_name } : null,
      start_date: c.start_date,
      end_date: c.end_date,
      terms: c.terms,
      commission_type: c.commission_type,
      commission_value: c.commission_value,
      commission_currency: c.commission_currency,
      commission_note: c.commission_note,
      responsible_agent_id: c.responsible_agent_id,
      responsible_name: c.responsible?.full_name ?? null,
    });
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Эзэнтэй хийсэн зуучлалын гэрээ батлагдсанаар хөрөнгө идэвхтэй Staff санд орно. Сунгалт нь өмнөх гэрээтэй холбоотой шинэ
          хувилбар.
        </p>
        {canCreate ? (
          <Button
            type="button"
            className="shrink-0"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <FilePlus2 className="size-4" aria-hidden /> {contracts.length ? "Шинэ гэрээ (өмнөхтэй холбоогүй)" : "Гэрээ нэмэх"}
          </Button>
        ) : null}
      </div>

      {toRenew && !live ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {toRenew.number ? `${toRenew.number} гэрээ` : "Гэрээ"} дууссан. Шинэ хугацааны гэрээг доорх «Сунгах»-аар үүсгэнэ — өмнөх
          гэрээний хувилбартай холбогдож, нөхцөл нь хуулагдана.
        </p>
      ) : null}

      {chain.length > 1 ? (
        <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Гэрээний хувилбарууд">
          {chain.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1.5">
              {i > 0 ? <ArrowRight className="size-3.5 text-subtle" aria-hidden /> : null}
              <a href={`#brokerage-${c.id}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 hover:bg-surface-2">
                <span className="font-mono font-semibold">{c.number}</span>
                <span className="text-muted">{c.version}-р хувилбар</span>
                <span className="text-muted">· {BROKERAGE_STATUS_LABEL[c.status]}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : null}

      {contracts.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Зуучлалын гэрээ бүртгэгдээгүй.{canCreate ? " «Гэрээ нэмэх»-ээр ноорог үүсгэж, файлаа хавсаргаад батлуулна." : ""}
        </Card>
      ) : (
        <ul className="space-y-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              panel={panel}
              c={c}
              officeId={officeId}
              previousNumber={c.previous_id ? (numberById[c.previous_id] ?? null) : null}
              limits={limits}
              names={names}
              approver={!!approverOf[c.id]}
              now={now}
              onEdit={() => openEdit(c)}
            />
          ))}
        </ul>
      )}

      <BrokerageForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        propertyId={propertyId}
        initial={editing}
        defaultOwner={defaultOwner}
        staff={staff}
        requireOwner={requireOwner}
        requireFile={requireFile}
      />
    </div>
  );
}

function who(names: Record<string, string>, id: string | null | undefined): string {
  return id ? (names[id] ?? "Ажилтан") : "—";
}

function ContractCard({
  panel,
  c,
  officeId,
  previousNumber,
  limits,
  names,
  approver,
  now,
  onEdit,
}: {
  panel: Crm2Panel;
  c: BrokerageItem;
  officeId: string;
  previousNumber: string | null;
  limits: { maxDocMb: number; maxDocsPerContract: number };
  names: Record<string, string>;
  approver: boolean;
  now: number;
  onEdit: () => void;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<null | "submit" | "discard" | "withdraw" | "approve" | "reject" | "terminate" | "renew">(null);
  const [approveNote, setApproveNote] = React.useState("");
  const [deleteFile, setDeleteFile] = React.useState<{ id: string; name: string } | null>(null);
  const actions = brokerageActions(c, { fileCount: c.files.length, maxFiles: limits.maxDocsPerContract });
  const endInfo = c.status === "active" ? brokerageEndInfo(c.end_date, now) : null;
  const close = () => setDialog(null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    if (files.length === 0) return;
    setUploading(`0/${files.length}`);
    try {
      const res = await uploadMany(
        files,
        (file, i) => uploadBrokerageFile({ file, officeId, contractId: c.id, limits, existing: c.files.length + i }),
        (done, total) => setUploading(`${done}/${total}`)
      );
      if (res.ok.length) toast.success(`${res.ok.length} файл хавсаргалаа`);
      for (const e of res.errors) toast.error(e);
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  const done = (msg: string, description?: string) => {
    toast.success(msg, description ? { description } : undefined);
    router.refresh();
    return null;
  };

  return (
    <li id={`brokerage-${c.id}`} className="scroll-mt-24">
      <Card className={cn("min-w-0 p-4", c.status === "active" && "border-emerald-200")}>
        <div className="flex flex-wrap items-center gap-2">
          <CodeChip code={c.number} title={`Зуучлалын гэрээ ${c.number}`} />
          <Badge>{c.version}-р хувилбар</Badge>
          <BrokerageStatusBadge status={c.status} />
          {endInfo ? <Badge tone={endInfo.tone}>{endInfo.text}</Badge> : null}
          {previousNumber ? <span className="text-xs text-muted">Сунгалт: өмнөх {previousNumber}</span> : null}
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Хугацаа</dt>
            <dd className="text-ink tabular-nums">
              {c.start_date ? fmtIsoDate(c.start_date) : "—"} – {c.end_date ? fmtIsoDate(c.end_date) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Шимтгэл</dt>
            <dd className="text-ink">
              {formatCommission(c.commission_type, c.commission_value, c.commission_currency) || "—"}
              {c.commission_note ? <span className="block text-xs text-muted">{c.commission_note}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Хариуцсан агент</dt>
            <dd className="text-ink">{c.responsible?.full_name ?? who(names, c.responsible_agent_id)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Эзэн</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {c.owner ? (
                <>
                  <MaskedName name={c.owner.full_name} visible href={paths.contact(c.owner.id)} />
                  <CodeChip code={c.owner.code} />
                </>
              ) : (
                <span className="text-subtle">—</span>
              )}
            </dd>
          </div>
          {c.terms ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Нөхцөл</dt>
              <dd className="whitespace-pre-line break-words text-ink">{c.terms}</dd>
            </div>
          ) : null}
        </dl>

        <ul className="mt-3 space-y-1 text-xs text-muted">
          {c.submitted_at ? (
            <li>
              Илгээсэн: {who(names, c.submitted_by)} · {fmtDateTime(c.submitted_at)}
            </li>
          ) : null}
          {c.approved_at ? (
            <li className="text-emerald-700">
              Баталсан: {who(names, c.approved_by)} · {fmtDateTime(c.approved_at)}
              {c.approval_note ? ` · ${c.approval_note}` : ""}
            </li>
          ) : null}
          {c.status === "draft" && c.rejected_at ? (
            <li className="text-rose-700">
              Татгалзсан: {who(names, c.rejected_by)} · {fmtDateTime(c.rejected_at)}
              {c.rejection_note ? ` · ${c.rejection_note}` : ""}
            </li>
          ) : null}
          {c.terminated_at ? (
            <li className="text-rose-700">
              Цуцалсан: {who(names, c.terminated_by)} · {fmtDateTime(c.terminated_at)}
              {c.termination_reason ? ` · ${c.termination_reason}` : ""}
            </li>
          ) : null}
          {c.activate_on_start && c.status === "active" ? (
            <li className="text-sky-700">Эхлэх өдөр нь хөрөнгө автоматаар идэвхжинэ.</li>
          ) : null}
        </ul>

        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Paperclip className="size-3.5" aria-hidden /> Файл ({c.files.length})
          </p>
          {c.files.length ? (
            <ul className="space-y-1">
              {c.files.map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-brand-700 hover:underline">
                      {f.file_name || "Файл"}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-muted">{f.file_name || "Файл"}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted">{fmtFileSize(f.size_bytes)}</span>
                  {actions.deleteFile ? (
                    <button
                      type="button"
                      onClick={() => setDeleteFile({ id: f.id, name: f.file_name || "Файл" })}
                      aria-label={`${f.file_name || "Файл"} устгах`}
                      className="ml-auto flex size-11 -my-1.5 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-subtle">Файл хавсаргаагүй.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {actions.edit ? (
            <Button type="button" size="touch" variant="outline" onClick={onEdit}>
              <Pencil className="size-4" aria-hidden /> Засах
            </Button>
          ) : null}
          {actions.upload ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={DOC_ACCEPT}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => void onFiles(e.target.files)}
              />
              <Button type="button" size="touch" variant="outline" disabled={!!uploading} onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" aria-hidden /> {uploading ? `Хуулж байна ${uploading}` : "Файл нэмэх"}
              </Button>
            </>
          ) : null}
          {actions.submit ? (
            <Button type="button" size="touch" onClick={() => setDialog("submit")}>
              <Send className="size-4" aria-hidden /> Батлуулахаар илгээх
            </Button>
          ) : null}
          {actions.approve ? (
            <Button
              type="button"
              size="touch"
              onClick={() => {
                setApproveNote("");
                setDialog("approve");
              }}
            >
              <Check className="size-4" aria-hidden /> Батлах
            </Button>
          ) : null}
          {actions.reject ? (
            <Button type="button" size="touch" variant="outline" onClick={() => setDialog("reject")}>
              <X className="size-4" aria-hidden /> Татгалзах
            </Button>
          ) : null}
          {actions.withdraw ? (
            <Button type="button" size="touch" variant="ghost" onClick={() => setDialog("withdraw")}>
              <Undo2 className="size-4" aria-hidden /> Буцааж авах
            </Button>
          ) : null}
          {actions.renew ? (
            <Button type="button" size="touch" variant="outline" onClick={() => setDialog("renew")}>
              <RefreshCw className="size-4" aria-hidden /> Сунгах
            </Button>
          ) : null}
          {actions.terminate ? (
            <Button type="button" size="touch" variant="ghost" className="text-rose-700" onClick={() => setDialog("terminate")}>
              <Ban className="size-4" aria-hidden /> Цуцлах
            </Button>
          ) : null}
          {actions.discard ? (
            <Button type="button" size="touch" variant="ghost" className="text-muted" onClick={() => setDialog("discard")}>
              <Trash2 className="size-4" aria-hidden /> Ноорог хаях
            </Button>
          ) : null}
        </div>
        {c.status === "pending" && !actions.approve ? (
          <p className="mt-2 text-xs text-muted">
            {approver
              ? "Та энэ гэрээ эсвэл хөрөнгөд оролцсон тул өөр батлагч батална (өөрийгөө батлах дүрэм)."
              : "Батлах эрхтэй хүн (менежер эсвэл хариуцагчийн багийн ахлагч) шийднэ."}
          </p>
        ) : null}
      </Card>

      <ConfirmDialog
        open={dialog === "submit"}
        onClose={close}
        title="Батлуулахаар илгээх үү?"
        description="Илгээсний дараа гэрээний агуулгыг засахгүй (буцааж аваад засна). Батлагч шалгаж батална."
        confirmLabel="Илгээх"
        onConfirm={async () => {
          const res = await submitBrokerage(c.id);
          return res.ok ? done("Батлуулахаар илгээлээ") : res.error;
        }}
      />
      <ConfirmDialog
        open={dialog === "withdraw"}
        onClose={close}
        title="Илгээснээ буцааж авах уу?"
        description="Гэрээ ноорог болж дахин засах боломжтой болно."
        confirmLabel="Буцааж авах"
        onConfirm={async () => {
          const res = await withdrawBrokerage(c.id);
          return res.ok ? done("Ноорог руу буцаалаа") : res.error;
        }}
      />
      <ConfirmDialog
        open={dialog === "approve"}
        onClose={close}
        title={`${c.number} гэрээ батлах`}
        description="Баталсан хүн, огноо хадгалагдана. Хөрөнгө ноорог бол нөхцөл бүрэн үед автоматаар идэвхжинэ."
        confirmLabel="Батлах"
        onConfirm={async () => {
          const res = await approveBrokerage({ contract_id: c.id, note: approveNote, expected_updated_at: c.updated_at });
          if (!res.ok) return res.error;
          const r = res.data;
          if (r.activate_on_start) return done("Гэрээ батлагдлаа", "Эхлэх өдөр нь хөрөнгө автоматаар идэвхжинэ.");
          if (r.property_missing?.length) {
            return done("Гэрээ батлагдлаа", `Хөрөнгийг идэвхжүүлэхэд дутуу: ${r.property_missing.map(missingItemLabel).join(", ")}.`);
          }
          return done("Гэрээ батлагдлаа", `Хөрөнгийн төлөв: ${PROPERTY_STATUS_LABEL[r.property_status] ?? r.property_status}.`);
        }}
      >
        <Field label="Тэмдэглэл (заавал биш)" htmlFor={`approve-${c.id}`}>
          <textarea
            id={`approve-${c.id}`}
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
      </ConfirmDialog>
      <ReasonDialog
        open={dialog === "reject"}
        onClose={close}
        title={`${c.number} гэрээнээс татгалзах`}
        description="Гэрээ ноорог руу буцаж, илгээгч засаад дахин илгээнэ."
        label="Татгалзсан шалтгаан"
        confirmLabel="Татгалзах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await rejectBrokerage(c.id, text);
          return res.ok ? done("Гэрээнээс татгалзлаа") : res.error;
        }}
      />
      <ReasonDialog
        open={dialog === "terminate"}
        onClose={close}
        title={`${c.number} гэрээ цуцлах`}
        description="Хугацаанаас өмнө цуцална. Өөр хүчинтэй гэрээ үлдээгүй бол хөрөнгө «Гэрээ дууссан» болж архивт шилжинэ (түүх хадгалагдана)."
        label="Цуцалсан шалтгаан"
        confirmLabel="Цуцлах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await terminateBrokerage(c.id, text);
          if (!res.ok) return res.error;
          return done("Гэрээ цуцлагдлаа", `Хөрөнгийн төлөв: ${PROPERTY_STATUS_LABEL[res.data.propertyStatus] ?? res.data.propertyStatus}.`);
        }}
      />
      <ReasonDialog
        open={dialog === "discard"}
        onClose={close}
        title="Ноорог гэрээг хаях"
        description="Ноорог түүхэнд «цуцлагдсан» болж үлдэнэ."
        textRequired={false}
        confirmLabel="Хаях"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await discardBrokerage(c.id, text);
          return res.ok ? done("Ноорог хаагдлаа") : res.error;
        }}
      />
      <ConfirmDialog
        open={dialog === "renew"}
        onClose={close}
        title={`${c.number} гэрээг сунгах`}
        description="Өмнөх гэрээтэй холбоотой шинэ ноорог хувилбар үүснэ (нөхцөл, эзэн, шимтгэл хуулагдана; дуусах огноо, файлаа шинээр оруулна)."
        confirmLabel="Сунгалт үүсгэх"
        onConfirm={async () => {
          const res = await renewBrokerage(c.id);
          return res.ok ? done("Сунгалтын ноорог үүслээ", "Дуусах огноо, файлаа оруулаад батлуулахаар илгээнэ.") : res.error;
        }}
      />
      <ConfirmDialog
        open={!!deleteFile}
        onClose={() => setDeleteFile(null)}
        title="Файл устгах уу?"
        description={deleteFile?.name}
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          if (!deleteFile) return null;
          const res = await deleteBrokerageFile(deleteFile.id);
          return res.ok ? done("Файл устгагдлаа") : res.error;
        }}
      />
    </li>
  );
}

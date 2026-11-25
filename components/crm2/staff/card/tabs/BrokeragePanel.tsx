"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, FilePlus2, FileText, Lock, Paperclip, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { BrokerageStatusBadge } from "@/components/crm2/ui/badges";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { discardBrokerage, invalidateBrokerage, renewBrokerage, terminateBrokerage } from "@/lib/crm2/actions/brokerage";
import { deleteBrokerageFile } from "@/lib/crm2/actions/media";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { fmtFileSize } from "@/lib/crm2/files";
import {
  BROKERAGE_FILE_KIND_LABEL,
  BROKERAGE_STATUS_LABEL,
  PROPERTY_STATUS_LABEL,
  type Crm2BrokerageFileKindKey,
} from "@/lib/crm2/labels";
import { formatCommission } from "@/lib/crm2/money";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { BrokerageItem } from "@/lib/crm2/queries/properties";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2StaffMember } from "@/lib/crm2/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ActivationReadiness } from "../contract/ActivationReadiness";
import { ContractSheet } from "../contract/ContractSheet";
import type { ActivationPanelState } from "../contract/contract-model";
import type { ContractContext } from "../contract/contract-types";
import { useCardSheet } from "../sheets/use-card-sheet";
import { brokerageActions, brokerageChain, brokerageEndInfo, renewableExpired } from "../logic";

/** «Гэрээ буруу: …» угтвартай цуцлалтын шалтгаанаас зөвхөн шалтгааныг. */
function invalidReason(c: Pick<BrokerageItem, "termination_reason">): string {
  return (c.termination_reason ?? "").replace(/^Гэрээ буруу:\s*/, "");
}

/**
 * «Зуучлалын гэрээ» таб (20261125000100 — батлах алхамгүй): хувилбарын гинж, гэрээ бүрийн төлөв,
 * огноо, хариуцагч, PDF (signed URL). Ноорог «Бүртгэх» нь ContractSheet (нэг дэлгэц: PMC тамгатай PDF,
 * дуусах огноо, тамганы тэмдэглэгээ). Бүртгэгдсэнд — «Гэрээ буруу» (батлагч, багийн ахлагч), цуцлах,
 * сунгах; мэдээлэл дутуу ноорог хөрөнгийн жагсаалт. Эцсийн шалгалт RPC дээр, алдааг нь харуулна.
 */
export function BrokeragePanel({
  panel,
  propertyId,
  officeId,
  contracts,
  canCreate,
  staff,
  settings,
  context,
  activation,
  limits,
  names,
  now,
}: {
  panel: Crm2Panel;
  propertyId: string;
  officeId: string;
  contracts: BrokerageItem[];
  canCreate: boolean;
  staff: Crm2StaffMember[];
  settings: Crm2Settings;
  /** ContractSheet-ийн өгөгдөл (серверт угсарсан); null бол цонх өөрөө ачаална. */
  context: ContractContext | null;
  activation: ActivationPanelState;
  limits: { maxDocMb: number; maxDocsPerContract: number };
  names: Record<string, string>;
  now: number;
}) {
  const searchParams = useSearchParams();
  const cardSheet = useCardSheet();
  const editableDraft = contracts.find((c) => c.status === "draft" && c.canEditDraft) ?? null;
  const [sheet, setSheet] = React.useState<{ contract: BrokerageItem | null } | null>(() =>
    searchParams?.get("sheet") === "contract" && (editableDraft || canCreate) ? { contract: editableDraft } : null
  );
  const chain = brokerageChain(contracts);
  const toRenew = renewableExpired(contracts);
  const live = contracts.some((c) => c.status === "draft" || c.status === "pending" || c.status === "active");
  const numberById = Object.fromEntries(contracts.map((c) => [c.id, c.number]));

  return (
    <div className="space-y-4">
      <ActivationReadiness propertyId={propertyId} state={activation} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted">
          PMC-ийн тамга, гарын үсэгтэй гэрээний PDF-ийг хавсаргаж бүртгэмэгц (батлуулахгүй), хөрөнгийн мэдээлэл бүрэн бол хөрөнгө
          идэвхтэй болно (дутуу бол нөхмөгц). Сунгалт нь өмнөх
          гэрээтэй холбоотой шинэ хувилбар.
        </p>
        {canCreate ? (
          <Button type="button" size="lg" className="w-full shrink-0 sm:w-auto" onClick={() => setSheet({ contract: null })}>
            <FilePlus2 className="size-4" aria-hidden /> Гэрээ бүртгэх
          </Button>
        ) : null}
      </div>

      {toRenew && !live ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {toRenew.number ? `${toRenew.number} гэрээ` : "Гэрээ"} дууссан. Шинэ хугацааны гэрээг доорх «Сунгах»-аар үүсгэнэ — өмнөх
          гэрээний хувилбартай холбогдоно; PMC тамгатай PDF-ээ шинээр оруулж бүртгэнэ.
        </p>
      ) : null}

      {chain.length > 1 ? (
        <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Гэрээний хувилбарууд">
          {chain.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1.5">
              {i > 0 ? <ArrowRight className="size-3.5 text-subtle" aria-hidden /> : null}
              <a href={`#brokerage-${c.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-2 py-1 hover:bg-surface-2 sm:min-h-0">
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
          Зуучлалын гэрээ бүртгэгдээгүй.
          {canCreate ? " «Гэрээ бүртгэх»-ээр PMC-ийн тамга, гарын үсэгтэй гэрээгээ скан хийж (нэг PDF) эсвэл PDF-ээр оруулна." : ""}
        </Card>
      ) : (
        <ul className="space-y-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              panel={panel}
              c={c}
              previousNumber={c.previous_id ? (numberById[c.previous_id] ?? null) : null}
              limits={limits}
              names={names}
              now={now}
              onRegister={() => setSheet({ contract: c })}
            />
          ))}
        </ul>
      )}

      {sheet ? (
        <ContractSheet
          propertyId={propertyId}
          officeId={officeId}
          contract={sheet.contract}
          settings={settings}
          staff={staff}
          context={context}
          panel={panel}
          onOpenSheet={(s, field) => {
            setSheet(null);
            cardSheet.open(s, field);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function who(names: Record<string, string>, id: string | null | undefined): string {
  return id ? (names[id] ?? "Ажилтан") : "—";
}

function ContractCard({
  panel,
  c,
  previousNumber,
  limits,
  names,
  now,
  onRegister,
}: {
  panel: Crm2Panel;
  c: BrokerageItem;
  previousNumber: string | null;
  limits: { maxDocMb: number; maxDocsPerContract: number };
  names: Record<string, string>;
  now: number;
  /** ContractSheet («Гэрээ бүртгэх») нээх. */
  onRegister: () => void;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const [dialog, setDialog] = React.useState<null | "discard" | "invalidate" | "terminate" | "renew">(null);
  const [deleteFile, setDeleteFile] = React.useState<{ id: string; name: string } | null>(null);
  const actions = brokerageActions(c, { fileCount: c.files.length, maxFiles: limits.maxDocsPerContract });
  const endInfo = c.status === "active" ? brokerageEndInfo(c.end_date, now) : null;
  const close = () => setDialog(null);
  const commission = formatCommission(c.commission_type, c.commission_value, c.commission_currency);

  const done = (msg: string, description?: string) => {
    toast.success(msg, description ? { description } : undefined);
    router.refresh();
    return null;
  };

  return (
    <li id={`brokerage-${c.id}`} className="scroll-mt-24">
      <Card className={cn("min-w-0 p-4", c.status === "active" && "border-emerald-200", c.invalidated_at && "border-rose-200")}>
        <div className="flex flex-wrap items-center gap-2">
          <CodeChip code={c.number} title={`Зуучлалын гэрээ ${c.number}`} />
          <Badge>{c.version}-р хувилбар</Badge>
          <BrokerageStatusBadge status={c.status} />
          {c.invalidated_at ? <Badge tone="rose">Гэрээ буруу</Badge> : null}
          {endInfo ? <Badge tone={endInfo.tone}>{endInfo.text}</Badge> : null}
          {previousNumber ? <span className="text-xs text-muted">Сунгалт: өмнөх {previousNumber}</span> : null}
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Хугацаа</dt>
            <dd className="text-ink tabular-nums">
              {c.start_date ? fmtIsoDate(c.start_date) : c.status === "draft" ? "бүртгэсэн өдрөөс" : "—"} –{" "}
              {c.end_date ? fmtIsoDate(c.end_date) : "—"}
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
          {/* Хуучин урсгалын талбар — утгатай үед л. */}
          {commission ? (
            <div>
              <dt className="text-xs text-muted">Шимтгэл</dt>
              <dd className="text-ink">
                {commission}
                {c.commission_note ? <span className="block text-xs text-muted">{c.commission_note}</span> : null}
              </dd>
            </div>
          ) : null}
          {c.terms ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Онцгой нөхцөл</dt>
              <dd className="whitespace-pre-line break-words text-ink">{c.terms}</dd>
            </div>
          ) : null}
          {c.signer_differs && c.signer_note ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Гарын үсэг зурагч (эзнээс өөр)</dt>
              <dd className="whitespace-pre-line break-words text-ink">{c.signer_note}</dd>
            </div>
          ) : null}
        </dl>

        <ul className="mt-3 space-y-1 text-xs text-muted">
          {c.registered_at ? (
            <li>
              Бүртгэсэн: {who(names, c.registered_by)} · {fmtDateTime(c.registered_at)}
            </li>
          ) : null}
          {c.registered_at && c.stamp_confirmed ? (
            <li className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> PMC тамга, гарын үсэгтэй (агент баталгаажуулсан)
            </li>
          ) : null}
          {c.registered_at && !c.stamp_confirmed ? (
            <li className="text-amber-800">Шинэ дүрмээр шилжүүлсэн — PDF-ийн тамга, гарын үсгийг шалгана уу.</li>
          ) : null}
          {c.approved_at && !c.registered_at ? (
            <li className="text-emerald-700">
              Баталсан (хуучин): {who(names, c.approved_by)} · {fmtDateTime(c.approved_at)}
              {c.approval_note ? ` · ${c.approval_note}` : ""}
            </li>
          ) : null}
          {c.status === "draft" && c.rejected_at ? (
            <li className="text-rose-700">
              Татгалзсан (хуучин): {who(names, c.rejected_by)} · {fmtDateTime(c.rejected_at)}
              {c.rejection_note ? ` · ${c.rejection_note}` : ""}
            </li>
          ) : null}
          {c.invalidated_at ? (
            <li className="flex items-start gap-1 font-semibold text-rose-700">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">
                Гэрээ буруу: {who(names, c.invalidated_by)} · {fmtDateTime(c.invalidated_at)}
                {invalidReason(c) ? ` · ${invalidReason(c)}` : ""}
              </span>
            </li>
          ) : c.terminated_at ? (
            <li className="text-rose-700">
              Цуцалсан: {who(names, c.terminated_by)} · {fmtDateTime(c.terminated_at)}
              {c.termination_reason ? ` · ${c.termination_reason}` : ""}
            </li>
          ) : null}
          {c.status === "draft" && actions.register ? (
            <li className="text-sky-800">PMC-ийн тамга, гарын үсэгтэй PDF-ээ хавсаргаад «Бүртгэх»-ийг дарна.</li>
          ) : null}
        </ul>

        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Paperclip className="size-3.5" aria-hidden /> Файл ({c.files.length})
          </p>
          {c.files.length ? (
            <ul className="space-y-1">
              {c.files.map((f) => {
                const kind = (f.kind ?? "contract") as Crm2BrokerageFileKindKey;
                const notPdf = kind === "contract" && (f.mime_type ?? "").toLowerCase() !== "application/pdf";
                return (
                  <li key={f.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                    {kind === "ownership" || kind === "id" ? (
                      <Lock className="size-4 shrink-0 text-muted" aria-label={BROKERAGE_FILE_KIND_LABEL[kind]} />
                    ) : (
                      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    )}
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-brand-700 hover:underline">
                        {f.file_name || "Файл"}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate text-muted">{f.file_name || "Файл"}</span>
                    )}
                    {notPdf ? (
                      <span className="shrink-0 rounded-md bg-amber-50 px-1.5 text-xs text-amber-900">Зураг — гэрээ биш</span>
                    ) : kind !== "contract" ? (
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 text-xs text-muted">{BROKERAGE_FILE_KIND_LABEL[kind] ?? kind}</span>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted">{fmtFileSize(f.size_bytes)}</span>
                    {actions.deleteFile ? (
                      <button
                        type="button"
                        onClick={() => setDeleteFile({ id: f.id, name: f.file_name || "Файл" })}
                        aria-label={`${f.file_name || "Файл"} устгах`}
                        className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-subtle">Файл хавсаргаагүй.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {actions.register ? (
            <Button type="button" size="touch" className="min-w-0 flex-1 sm:flex-none" onClick={onRegister}>
              <CheckCircle2 className="size-4" aria-hidden /> Бүртгэх
            </Button>
          ) : null}
          {actions.renew ? (
            <Button type="button" size="touch" variant="outline" onClick={() => setDialog("renew")}>
              <RefreshCw className="size-4" aria-hidden /> Сунгах
            </Button>
          ) : null}
          {actions.invalidate ? (
            <Button type="button" size="touch" variant="ghost" className="text-rose-700" onClick={() => setDialog("invalidate")}>
              <AlertTriangle className="size-4" aria-hidden /> Гэрээ буруу
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
      </Card>

      <ReasonDialog
        open={dialog === "invalidate"}
        onClose={close}
        title={`${c.number} гэрээ буруу`}
        description="Гэрээ хүчингүй болж, хөрөнгө ноорог руу буцна (зар нийтлэлээс буцна; түрээслэгдсэн, зарагдсан хөрөнгийн төлөв хэвээр). Агентад мэдэгдэнэ. Агент зөв PDF-ээр шинэ гэрээ бүртгэнэ."
        label="Юу буруу байна (агентад очно)"
        placeholder="Жишээ: тамга харагдахгүй, 2-р хуудас дутуу"
        maxLength={1900}
        confirmLabel="Гэрээ буруу"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await invalidateBrokerage(c.id, text);
          if (!res.ok) return res.error;
          logUiEvent({ event: "contract_invalidated", flow: "card", property_id: c.property_id, meta: { to_draft: res.data.propertyStatus === "draft" } });
          return done(
            "Гэрээ буруу гэж буцаагдлаа",
            `Хөрөнгийн төлөв: ${PROPERTY_STATUS_LABEL[res.data.propertyStatus] ?? res.data.propertyStatus}. Агентад мэдэгдэл очлоо.`
          );
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
        description="Өмнөх гэрээтэй холбоотой шинэ ноорог хувилбар үүснэ (эзэн хуулагдана). Шинэ гэрээний дуусах огноо, PMC тамгатай PDF-ээ шинээр оруулж бүртгэнэ."
        confirmLabel="Сунгалт үүсгэх"
        onConfirm={async () => {
          const res = await renewBrokerage(c.id);
          return res.ok ? done("Сунгалтын ноорог үүслээ", "PMC тамгатай PDF-ээ оруулаад «Бүртгэх»-ийг дарна.") : res.error;
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

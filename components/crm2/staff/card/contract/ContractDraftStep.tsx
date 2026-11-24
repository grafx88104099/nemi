"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronUp, RefreshCw, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { AgentPicker } from "@/components/crm2/staff/form/AgentPicker";
import { OwnerPendingNotice } from "@/components/crm2/staff/owner/OwnerPendingNotice";
import { OwnerPhoneField } from "@/components/crm2/staff/owner/OwnerPhoneField";
import { OwnerSourceChips } from "@/components/crm2/staff/owner/OwnerSourceChips";
import { OWNER_NAME_UNVERIFIED, draftFromPending, isFinal, type OwnerDraft } from "@/components/crm2/staff/owner/owner-model";
import type { CommissionPrefill } from "@/lib/crm2/commission-defaults";
import { updateContact } from "@/lib/crm2/actions/contacts";
import { COMMISSION_TYPE_LABEL, CURRENCY_LABEL } from "@/lib/crm2/labels";
import { fmtMNT } from "@/lib/format";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2StaffMember } from "@/lib/crm2/types";

import {
  isPrefilled,
  type ContractCommissionType,
  type ContractFieldErrors,
  type ContractForm,
  type ContractPrefillKey,
} from "./contract-model";
import type { ContractContext } from "./contract-types";
import { Chip, INPUT_CLASS, PREFILLED_CLASS, PrefillTag, SectionTitle, TEXTAREA_CLASS } from "./parts";

type Edit = <K extends keyof ContractForm>(key: K, value: ContractForm[K]) => void;

// ── Эзэн (хөрөнгөөс) ───────────────────────────────────────────────────────

/**
 * Эзэн хөрөнгөөс ирнэ (ноорогт DB хуулна). Байхгүй бол утсаар нь хөрөнгөд тавина (setPropertyOwner),
 * эх сурвалж дутуу бол энд сонгоно — гэрээ илгээхэд заавал.
 */
export function OwnerBlock({
  ctx,
  sources,
  panel,
  disabled,
  onChanged,
}: {
  ctx: ContractContext;
  sources: Record<string, string>;
  panel: Crm2Panel;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [resolving, setResolving] = React.useState(false);
  const [source, setSource] = React.useState<string | null>(null);
  const [sourceNote, setSourceNote] = React.useState("");
  const [savingSource, setSavingSource] = React.useState(false);
  const [sourceError, setSourceError] = React.useState<string | null>(null);
  const owner = ctx.owner;

  if (owner === "hidden") {
    return (
      <section className="space-y-2" aria-label="Эзэн">
        <SectionTitle>Эзэн</SectionTitle>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          Эзний мэдээллийг харах эрхгүй. Хөрөнгийн үүрэгт агент эзнийг бүртгэнэ.
        </p>
      </section>
    );
  }

  if (!owner) {
    const pending = ctx.ownerPending;
    return (
      <section className="space-y-2" aria-label="Эзэн">
        <SectionTitle>Эзэн</SectionTitle>
        {pending && !resolving ? (
          <OwnerPendingNotice pending={pending} onResolve={() => setResolving(true)} canResolve={ctx.canEditProperty} />
        ) : ctx.canEditProperty ? (
          <OwnerPhoneField
            idPrefix={`contract-${ctx.propertyId}`}
            mode="live"
            meId={ctx.meId}
            sources={sources}
            propertyId={ctx.propertyId}
            initial={pending ? draftFromPending(pending) : null}
            pendingStatus={pending?.status ?? null}
            flow="card"
            optional={false}
            disabled={disabled}
            onSaved={(res) => {
              if (isFinal(res.status)) {
                toast.success("Эзэн хөрөнгөд холбогдлоо");
                setResolving(false);
                onChanged();
              }
            }}
            onCancel={pending ? () => setResolving(false) : undefined}
          />
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Эзэн бүртгэгдээгүй — хөрөнгийн үүрэгт агент бүртгэнэ.</p>
        )}
      </section>
    );
  }

  async function saveSource() {
    if (!source || !owner || owner === "hidden") return;
    if (source === "other" && !sourceNote.trim()) {
      setSourceError("«Бусад» эх сурвалжийн тайлбарыг бичнэ үү");
      return;
    }
    setSavingSource(true);
    setSourceError(null);
    const res = await updateContact({ contact_id: owner.id, source, source_note: sourceNote || null });
    setSavingSource(false);
    if (!res.ok) {
      setSourceError(res.error);
      return;
    }
    toast.success("Эх сурвалж хадгалагдлаа");
    onChanged();
  }

  const paths = crm2Paths(panel);
  return (
    <section className="space-y-2" aria-label="Эзэн">
      <SectionTitle>Эзэн</SectionTitle>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-2">
        <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
        <Link href={paths.contact(owner.id)} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-brand-700 hover:underline">
          {owner.full_name}
        </Link>
        <span className="shrink-0 font-mono text-xs text-muted">{owner.code}</span>
      </div>
      {owner.name_unverified ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {OWNER_NAME_UNVERIFIED} — гэрээ илгээхийн өмнө{" "}
          <Link href={paths.contact(owner.id)} className="font-semibold underline">
            харилцагчийн картаас
          </Link>{" "}
          нэрийг засна уу.
        </p>
      ) : null}
      {owner.source ? (
        <p className="text-xs text-muted">Эх сурвалж: {sources[owner.source] ?? owner.source}</p>
      ) : (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-sm text-amber-900">Эзний эх сурвалж дутуу — гэрээ илгээхэд заавал.</p>
          <OwnerSourceChips
            idPrefix={`contract-src-${ctx.propertyId}`}
            sources={sources}
            value={source}
            guessed={false}
            note={sourceNote}
            noteError={sourceError && source === "other" ? sourceError : null}
            disabled={disabled || savingSource}
            onChange={setSource}
            onConfirm={() => undefined}
            onNoteChange={setSourceNote}
          />
          {sourceError && source !== "other" ? (
            <p role="alert" className="text-sm text-rose-700">
              {sourceError}
            </p>
          ) : null}
          <Button type="button" size="touch" disabled={!source || savingSource || disabled} onClick={() => void saveSource()}>
            {savingSource ? "Хадгалж байна…" : "Эх сурвалж хадгалах"}
          </Button>
        </div>
      )}
    </section>
  );
}

// ── Агент сонгох мөр ──────────────────────────────────────────────────────

function AgentRow({
  id,
  label,
  value,
  onChange,
  staff,
  meId,
  teamIds,
  highlight,
  readOnly,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  staff: Crm2StaffMember[];
  meId: string;
  teamIds: string[];
  highlight?: boolean;
  readOnly?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const name = staff.find((s) => s.profile_id === value)?.name ?? (value ? "(идэвхгүй)" : "Сонгоогүй");
  const shown = value === meId ? `Би · ${name}` : name;
  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="text-sm font-medium text-ink">
        {label}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-describedby={`${id}-label`}
        disabled={readOnly}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-left text-base text-ink disabled:opacity-70 sm:text-sm",
          highlight ? PREFILLED_CLASS : "border-line bg-surface"
        )}
      >
        <span className="min-w-0 truncate">{shown}</span>
        {readOnly ? null : open ? <ChevronUp className="size-4 shrink-0" aria-hidden /> : <ChevronDown className="size-4 shrink-0" aria-hidden />}
      </button>
      {highlight ? <p className="text-xs font-semibold text-amber-900">баталгаажаагүй · хадгалахад баталгаажна</p> : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {open && !readOnly ? (
        <div id={`${id}-list`} className="rounded-xl border border-line p-1">
          <AgentPicker
            value={value}
            onChange={(v) => {
              onChange(v);
              setOpen(false);
            }}
            staff={staff}
            meId={meId}
            teamIds={teamIds}
            label={label}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Алхам 1 ────────────────────────────────────────────────────────────────

export function ContractDraftStep({
  ctx,
  form,
  edit,
  onConfirm,
  onAutoNumber,
  errors,
  isNew,
  termMonths,
  onStartToday,
  onEndTerm,
  recalc,
  onRecalc,
  warning,
  signerInitial,
  onSignerChange,
  staff,
  sources,
  panel,
  disabled,
  onOwnerChanged,
}: {
  ctx: ContractContext;
  form: ContractForm;
  edit: Edit;
  onConfirm: (key: ContractPrefillKey) => void;
  onAutoNumber: (auto: boolean) => void;
  errors: ContractFieldErrors;
  isNew: boolean;
  termMonths: number;
  onStartToday: () => void;
  onEndTerm: () => void;
  recalc: CommissionPrefill | null;
  onRecalc: () => void;
  warning: string | null;
  signerInitial: OwnerDraft | null;
  onSignerChange: (d: OwnerDraft) => void;
  staff: Crm2StaffMember[];
  sources: Record<string, string>;
  panel: Crm2Panel;
  disabled?: boolean;
  onOwnerChanged: () => void;
}) {
  const ids = React.useId();
  const pre = (k: ContractPrefillKey) => isPrefilled(form, k);
  const agentUnconfirmed = !ctx.property.contract_agent_id || ctx.property.unconfirmed.includes("contract_agent_id");

  return (
    <div className="space-y-6">
      <OwnerBlock ctx={ctx} sources={sources} panel={panel} disabled={disabled} onChanged={onOwnerChanged} />

      {/* Гарын үсэг зурагч */}
      <section className="space-y-3" aria-label="Гарын үсэг зурагч">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="size-5 accent-brand-500"
            checked={form.signer_differs}
            disabled={disabled}
            onChange={(e) => edit("signer_differs", e.target.checked)}
          />
          Гэрээнд өөр хүн гарын үсэг зурна
        </label>
        {form.signer_differs ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-rel`} className="block text-sm font-medium text-ink">
                Эзэнтэй ямар холбоотой, ямар эрхээр (заавал)
              </label>
              <textarea
                id={`${ids}-rel`}
                rows={2}
                maxLength={400}
                value={form.signer_relation}
                disabled={disabled}
                placeholder="Жишээ: эхнэр нь, нотариатын итгэмжлэлээр"
                aria-invalid={!!errors.signer_note}
                aria-describedby={errors.signer_note ? `${ids}-rel-err` : undefined}
                onChange={(e) => edit("signer_relation", e.target.value)}
                className={TEXTAREA_CLASS}
              />
              {errors.signer_note ? (
                <p id={`${ids}-rel-err`} className="text-xs text-danger">
                  {errors.signer_note}
                </p>
              ) : null}
            </div>
            <OwnerPhoneField
              idPrefix={`${ids}-signer`}
              mode="draft"
              meId={ctx.meId}
              sources={{}}
              lastSource={null}
              propertyId={ctx.propertyId}
              initial={signerInitial}
              flow="card"
              label="Гарын үсэг зурагчийн утас"
              disabled={disabled}
              onChange={(c) => onSignerChange(c.draft)}
            />
          </div>
        ) : null}
      </section>

      {/* Дугаар */}
      <section className="space-y-2" aria-label="Гэрээний дугаар">
        <label htmlFor={`${ids}-no`} className="block text-sm font-medium text-ink">
          Гэрээний дугаар
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`${ids}-no`}
            value={form.autoNumber ? "" : form.number}
            onChange={(e) => edit("number", e.target.value)}
            maxLength={60}
            disabled={disabled || form.autoNumber}
            placeholder={form.autoNumber ? "Систем B### дугаар өгнө" : "Цаасан гэрээний дугаар"}
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={!!errors.number}
            aria-describedby={errors.number ? `${ids}-no-err` : undefined}
            className={INPUT_CLASS}
          />
          {isNew ? (
            <Chip on={form.autoNumber} disabled={disabled} onClick={() => onAutoNumber(!form.autoNumber)} className="shrink-0">
              Систем дугаар өгөх
            </Chip>
          ) : null}
        </div>
        {errors.number ? (
          <p id={`${ids}-no-err`} className="text-xs text-danger">
            {errors.number}
          </p>
        ) : null}
      </section>

      {/* Хугацаа */}
      <section className="space-y-3" aria-label="Гэрээний хугацаа">
        <SectionTitle>Хугацаа</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-start`} className="block text-sm font-medium text-ink">
              Эхлэх огноо
            </label>
            <input
              id={`${ids}-start`}
              type="date"
              value={form.start_date}
              disabled={disabled}
              onChange={(e) => edit("start_date", e.target.value)}
              className={cn(INPUT_CLASS, pre("start_date") && PREFILLED_CLASS)}
            />
            {pre("start_date") ? (
              <PrefillTag label="өнөөдөр · шалгана уу" onConfirm={() => onConfirm("start_date")} disabled={disabled} />
            ) : (
              <Chip onClick={onStartToday} disabled={disabled}>
                <CalendarDays className="size-4" aria-hidden /> Өнөөдөр
              </Chip>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-end`} className="block text-sm font-medium text-ink">
              Дуусах огноо
            </label>
            <input
              id={`${ids}-end`}
              type="date"
              value={form.end_date}
              min={form.start_date || undefined}
              disabled={disabled}
              aria-invalid={!!errors.end_date}
              aria-describedby={errors.end_date ? `${ids}-end-err` : undefined}
              onChange={(e) => edit("end_date", e.target.value)}
              className={cn(INPUT_CLASS, pre("end_date") && PREFILLED_CLASS)}
            />
            {errors.end_date ? (
              <p id={`${ids}-end-err`} className="text-xs text-danger">
                {errors.end_date}
              </p>
            ) : null}
            {pre("end_date") ? (
              <PrefillTag label={`${termMonths} сар · шалгана уу`} onConfirm={() => onConfirm("end_date")} disabled={disabled} />
            ) : (
              <Chip onClick={onEndTerm} disabled={disabled || !form.start_date}>
                +{termMonths} сар
              </Chip>
            )}
          </div>
        </div>
      </section>

      {/* Шимтгэл */}
      <section className="space-y-3" aria-label="Шимтгэл">
        <SectionTitle>Шимтгэл</SectionTitle>
        <div role="radiogroup" aria-label="Шимтгэлийн төрөл" className="flex flex-wrap gap-2">
          {(["percent", "fixed"] as ContractCommissionType[]).map((t) => (
            <Chip key={t} on={form.commission_type === t} disabled={disabled} onClick={() => edit("commission_type", t)}>
              {COMMISSION_TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
        <div className={cn("space-y-3 rounded-xl", pre("commission") && "border border-amber-300 bg-amber-50/60 p-3")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-cval`} className="block text-sm font-medium text-ink">
                {form.commission_type === "percent" ? "Шимтгэл (%)" : "Шимтгэлийн дүн"}
              </label>
              <input
                id={`${ids}-cval`}
                inputMode="decimal"
                enterKeyHint="next"
                autoComplete="off"
                value={form.commission_value}
                disabled={disabled}
                placeholder={form.commission_type === "percent" ? "3" : "1 500 000"}
                aria-invalid={!!errors.commission_value}
                aria-describedby={errors.commission_value ? `${ids}-cval-err` : undefined}
                onChange={(e) => edit("commission_value", e.target.value)}
                className={INPUT_CLASS}
              />
              {errors.commission_value ? (
                <p id={`${ids}-cval-err`} className="text-xs text-danger">
                  {errors.commission_value}
                </p>
              ) : null}
            </div>
            {form.commission_type === "fixed" ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink">Валют</p>
                <div className="flex gap-2">
                  {(["MNT", "USD"] as const).map((c) => (
                    <Chip key={c} on={form.commission_currency === c} disabled={disabled} onClick={() => edit("commission_currency", c)}>
                      {CURRENCY_LABEL[c]}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-cnote`} className="block text-sm font-medium text-ink">
              Шимтгэлийн тайлбар
            </label>
            <input
              id={`${ids}-cnote`}
              value={form.commission_note}
              maxLength={2000}
              disabled={disabled}
              enterKeyHint="next"
              onChange={(e) => edit("commission_note", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          {pre("commission") ? <PrefillTag onConfirm={() => onConfirm("commission")} disabled={disabled} /> : null}
        </div>
        {recalc ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 sm:flex-row sm:items-center">
            <p className="flex-1">
              Түрээсийн үнэ өөрчлөгдсөн — шимтгэл {fmtMNT(recalc.commission_value)} болох уу?
            </p>
            <Button type="button" size="touch" variant="outline" disabled={disabled} onClick={onRecalc}>
              <RefreshCw className="size-4" aria-hidden /> Дахин тооцох
            </Button>
          </div>
        ) : null}
        {warning ? (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warning}
          </p>
        ) : null}
      </section>

      {/* Онцгой нөхцөл */}
      <section className="space-y-2" aria-label="Онцгой нөхцөл">
        <label htmlFor={`${ids}-terms`} className="block text-sm font-bold text-ink">
          Онцгой нөхцөл
        </label>
        <textarea
          id={`${ids}-terms`}
          rows={3}
          maxLength={8000}
          value={form.terms}
          disabled={disabled || form.no_special_terms}
          placeholder={form.no_special_terms ? "Онцгой нөхцөлгүй" : "Гэрээнд тусгасан онцгой нөхцөл"}
          onChange={(e) => edit("terms", e.target.value)}
          className={TEXTAREA_CLASS}
        />
        <Chip on={form.no_special_terms} disabled={disabled} onClick={() => edit("no_special_terms", !form.no_special_terms)}>
          Онцгой нөхцөлгүй
        </Chip>
      </section>

      {/* Агентууд */}
      <section className="space-y-3" aria-label="Агент">
        <SectionTitle>Агент</SectionTitle>
        <AgentRow
          id={`${ids}-cagent`}
          label="Гэрээ байгуулсан агент"
          value={form.contract_agent_id}
          onChange={(v) => edit("contract_agent_id", v)}
          staff={staff}
          meId={ctx.meId}
          teamIds={ctx.teamIds}
          highlight={agentUnconfirmed && ctx.canEditProperty}
          readOnly={!ctx.canEditProperty || disabled}
          hint={ctx.canEditProperty ? undefined : "Хөрөнгө засах эрхтэн солино."}
        />
        <AgentRow
          id={`${ids}-resp`}
          label="Гэрээ хариуцсан агент"
          value={form.responsible_agent_id}
          onChange={(v) => edit("responsible_agent_id", v)}
          staff={staff}
          meId={ctx.meId}
          teamIds={ctx.teamIds}
          readOnly={disabled}
        />
      </section>
    </div>
  );
}

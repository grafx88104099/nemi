"use client";

import * as React from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { OwnerPendingNotice } from "@/components/crm2/staff/owner/OwnerPendingNotice";
import { OwnerPhoneField } from "@/components/crm2/staff/owner/OwnerPhoneField";
import { OwnerSourceChips } from "@/components/crm2/staff/owner/OwnerSourceChips";
import { OWNER_NAME_UNVERIFIED, draftFromPending, isFinal } from "@/components/crm2/staff/owner/owner-model";
import { updateContact } from "@/lib/crm2/actions/contacts";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";

import type { ContractContext } from "./contract-types";
import { SectionTitle } from "./parts";

/** Эзэн бүрэн (холбогдсон, эх сурвалжтай, нэр нь баталгаажсан) — гэрээний цонхонд нэг мөрөөр харуулна. */
export function ownerComplete(owner: ContractContext["owner"]): boolean {
  return !!owner && owner !== "hidden" && !!owner.source && !owner.name_unverified;
}

/** Эзний нэг мөр (бүрэн үед): нэр (харилцагчийн карт руу), код. */
export function OwnerLine({ ctx, panel }: { ctx: ContractContext; panel: Crm2Panel }) {
  const owner = ctx.owner;
  if (!owner || owner === "hidden") return null;
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
      <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="shrink-0 text-muted">Эзэн:</span>
      <Link
        href={crm2Paths(panel).contact(owner.id)}
        className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-brand-700 hover:underline"
      >
        {owner.full_name}
      </Link>
      <span className="shrink-0 font-mono text-xs text-muted">{owner.code}</span>
    </div>
  );
}

/**
 * Эзэн хөрөнгөөс ирнэ (бүртгэхэд DB гэрээнд хуулна). Байхгүй бол утсаар нь хөрөнгөд тавина
 * (OwnerPhoneField → setPropertyOwner), эх сурвалж дутуу бол энд сонгоно, нэр баталгаажаагүй бол
 * харилцагчийн картаас засна.
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
        {ctx.requireOwner ? <p className="text-xs text-muted">Гэрээ бүртгэхэд эзэн заавал.</p> : null}
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
      <OwnerLine ctx={ctx} panel={panel} />
      {owner.name_unverified ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {OWNER_NAME_UNVERIFIED} — гэрээ бүртгэхийн өмнө{" "}
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
          <p className="text-sm text-amber-900">Эзний эх сурвалж дутуу — сонгоод хадгална уу.</p>
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

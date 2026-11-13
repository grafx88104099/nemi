"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { setDealStage } from "@/lib/crm2/actions/deals";
import { DEAL_STAGE_LABEL } from "@/lib/crm2/labels";
import type { Crm2DealStage } from "@/lib/crm2/types";
import { dealStageOptions } from "@/components/crm2/staff/card/logic";

/**
 * Хэлцлийн шатыг гараар өөрчлөх (crm2_set_deal_stage). Цуцлах нь тусдаа үйлдэл;
 * баримт бүрдүүлэх, төлбөр хүлээх шат 2-р шатанд нээгдэнэ.
 */
export function StageDialog({
  open,
  onClose,
  dealId,
  current,
  hasScheduledShowing,
  hasShownShowing,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  current: Crm2DealStage;
  hasScheduledShowing: boolean;
  hasShownShowing: boolean;
}) {
  if (!open) return null;
  return (
    <Inner
      onClose={onClose}
      dealId={dealId}
      current={current}
      hasScheduledShowing={hasScheduledShowing}
      hasShownShowing={hasShownShowing}
    />
  );
}

function Inner({
  onClose,
  dealId,
  current,
  hasScheduledShowing,
  hasShownShowing,
}: {
  onClose: () => void;
  dealId: string;
  current: Crm2DealStage;
  hasScheduledShowing: boolean;
  hasShownShowing: boolean;
}) {
  const router = useRouter();
  const ids = React.useId();
  const options = dealStageOptions(current, { hasScheduledShowing, hasShownShowing });
  const [stage, setStage] = React.useState<Crm2DealStage | "">("");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const picked = options.find((o) => o.value === stage);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stage || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await setDealStage(dealId, stage, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Шат: ${DEAL_STAGE_LABEL[stage]}`);
      router.refresh();
      onClose();
    } catch (err) {
      console.error("StageDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title="Хэлцлийн шат өөрчлөх">
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Одоо: <span className="font-medium text-ink">{DEAL_STAGE_LABEL[current]}</span>. Хөрөнгийн төлөвт нөлөөлөхгүй.
        </p>
        <Field label="Шинэ шат" htmlFor={`${ids}-stage`} hint={picked?.hint ?? undefined}>
          <Select id={`${ids}-stage`} value={stage} onChange={(e) => setStage(e.target.value as Crm2DealStage)} required>
            <option value="">Сонгоно уу</option>
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
                {o.value === current ? " (одоогийн)" : o.hint ? ` — ${o.hint}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`}>
          <textarea
            id={`${ids}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" disabled={pending || !stage || !!picked?.disabled}>
            {pending ? "Түр хүлээнэ үү…" : "Хадгалах"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

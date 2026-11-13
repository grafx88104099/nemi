"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { setPropertyStatus } from "@/lib/crm2/actions/properties";
import { PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import type { Crm2PropertyStatus } from "@/lib/crm2/types";

import { propertyStatusOptions } from "./logic";

/**
 * Хөрөнгийн төлөв өөрчлөх (crm2_property_set_status). Батлагч бол шууд,
 * засварлагч бол батлах хүсэлт илгээгдэнэ. Идэвхжүүлэхээс бусад шилжилтэд шалтгаан заавал.
 * Хэлцлийн шатаас тусдаа — хэлцлүүдэд нөлөөлөхгүй.
 */
export function StatusChangeDialog({
  open,
  onClose,
  propertyId,
  current,
  approver,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  current: Crm2PropertyStatus;
  /** Батлагч (шууд өөрчилнө; өөрийгөө батлах дүрмийг DB шалгана). */
  approver: boolean;
}) {
  if (!open) return null;
  return <Inner onClose={onClose} propertyId={propertyId} current={current} approver={approver} />;
}

function Inner({
  onClose,
  propertyId,
  current,
  approver,
}: {
  onClose: () => void;
  propertyId: string;
  current: Crm2PropertyStatus;
  approver: boolean;
}) {
  const router = useRouter();
  const ids = React.useId();
  const options = propertyStatusOptions(current);
  const [to, setTo] = React.useState<Crm2PropertyStatus | "">("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const picked = options.find((o) => o.value === to);
  const needsReason = picked?.needsReason ?? true;
  const canSubmit = !!to && (!needsReason || reason.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await setPropertyStatus({ property_id: propertyId, status: to, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data === "pending") {
        toast.success("Хүсэлт илгээгдлээ", {
          description: `«${PROPERTY_STATUS_LABEL[to]}» болгох хүсэлтийг батлах эрхтэй хүн шийднэ.`,
        });
      } else {
        toast.success(`Төлөв: ${PROPERTY_STATUS_LABEL[to]}`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      console.error("StatusChangeDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title="Хөрөнгийн төлөв өөрчлөх">
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Одоо: <span className="font-medium text-ink">{PROPERTY_STATUS_LABEL[current]}</span>. Хэлцлүүдийн шат өөрчлөгдөхгүй.
        </p>
        <Field label="Шинэ төлөв" htmlFor={`${ids}-to`}>
          <Select id={`${ids}-to`} value={to} onChange={(e) => setTo(e.target.value as Crm2PropertyStatus)} required>
            <option value="">Сонгоно уу</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={needsReason ? "Шалтгаан" : "Шалтгаан (заавал биш)"} htmlFor={`${ids}-reason`} hint={`${reason.length}/2000`}>
          <textarea
            id={`${ids}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            required={needsReason}
            placeholder="Жишээ: эзэнтэй ярьж баталгаажуулсан, түрээслэгдсэн…"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
        {!approver ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Танд шууд өөрчлөх эрх байхгүй бол батлах эрхтэй хүнд хүсэлт илгээгдэнэ.
          </p>
        ) : null}
        {to === "active" ? (
          <p className="text-xs text-muted">
            Идэвхжүүлэхэд батлагдсан, хүчинтэй зуучлалын гэрээ ба заавал бөглөх талбарууд шаардлагатай.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" disabled={pending || !canSubmit}>
            {pending ? "Түр хүлээнэ үү…" : "Хадгалах"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

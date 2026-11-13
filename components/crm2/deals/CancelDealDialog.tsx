"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { cancelDeal } from "@/lib/crm2/actions/deals";

/**
 * Хэлцэл цуцлах (зөвхөн энэ хэлцэл — хөрөнгийн төлөв, бусад хэлцэл хэвээр).
 * Шалтгаан тохиргооны жагсаалтаас (deal.cancel_reasons), «Бусад» бол тайлбар заавал.
 * Амжилттай бол өөр Staff хөрөнгө санал болгох холбоосыг санал болгоно.
 */
export function CancelDealDialog({
  open,
  onClose,
  dealId,
  dealCode,
  reasons,
  offerHref,
  requirements = [],
  currentRequirementId = null,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealCode?: string | null;
  reasons: { value: string; label: string }[];
  /** «Өөр Staff санал болгох» — Staff жагсаалт ?offer_for=&origin= (харилцагч харагдахгүй бол null). */
  offerHref?: string | null;
  /** Харилцагчийн идэвхтэй шаардлагууд — цуцлах үеийн хувилбар нь хэлцэлд хадгалагдана. */
  requirements?: { value: string; label: string }[];
  currentRequirementId?: string | null;
}) {
  const router = useRouter();
  const ids = React.useId();
  // Одоогийн шаардлага жагсаалтад байхгүй (архивласан) бол «Холбохгүй» — DB хэлцлийн холбоосыг хэвээр үлдээнэ.
  const initialReq = currentRequirementId && requirements.some((r) => r.value === currentRequirementId) ? currentRequirementId : "";
  const [reqId, setReqId] = React.useState(initialReq);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setReqId(initialReq);
  }
  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title={dealCode ? `${dealCode} хэлцэл цуцлах` : "Хэлцэл цуцлах"}
      description="Зөвхөн энэ харилцагчийн хэлцэл цуцлагдана. Хөрөнгийн төлөв, бусад харилцагчийн хэлцэл өөрчлөгдөхгүй. Товлосон үзүүлэлт, нээлттэй ажил цуцлагдана."
      options={reasons}
      optionsLabel="Цуцалсан шалтгаан"
      label="Тайлбар"
      placeholder="Юу таараагүйг товч бичнэ үү (шаардлага шинэчлэхэд хэрэгтэй)"
      confirmLabel="Хэлцэл цуцлах"
      tone="danger"
      onSubmit={async ({ code, text }) => {
        if (!code) return "Цуцалсан шалтгааныг сонгоно уу.";
        const res = await cancelDeal({ deal_id: dealId, reason_code: code, reason: text, requirement_id: reqId || null });
        if (!res.ok) return res.error;
        toast.success("Хэлцэл цуцлагдлаа", {
          description: "Хөрөнгө ба бусад хэлцэл хэвээр. Харилцагчид өөр Staff хөрөнгө санал болгож болно.",
          action: offerHref ? { label: "Өөр Staff санал болгох", onClick: () => router.push(offerHref) } : undefined,
          durationMs: 10_000,
        });
        router.refresh();
        return null;
      }}
    >
      {requirements.length ? (
        <Field
          label="Шаардлага (заавал биш)"
          htmlFor={`${ids}-req`}
          hint="Цуцлах үеийн шаардлагын хувилбар хадгалагдаж, өөр хөрөнгө тааруулахад ашиглана."
        >
          <Select id={`${ids}-req`} value={reqId} onChange={(e) => setReqId(e.target.value)}>
            <option value="">Холбохгүй</option>
            {requirements.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </ReasonDialog>
  );
}

"use client";

import { CircleAlert } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Шилжих шалгуур хангагдаагүй үеийн диалог: DB guard-ын буцаасан дутуу
 * шаардлагуудыг жагсааж, юу хийхийг заана. Канбан болон карт доторх
 * шилжилт хоёул ижил мессеж авна.
 */
export function GateErrorDialog({
  open,
  missing,
  stageName,
  onClose,
}: {
  open: boolean;
  missing: string[];
  stageName?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Шилжих шалгуур хангагдаагүй"
      footer={
        <Button variant="outline" onClick={onClose}>
          Ойлголоо
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {stageName ? `«${stageName}» шат руу шилжихийн өмнө` : "Энэ шилжилтийн өмнө"} дараах шаардлагуудыг
        бүрдүүлнэ үү:
      </p>
      {missing.length === 0 ? (
        <p className="text-sm text-ink">Шаардлагын дэлгэрэнгүй ирсэнгүй. Хуудсыг шинэчлээд дахин оролдоно уу.</p>
      ) : null}
      <ul className="space-y-2">
        {missing.map((m) => (
          <li key={m} className="flex items-center gap-2 text-sm text-ink">
            <CircleAlert className="size-4 shrink-0 text-amber-600" />
            {m}
          </li>
        ))}
      </ul>
      {missing.length > 0 ? (
        <p className="mt-3 text-xs text-subtle">
          Дутуу зүйлийг бүртгэсний дараа шатыг дахин солино уу. Шаардлагыг картын «Шилжих шалгуур» хэсгээс харж болно.
        </p>
      ) : null}
    </Modal>
  );
}

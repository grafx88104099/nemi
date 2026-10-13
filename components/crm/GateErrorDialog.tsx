"use client";

import { CircleAlert } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Гейт хаагдсаны алдааны диалог (F-354): DB guard-ын буцаасан дутуу
 * шаардлагуудын жагсаалтыг үзүүлнэ — канбан drag болон карт доторх
 * шилжилт хоёул үүгээр нэг мессеж авна (F-352 «ижил босго»).
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
      title="Гейт хангагдаагүй"
      footer={
        <Button variant="outline" onClick={onClose}>
          Ойлголоо
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {stageName ? `«${stageName}» шат руу шилжихийн өмнө` : "Энэ шилжилтийн өмнө"} дараах шаардлагууд
        бүрдсэн байх ёстой (F-354):
      </p>
      <ul className="space-y-2">
        {missing.map((m) => (
          <li key={m} className="flex items-center gap-2 text-sm text-ink">
            <CircleAlert className="size-4 shrink-0 text-amber-600" />
            {m}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

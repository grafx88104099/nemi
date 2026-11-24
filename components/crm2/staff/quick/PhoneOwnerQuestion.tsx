"use client";

import * as React from "react";
import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/crm2/phone";

/**
 * Наасан бичвэрт олдсон дугаар: «Энэ дугаар эзнийх үү?» Зөвхөн «Тийм» дугаарыг эзний талбарт хуулна —
 * зарын бичвэрт ихэвчлэн зуучлагч эсвэл өөр хүний утас байдаг тул автоматаар хэзээ ч бөглөхгүй.
 * Дугаар ноорогт (нийтийн хэсэгт) хадгалагдахгүй.
 */
export function PhoneOwnerQuestion({
  phones,
  disabled,
  onYes,
  onDismiss,
}: {
  phones: string[];
  disabled?: boolean;
  onYes: (phone: string) => void;
  onDismiss: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  if (!phones.length || index >= phones.length) return null;
  const phone = phones[index];
  const last = index === phones.length - 1;

  return (
    <div role="group" aria-label="Олдсон дугаар" className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
      <p className="flex items-center gap-2 text-sm text-sky-950">
        <Phone className="size-4 shrink-0" aria-hidden />
        <span>
          Энэ дугаар эзнийх үү? <span className="font-semibold tabular-nums">{formatPhone(phone)}</span>
          {phones.length > 1 ? <span className="text-sky-800"> ({index + 1}/{phones.length})</span> : null}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="md" disabled={disabled} onClick={() => onYes(phone)}>
          Тийм
        </Button>
        <Button
          type="button"
          size="md"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (last) onDismiss();
            else setIndex((i) => i + 1);
          }}
        >
          {last ? "Үгүй" : "Үгүй, дараагийнх"}
        </Button>
      </div>
    </div>
  );
}

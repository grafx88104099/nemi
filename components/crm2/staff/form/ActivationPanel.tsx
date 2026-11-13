import { CircleCheck, ListChecks } from "lucide-react";

import { missingItemLabel } from "@/lib/crm2/labels";
import type { Crm2ActivationCheck, Crm2PropertyStatus } from "@/lib/crm2/types";

/** «үнэ» → «Үнэ». */
function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * crm2_property_activation_check-ийн дутуу зүйлсийг энгийн үгээр: ноорог хөрөнгө
 * Staff-д идэвхтэй болохын тулд юу дутууг жагсаана. Гэрээ батлагдахад хөрөнгө
 * автоматаар идэвхжинэ (бусад нөхцөл бүрдсэн бол).
 */
export function ActivationPanel({
  status,
  activation,
}: {
  status: Crm2PropertyStatus;
  activation: Crm2ActivationCheck | null;
}) {
  if (!activation) return null;
  const missing = activation.missing.filter((m) => m !== "brokerage_contract");
  const needsContract = !activation.has_valid_contract;

  if (activation.ok) {
    if (status !== "draft") return null;
    return (
      <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Идэвхжүүлэх нөхцөл бүрдсэн. Хөрөнгийн картаас төлвийг «Идэвхтэй» болгоно.</p>
      </div>
    );
  }

  // Идэвхтэй хөрөнгөнд зөвхөн талбарын дутууг (гэрээ нь өдөр тутмын шалгалтаар).
  if (status === "active" && missing.length === 0) return null;

  return (
    <section
      aria-label="Идэвхжүүлэх нөхцөл"
      className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:p-4"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <ListChecks className="size-4" aria-hidden />
        {status === "draft" ? "Staff-д идэвхжүүлэхэд дутуу" : "Дутуу мэдээлэл"}
      </h2>
      <ul className="list-inside list-disc space-y-0.5">
        {missing.map((m) => (
          <li key={m}>{capitalize(missingItemLabel(m))}</li>
        ))}
        {needsContract && status !== "active" ? <li>{capitalize(missingItemLabel("brokerage_contract"))}</li> : null}
      </ul>
      {needsContract && status === "draft" ? (
        <p className="text-xs text-amber-900">
          Зуучлалын гэрээг батлуулахаар илгээж, батлагч батлахад бусад нөхцөл бүрдсэн бол хөрөнгө автоматаар идэвхжинэ.
        </p>
      ) : null}
    </section>
  );
}

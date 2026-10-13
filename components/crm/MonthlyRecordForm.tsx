"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveMonthlyRecord } from "@/lib/actions/crm-monthly";
import type { MonthlyRecordRow } from "@/lib/queries-crm-rentals";

/**
 * Сарын менежментийн бүртгэлийн маягт — журмын 9.2-ын 17 талбар (F-555).
 * Autofill хэсэг readonly (cron бөглөнө — F-556); бөглөлт < 100% бол тухайн
 * сарын урамшууллын hold автомат (F-559).
 */

type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "bool" | "textarea";
  auto?: boolean;
};

/** DB-ийн crm_monthly_completeness-тэй ЯГ ижил 17 түлхүүр. */
export const MONTHLY_FIELDS: FieldDef[] = [
  { key: "unit", label: "Объект, тоот", kind: "text", auto: true },
  { key: "owner_name", label: "Өмчлөгч", kind: "text", auto: true },
  { key: "tenant_name", label: "Түрээслэгч", kind: "text", auto: true },
  { key: "monthly_rent", label: "Сарын түрээс (₮)", kind: "number", auto: true },
  { key: "service_fee", label: "Үйлчилгээний төлбөр (₮)", kind: "number", auto: true },
  { key: "payment_day", label: "Төлбөр төлөх өдөр", kind: "number", auto: true },
  { key: "rent_paid", label: "Түрээс төлөгдсөн эсэх", kind: "bool" },
  { key: "rent_paid_date", label: "Төлөгдсөн огноо", kind: "date" },
  { key: "utility_status", label: "Ашиглалтын/СӨХ-ийн төлбөрийн төлөв", kind: "text" },
  { key: "usage_issues", label: "Зориулалтын ашиглалтын асуудал", kind: "textarea" },
  { key: "complaints_repairs", label: "Гомдол ба засвар", kind: "textarea" },
  { key: "actions_taken", label: "Авсан арга хэмжээ", kind: "textarea" },
  { key: "agent_issues", label: "Агентад шилжүүлсэн асуудал", kind: "textarea" },
  { key: "owner_notified", label: "Өмчлөгчид мэдэгдсэн эсэх", kind: "bool" },
  { key: "crm_updated", label: "CRM шинэчилсэн эсэх", kind: "bool" },
  { key: "net_income", label: "Орж ирсэн цэвэр орлого (₮)", kind: "number" },
  { key: "bonus_approved", label: "Урамшуулал батлагдсан эсэх", kind: "bool" },
];

export function MonthlyRecordForm({
  record,
  canEdit,
  onSaved,
}: {
  record: MonthlyRecordRow;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ completeness: number; hold: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Record<string, unknown>>(
    () => ({ ...((record.data ?? {}) as Record<string, unknown>) })
  );

  function set(key: string, value: unknown) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await saveMonthlyRecord(record.id, data);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setResult({ completeness: res.completeness ?? 0, hold: res.hold ?? false });
      onSaved?.();
      router.refresh();
    });
  }

  const rentNotPaid = String(data.rent_paid) === "false";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {MONTHLY_FIELDS.map((f) => {
          const v = data[f.key];
          if (f.kind === "bool") {
            return (
              <Field key={f.key} label={f.label}>
                <Select
                  value={v == null ? "" : String(v)}
                  disabled={!canEdit}
                  onChange={(e) => set(f.key, e.target.value === "" ? null : e.target.value === "true")}
                >
                  <option value="">— Бөглөөгүй —</option>
                  <option value="true">Тийм</option>
                  <option value="false">Үгүй</option>
                </Select>
              </Field>
            );
          }
          const disabled = !canEdit || Boolean(f.auto) || (f.key === "rent_paid_date" && rentNotPaid);
          return (
            <Field
              key={f.key}
              label={f.label}
              hint={f.auto ? "Автомат (Д-14 cron бөглөнө)" : f.key === "rent_paid_date" && rentNotPaid ? "Төлөгдөөгүй — шаардлагагүй" : undefined}
            >
              <Input
                type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                value={v == null ? "" : String(v)}
                disabled={disabled}
                onChange={(e) =>
                  set(f.key, f.kind === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
                }
              />
            </Field>
          );
        })}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {result && (
        <p className={"text-sm " + (result.hold ? "text-amber-600" : "text-emerald-600")}>
          Хадгалагдлаа — бөглөлт {Math.round(result.completeness)}%.{" "}
          {result.hold
            ? "Бүртгэл дутуу тул тухайн сарын урамшуулал HOLD нөхцөлтэй (F-559)."
            : "Бүрэн — урамшууллын hold нөхцөл цуцлагдана (F-559)."}
        </p>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      )}
    </div>
  );
}

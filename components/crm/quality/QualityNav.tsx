import Link from "next/link";

import { cn } from "@/lib/utils";
import { canEditBudget, canSeeExecutive, canSeeKpi, canSeeQuality } from "@/lib/queries-crm-kpi";

/**
 * Чанар, хяналтын самбарын хэсгүүдийн дэд цэс (U6). Дүр бүрд зөвхөн
 * нээлттэй хэсэг харагдана; утсанд хэвтээ гүйлгэнэ.
 */
export function QualityNav({ roles, active }: { roles: readonly string[]; active: string }) {
  const items = [
    ...(canSeeQuality(roles) ? [{ key: "audits", label: "Чанарын аудит", href: "/office/crm/quality" }] : []),
    ...(canSeeQuality(roles) ? [{ key: "data", label: "Өгөгдлийн чанар", href: "/office/crm/quality?tab=data" }] : []),
    ...(canSeeKpi(roles) ? [{ key: "kpi", label: "KPI, хөрвөлт", href: "/office/crm/quality/kpi" }] : []),
    ...(canSeeExecutive(roles)
      ? [{ key: "executive", label: "Төсөв, гүйцэтгэл", href: "/office/crm/quality/executive" }]
      : []),
    ...(canEditBudget(roles) || roles.some((r) => r === "ops_qc" || r === "marketing" || r === "sysadmin")
      ? [{ key: "settings", label: "Төсөв, жишиг тохируулах", href: "/office/crm/settings/budget" }]
      : []),
  ];
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line print:hidden" aria-label="Хяналтын хэсгүүд">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
            active === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Огнооны хүрээний шүүлт — JS-гүй ажиллах GET маягт. */
export function RangeFilter({
  action,
  from,
  to,
  extra,
}: {
  action: string;
  from: string;
  to: string;
  extra?: Record<string, string>;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-2 print:hidden">
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="text-xs text-muted">
        Эхлэх
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="mt-1 block h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </label>
      <label className="text-xs text-muted">
        Дуусах
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="mt-1 block h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        className="h-10 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2"
      >
        Харах
      </button>
    </form>
  );
}

export function UnavailableNotice() {
  return (
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Энэ хэсгийн тооцоолол хараахан идэвхжээгүй байна. Системийн админд хандана уу.
    </p>
  );
}

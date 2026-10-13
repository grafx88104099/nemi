"use client";

import { CheckCircle2, CircleAlert, FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * F-451: үүргийн нотолгооны снапшот (crm_commission_records.evidence) —
 * CRM-ээс автомат цугларсан бүрдлийн төлөвийг харуулна.
 * Түлхүүр бүрд монгол label; танигдаагүй түлхүүр generic мөрөөр.
 */

const KEY_LABEL: Record<string, string> = {
  policy: "Журмын код",
  txn_number: "Хэлцлийн дугаар",
  role_record_id: "Үүргийн бүртгэлийн мөр",
  rate_full_pct: "Журмын бүрэн хувь",
  split_pct: "Хуваарилалт (F-458)",
  threshold_above: "Үнийн босго давсан (F-456)",
  verified_income_mnt: "Санхүү баталгаажуулсан орлого (₮)",
  tax_pct: "Татварын хувь (F-455)",
  verified_payment_ids: "Баталгаажсан төлбөрүүд",
  co_brokerage: "Хамтын зуучлалын туг (F-468)",
  variant: "Олон улсын хувилбар (F-467)",
  merged_roles: "Нэгтгэсэн үүргүүд",
  dropped_roles: "Давхарлагдаагүй үүргүүд (F-457)",
  supplement: "Нэмэлт тооцоо (F-464)",
  prev_amount: "Өмнө тооцогдсон дүн",
  replacement: "Дахин түрээслүүлэлт — 0₮ (F-414)",
  missing_split: "Хуваарилалт дутуу (F-458)",
  monthly_record_id: "Сарын бүртгэлийн мөр",
  month: "Тайлант сар",
  net_income: "Цэвэр орлого (₮)",
  ratio_pct: "PM харьцаа (F-466)",
  rate_override: "Стандартаас зөрсөн хувь (F-411)",
};

const VARIANT_LABEL: Record<string, string> = {
  intl_lead_gen: "Сэжим үүсгэгч",
  deal_manager: "Хэлцлийн менежер",
  full_cycle: "Бүрэн мөчлөг",
};

function fmt(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key === "variant" && typeof value === "string") return VARIANT_LABEL[value] ?? value;
  if (typeof value === "boolean") return value ? "Тийм" : "Үгүй";
  if (Array.isArray(value)) return value.length ? `${value.length} бүртгэл` : "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EvidencePanel({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence ?? {});
  const missing = entries.filter(([k, v]) => k === "missing_split" && v === true).length > 0;

  if (!entries.length) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        Нотолгооны снапшот хоосон — тооцоо гараар/хуучин өгөгдлөөс үүссэн байж болно (F-451).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileSearch className="size-4 text-muted" />
        <span className="text-sm font-semibold text-ink">Нотолгооны бүрдэл (F-451)</span>
        {missing ? (
          <Badge tone="rose">
            <CircleAlert /> Дутуу
          </Badge>
        ) : (
          <Badge tone="green">
            <CheckCircle2 /> Бүрэн
          </Badge>
        )}
      </div>
      <dl className="divide-y divide-line rounded-xl border border-line">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
            <dt className={key === "missing_split" ? "text-rose-600" : "text-muted"}>
              {KEY_LABEL[key] ?? key}
            </dt>
            <dd className="text-right font-medium text-ink">{fmt(key, value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

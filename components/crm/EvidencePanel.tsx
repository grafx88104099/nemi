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
  split_pct: "Хуваарилалт",
  threshold_above: "Үнийн босго давсан",
  verified_income_mnt: "Санхүү баталгаажуулсан орлого (₮)",
  tax_pct: "Татварын хувь",
  verified_payment_ids: "Баталгаажсан төлбөрүүд",
  co_brokerage: "Хамтын зуучлалын туг",
  variant: "Олон улсын хувилбар",
  merged_roles: "Нэгтгэсэн үүргүүд",
  dropped_roles: "Давхарлагдаагүй үүргүүд",
  supplement: "Нэмэлт тооцоо",
  prev_amount: "Өмнө тооцогдсон дүн",
  replacement: "Дахин түрээслүүлэлт — 0₮",
  missing_split: "Хуваарилалт дутуу",
  monthly_record_id: "Сарын бүртгэлийн мөр",
  month: "Тайлант сар",
  net_income: "Цэвэр орлого (₮)",
  ratio_pct: "PM харьцаа",
  rate_override: "Стандартаас зөрсөн хувь",
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
        Нотолгооны снапшот хоосон — тооцоо гараар/хуучин өгөгдлөөс үүссэн байж болно.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileSearch className="size-4 text-muted" />
        <span className="text-sm font-semibold text-ink">Нотолгооны бүрдэл</span>
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

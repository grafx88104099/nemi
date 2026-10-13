"use client";

import { History } from "lucide-react";

import type { AuditRow } from "@/lib/queries-crm-transactions";

/**
 * Аудитын мөр (F-417/473/709) — RLS: ops_qc/sysadmin/ceo/SD/finance л уншина;
 * эрхгүй дүрд эцэг нь хоосон rows дамжуулж, блок бүхэлдээ нуугдана.
 */

const ACTION_LABEL: Record<string, string> = {
  insert: "Үүсгэсэн",
  update: "Зассан",
  status: "Төлөв солигдсон",
  stage: "Шат шилжсэн",
  correction: "Залруулга (F-417)",
  export: "Экспорт",
  view_restricted: "Хязгаарлагдмал баримт үзсэн",
  view_aml_case: "AML кейс үзсэн",
  view_aml_cases: "AML жагсаалт үзсэн",
  hold_placed: "Hold тавьсан",
  hold_released: "Hold сулласан",
  party_added: "Тал нэмсэн",
  party_removed: "Тал хассан",
  agent_roles_set: "Үүргийн бүртгэл",
  contract_added: "Гэрээ бүртгэсэн",
  approval_granted: "Зөвшөөрөл баталсан",
};

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted">Аудитын бичлэг алга.</p>;
  }
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
          <History className="mt-0.5 size-4 shrink-0 text-subtle" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{ACTION_LABEL[r.action] ?? r.action}</span>
              {r.field && <span className="text-xs text-muted">({r.field})</span>}
              <span className="ml-auto text-xs text-subtle">
                {new Date(r.created_at).toLocaleString("mn-MN")}
              </span>
            </div>
            {(r.old_value != null || r.new_value != null) && (
              <p className="mt-1 break-all text-xs text-muted">
                {r.old_value != null && <>Хуучин: {fmtValue(r.old_value)} → </>}
                Шинэ: {fmtValue(r.new_value)}
              </p>
            )}
            {r.reason && <p className="mt-1 text-xs text-muted">Шалтгаан: {r.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

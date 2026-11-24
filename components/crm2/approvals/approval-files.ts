import { CRM2_DOCS_BUCKET, crm2Client, signedUrlMap } from "@/lib/crm2/server";

import type { ApproveFile } from "./ApproveBrokerageDialog";

/**
 * Батлах дэлгэц: илгээсэн гэрээнүүдийн файл (серверт, хэрэглэгчийн client). RLS ба storage policy
 * шүүнэ — өмчлөлийн баримт/иргэний үнэмлэх эрхгүй хүнд мөр ч, URL ч ирэхгүй. contract_id → файлууд.
 */
export async function pendingContractFiles(contractIds: readonly string[]): Promise<Record<string, ApproveFile[]>> {
  const ids = [...new Set(contractIds)].slice(0, 200);
  if (!ids.length) return {};
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_brokerage_files")
    .select("id, contract_id, storage_path, file_name, kind, created_at")
    .in("contract_id", ids)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("crm2 pendingContractFiles:", error.message);
    return {};
  }
  const rows = data ?? [];
  const urls = await signedUrlMap(
    supabase,
    CRM2_DOCS_BUCKET,
    rows.map((r) => r.storage_path)
  );
  const out: Record<string, ApproveFile[]> = {};
  for (const r of rows) {
    (out[r.contract_id] ??= []).push({ id: r.id, file_name: r.file_name, kind: r.kind, url: urls[r.storage_path] ?? null });
  }
  return out;
}

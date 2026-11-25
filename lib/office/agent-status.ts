/**
 * Оффисын «Идэвхгүй» / «Батлах» / «Дахин идэвхжүүлэх» — цэвэр туслах (unit тесттэй).
 * DB: office_set_agent_status() (20261125000200) агентын төлөв ба CRM-ийн эрхийг
 * (crm_staff.is_active) нэг транзакцид тааруулна.
 */

/** «Идэвхгүй» дарахад гарах баталгаажуулалт — юу алдагдахыг тодорхой бичнэ. */
export const DEACTIVATE_CONFIRM_TEXT = [
  "Энэ агентыг идэвхгүй болгох уу?",
  "",
  "• Нийтийн профайл нь харагдахаа болино",
  "• CRM-д нэвтрэх эрх хаагдана (CRM-ийн мэдэгдэл, сануулга ирэхгүй)",
  "• Багийн ахлагч бол ахлагч эрх, багийн чатаас хасагдана",
  "",
  "Дахин идэвхжүүлбэл CRM-ийн эрх сэргэнэ (ахлагчийг дахин томилно).",
].join("\n");

export type AgentCrmChange = "deactivated" | "restored" | "added" | "unchanged" | "none";

export function parseCrmChange(data: unknown): AgentCrmChange {
  const crm = (data as { crm?: unknown } | null | undefined)?.crm;
  return crm === "deactivated" || crm === "restored" || crm === "added" || crm === "unchanged" ? crm : "none";
}

/** Амжилтын toast. */
export function agentStatusToast(status: "active" | "rejected", crm: AgentCrmChange): string {
  if (status === "rejected") return crm === "deactivated" ? "Агент идэвхгүй боллоо — CRM-ийн эрх хаагдлаа" : "Агент идэвхгүй боллоо";
  if (crm === "restored") return "Агент идэвхжлээ — CRM-ийн эрх сэргэлээ";
  if (crm === "added") return "Агент идэвхжлээ — CRM-д нэмэгдлээ";
  return "Агент идэвхжлээ";
}

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * PostgREST: RPC схемийн кэшт алга (PGRST202) — 20261125000200 хараахан тавигдаагүй (код түрүүлж
 * deploy хийгдсэн). Дуудагч хуучин замаар (шууд update) ажиллаж, оффисын админыг хориглохгүй.
 */
export function isMissingRpc(err: DbError): boolean {
  return !!err && (err.code === "PGRST202" || /could not find the function/i.test(err.message ?? ""));
}

/** Хүснэгт алга (PGRST205 / 42P01) — миграц тавигдаагүй үед аудит алгасаж, үйлдлийг хориглохгүй. */
export function isMissingTable(err: DbError): boolean {
  return (
    !!err &&
    (err.code === "PGRST205" || err.code === "42P01" || /could not find the table|relation .* does not exist/i.test(err.message ?? ""))
  );
}

/** Хуучин замын (RPC-гүй) агентад очих мэдэгдэл — өмнөх төлөвөөр «батлах/татгалзах» ба «идэвхгүй/идэвхжүүлэх». */
export function legacyStatusNotice(
  prev: string | null | undefined,
  status: "active" | "rejected"
): { title: string; body: string } {
  if (status === "active") {
    return prev === "pending"
      ? { title: "Та баталгаажлаа", body: "Таны агентын бүртгэл идэвхжлээ." }
      : { title: "Бүртгэл дахин идэвхжлээ", body: "Оффисын админ таны агентын бүртгэлийг дахин идэвхжүүллээ." };
  }
  return prev === "pending"
    ? { title: "Хүсэлт татгалзагдсан", body: "Агентын хүсэлт татгалзагдлаа." }
    : { title: "Бүртгэл идэвхгүй боллоо", body: "Оффисын админ таны агентын бүртгэлийг идэвхгүй болголоо. Нийтийн профайл харагдахгүй." };
}

/** DB-ийн алдааг оффисын админд ойлгомжтой монгол текст болгоно. */
export function mapAgentStatusError(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "Төлөв өөрчилж чадсангүй. Дахин оролдоно уу.";
  if (/lock timeout|deadlock|could not obtain lock/i.test(m)) return "Систем завгүй байна — хэдэн секундын дараа дахин оролдоно уу.";
  if (/permission denied/i.test(m)) return "Танд энэ агентыг удирдах эрх алга.";
  if (/could not find the function|schema cache/i.test(m)) return "Систем шинэчлэгдэж байна — түр хүлээгээд дахин оролдоно уу.";
  // DB-ийн өөрийн монгол мессеж (хүлээлцэх хориг, эрх) — «CRM: » угтварыг арилгана.
  if (/[А-Яа-яЁёӨөҮү]/.test(m)) return m.replace(/^CRM:\s*/, "");
  return "Төлөв өөрчилж чадсангүй. Дахин оролдоно уу.";
}

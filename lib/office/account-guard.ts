/**
 * Оффисын админы нэвтрэлтийн хэрэгсэл (түр нууц үг, нэвтрэлт үүсгэх/хаах) — эрхийн цэвэр дүрэм.
 *
 * DB-ийн can_manage_agent-тай ижил: оффисын админ зөвхөн өөрийн оффисын агентыг, CRM-ийн
 * панелийн админ (crm_is_panel_admin) байж удирдана. Нэмэлт: өөр оффисын админ / системийн
 * админы бүртгэлд (агентын картаар) хүрэхгүй — зөвхөн платформын админ (өөрийнхөө картыг болно).
 */
export type AccountRole = "buyer" | "agent" | "office_admin" | "admin";

export type AccountGuardInput = {
  callerId: string;
  callerRole: AccountRole | null | undefined;
  callerOfficeId: string | null | undefined;
  /** crm_is_panel_admin() — оффисын админд л шаардлагатай. */
  callerPanelAdmin: boolean | null | undefined;
  agentOfficeId: string | null | undefined;
  targetProfileId: string | null | undefined;
  targetRole: AccountRole | null | undefined;
};

export type AccountGuardDecision = { ok: true } | { ok: false; error: "forbidden" };

export function decideAccountAccess(i: AccountGuardInput): AccountGuardDecision {
  const deny = { ok: false, error: "forbidden" } as const;
  if (i.callerRole === "admin") return { ok: true };
  if (i.callerRole !== "office_admin") return deny;
  if (i.callerPanelAdmin !== true) return deny;
  if (!i.callerOfficeId || i.agentOfficeId !== i.callerOfficeId) return deny;
  if (i.targetProfileId && i.targetProfileId !== i.callerId && (i.targetRole === "office_admin" || i.targetRole === "admin")) {
    return deny;
  }
  return { ok: true };
}

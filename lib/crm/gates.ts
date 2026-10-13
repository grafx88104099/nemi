/**
 * Гейт шалгагч (G0–G6, F-354/F-416) — цэвэр функц, DB-гүй.
 * DB талын crm_check_gate() (000400-д, security definer) эцсийн үнэн;
 * энэ толь нь UI-д гейтийн checklist урьдчилан үзүүлэх + unit тестийн бай.
 */

import { GATE_CHECKER_LABEL, type GateCheckerKind } from "@/lib/constants-crm";

export type GateRequirement = {
  checkerKind: GateCheckerKind;
  /** crm_gate_requirements.params — босго г.м. (docs_complete: {min_pct}). */
  params?: Record<string, unknown>;
};

/**
 * Шалгалтад орох объектын снапшот — дуудагч (query давхарга) бөглөнө.
 * Мэдэгдэхгүй (undefined) утгыг ДУТУУ гэж үзнэ (аюулгүй тал руу).
 */
export type GateSnapshot = {
  needProfileCompletePct?: number; // F-159 (0–100)
  ownerSet?: boolean;
  nextStepSet?: boolean; // next_step + next_step_date хоёул
  kycStatus?: "pending" | "verified" | "edd" | "suspended";
  docsCompletePct?: number; // F-409 (0–100)
  roleEvidenceOk?: boolean; // F-402/451 үүргийн бүртгэл
  paymentProofOk?: boolean; // Санхүү баталгаажуулсан орлого
  handoverDone?: boolean; // F-407 хүлээлцэх 100%
  listingAgreementActive?: boolean; // F-205
  offerRecorded?: boolean; // P-02 санал бүртгэгдсэн
  amlHold?: boolean; // идэвхтэй hold байгаа бол true
  postSaleTasksCreated?: boolean; // Д-09 багц үүссэн
};

export type GateCheckResult = {
  ok: boolean;
  /** Дутуу шаардлагуудын монгол жагсаалт — GateErrorDialog-т шууд үзүүлнэ. */
  missing: string[];
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Нэг шаардлага хангагдсан уу. */
export function checkRequirement(req: GateRequirement, s: GateSnapshot): boolean {
  const p = req.params ?? {};
  switch (req.checkerKind) {
    case "need_profile_complete":
      return num(s.needProfileCompletePct, 0) >= num(p.min_pct, 100);
    case "owner_set":
      return s.ownerSet === true;
    case "next_step_set":
      return s.nextStepSet === true;
    case "kyc_verified":
      return s.kycStatus === "verified";
    case "docs_complete":
      return num(s.docsCompletePct, 0) >= num(p.min_pct, 100);
    case "role_evidence":
      return s.roleEvidenceOk === true;
    case "payment_proof":
      return s.paymentProofOk === true;
    case "handover_done":
      return s.handoverDone === true;
    case "listing_agreement":
      return s.listingAgreementActive === true;
    case "offer_recorded":
      return s.offerRecorded === true;
    case "aml_not_held":
      return s.amlHold !== true; // мэдэгдэхгүй бол DB тал (definer) эцэслэнэ
    case "post_sale_tasks":
      return s.postSaleTasksCreated === true;
    default:
      return false; // үл мэдэх checker — аюулгүй тал руу (дутуу)
  }
}

/**
 * Гейтийн бүх идэвхтэй шаардлагыг снапшоттой тулгана.
 * missing — дутуу шаардлага бүрийн монгол нэр (F-354: «дутуу жагсаалт»).
 */
export function checkGate(reqs: GateRequirement[], snapshot: GateSnapshot): GateCheckResult {
  const missing: string[] = [];
  for (const req of reqs) {
    if (!checkRequirement(req, snapshot)) {
      missing.push(GATE_CHECKER_LABEL[req.checkerKind] ?? req.checkerKind);
    }
  }
  return { ok: missing.length === 0, missing };
}

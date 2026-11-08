/**
 * Шилжих шалгуурын шалгагч (§6.13, §6.14, §6.17) — цэвэр функц, DB-гүй.
 * DB талын crm_check_gate_rec() (security definer) эцсийн үнэн; энэ толь нь
 * UI-д шалгуурын жагсаалтыг урьдчилан харуулах + unit тестийн бай.
 */

import { GATE_CHECKER_LABEL, type GateCheckerKind } from "@/lib/constants-crm";

export type GateRequirement = {
  checkerKind: GateCheckerKind;
  /** crm_gate_requirements.params — босго г.м. (docs_complete: {min_pct}). */
  params?: Record<string, unknown>;
};

/**
 * Шалгалтад орох боломжийн снапшот — дуудагч (query давхарга) бөглөнө.
 * Мэдэгдэхгүй (undefined) утгыг ДУТУУ гэж үзнэ (аюулгүй тал руу).
 */
export type GateSnapshot = {
  needProfileCompletePct?: number; // §6.7 (0–100)
  ownerSet?: boolean;
  nextStepSet?: boolean; // дараагийн үйлдэл + огноо хоёул
  kycStatus?: "pending" | "verified" | "edd" | "suspended";
  docsCompletePct?: number; // хавтасны бүрдэл (0–100)
  roleEvidenceOk?: boolean; // оролцогчдын үүрэг бүртгэгдсэн
  paymentProofOk?: boolean; // Санхүү баталгаажуулсан орлого
  handoverDone?: boolean; // хүлээлцэх 100%
  listingAgreementActive?: boolean;
  offerRecorded?: boolean; // үнийн санал бүртгэгдсэн
  amlHold?: boolean; // идэвхтэй түгжээ байгаа бол true
  postSaleTasksCreated?: boolean; // борлуулалтын дараах багц үүссэн
  // PRO-001 v2.1 шатууд
  meaningfulContact?: boolean; // утга бүхий холболт (хариу авсан бүртгэл)
  matchSuggested?: boolean; // 1+ үл хөдлөх санал болгосон
  showingLogged?: boolean; // үзлэг хийгдэж бүртгэгдсэн
  interestConfirmed?: boolean; // харилцагч сонирхлоо баталгаажуулсан
  counterRecorded?: boolean; // сөрөг санал бүртгэгдсэн
  offerAccepted?: boolean; // харилцагч нөхцөлийг хүлээн зөвшөөрсөн (§6.16, §6.17)
  meetingScheduled?: boolean; // өмчлөгчтэй уулзалт товлогдсон
  priceAnalysisDone?: boolean; // зах зээлийн харьцуулалт, үнийн дүн шинжилгээ
  propertyActive?: boolean; // листинг «Идэвхтэй»
  showingOnProperty?: boolean; // шалгуур хангасан худалдан авагчийн үзлэг
};

export type GateCheckResult = {
  ok: boolean;
  /** Дутуу шаардлагуудын монгол жагсаалт — GateErrorDialog-т шууд үзүүлнэ. */
  missing: string[];
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Шаардлагын дэлгэцийн шошго (DB-ийн crm_check_gate_rec-тэй ижил). */
export function gateRequirementLabel(kind: string, params?: Record<string, unknown> | null): string {
  const base = GATE_CHECKER_LABEL[kind as GateCheckerKind];
  if (!base) return "Тодорхойгүй шаардлага";
  if (kind === "docs_complete") return `${base} ${num(params?.min_pct, 100)}%`;
  return base;
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
    case "meaningful_contact":
      return s.meaningfulContact === true;
    case "match_suggested":
      return s.matchSuggested === true;
    case "showing_logged":
      return s.showingLogged === true;
    case "interest_confirmed":
      return s.interestConfirmed === true;
    case "counter_recorded":
      return s.counterRecorded === true;
    case "offer_accepted":
      return s.offerAccepted === true;
    case "meeting_scheduled":
      return s.meetingScheduled === true;
    case "price_analysis":
      return s.priceAnalysisDone === true;
    case "property_active":
      return s.propertyActive === true;
    case "showing_on_property":
      return s.showingOnProperty === true;
    default:
      return false; // үл мэдэх шаардлага — аюулгүй тал руу (дутуу)
  }
}

/**
 * Шалгуурын бүх идэвхтэй шаардлагыг снапшоттой тулгана.
 * missing — дутуу шаардлага бүрийн монгол нэр.
 */
export function checkGate(reqs: GateRequirement[], snapshot: GateSnapshot): GateCheckResult {
  const missing: string[] = [];
  for (const req of reqs) {
    if (!checkRequirement(req, snapshot)) {
      missing.push(gateRequirementLabel(req.checkerKind, req.params));
    }
  }
  return { ok: missing.length === 0, missing };
}

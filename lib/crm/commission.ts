import type { CommissionRole } from "@/lib/constants-crm";

/**
 * Шимтгэлийн тооцооллын цэвэр хөдөлгүүр (U7 — F-450–474, DB-гүй, unit тестийн бай).
 *
 * Зарчим (F-452): хувь/босго/харьцаа НЬ КОДОНД БИШ — journal payload-оор
 * (crm_commission_config_versions.payload) ирнэ; энд зөвхөн дүрмийн логик:
 *  • босгын оператор > | >= (F-456)
 *  • олон үүргийн stacking on/off (F-457)
 *  • хамтарсан үүргийн split (F-458)
 *  • нийлбэрийн дээд хязгаар → түгжээ (F-459)
 *  • co-brokerage туг → стандарт selling хаагдана (F-468)
 *  • олон улсын 3 хувилбар давхардуулахгүй + агентын дээд хязгаар (F-467)
 *  • replacement → 0₮ (F-414)
 *  • хугацааны шатлал (F-465/502), сарын PM харьцаа (F-466)
 */

// ── Payload бүтэц (5 журмын нэгдсэн хэлбэр) ───────────────

export const COMMISSION_POLICY_CODES = [
  "PMC-SAL-POL-001",
  "PMC-SAL-BR-POL-001",
  "PMC-INT-SAL-POL-001",
  "PMC-RENT-POL-001",
  "PMC-PM-POL-001",
] as const;
export type CommissionPolicyCode = (typeof COMMISSION_POLICY_CODES)[number];

export const COMMISSION_POLICY_LABEL: Record<CommissionPolicyCode, string> = {
  "PMC-SAL-POL-001": "Худалдааны стандарт журам (4 үүрэг, босгоор ялгаатай хувь)",
  "PMC-SAL-BR-POL-001": "Хамтын зуучлалын журам (2 түвшний хуваарилалт)",
  "PMC-INT-SAL-POL-001": "Олон улсын худалдааны журам (3 хувилбар)",
  "PMC-RENT-POL-001": "Энгийн түрээсийн журам (5 үүрэг)",
  "PMC-PM-POL-001": "Менежментийн сарын хуваарилалтын журам",
};

export type ThresholdConfig = {
  amount: number;
  /** F-456: '>' = «-өөс дээш», '>=' = «ба түүнээс дээш» */
  op: ">" | ">=";
};

export type PolicyRoleConfig = {
  role: CommissionRole;
  /** Босгогүй журамд нэг хувь */
  rate_pct?: number;
  /** Босготой журамд: доогуур/дээгүүр хувь */
  rate_below_pct?: number;
  rate_above_pct?: number;
};

export type CommissionPolicyPayload = {
  threshold?: ThresholdConfig;
  /** F-457: нэг агент олон үүрэгт хувийг давхарлан тооцох эсэх */
  stacking?: boolean;
  /** F-459: бүх хүлээн авагчийн хувийн нийлбэрийн дээд хязгаар */
  total_cap_pct?: number;
  roles?: PolicyRoleConfig[];
  /** F-467 (PMC-INT-SAL-POL-001): 3 хувилбарын хувь */
  variants?: { intl_lead_gen?: number; deal_manager?: number; full_cycle?: number };
  /** F-467: агент талын нийт урамшууллын дээд хэмжээ */
  agent_total_cap_pct?: number;
  /** F-466 (PMC-PM-POL-001): цэвэр үйлчилгээний орлогоос авах харьцаа */
  pm_ratio_pct?: number;
};

/** Тохиргооны UI/тестийн жишиг бүтэц — БОДИТ хувь нь тохиргооноос (F-452). */
export const DEFAULT_POLICY_PAYLOADS: Record<CommissionPolicyCode, CommissionPolicyPayload> = {
  "PMC-SAL-POL-001": {
    threshold: { amount: 300_000_000, op: ">=" },
    stacking: true,
    total_cap_pct: 60,
    roles: [
      { role: "sourcing", rate_below_pct: 10, rate_above_pct: 8 },
      { role: "listing", rate_below_pct: 10, rate_above_pct: 8 },
      { role: "contract", rate_below_pct: 10, rate_above_pct: 8 },
      { role: "selling", rate_below_pct: 25, rate_above_pct: 20 },
    ],
  },
  "PMC-SAL-BR-POL-001": {
    threshold: { amount: 300_000_000, op: ">=" },
    stacking: true,
    total_cap_pct: 50,
    roles: [
      { role: "seller_side", rate_below_pct: 20, rate_above_pct: 15 },
      { role: "buyer_side", rate_below_pct: 20, rate_above_pct: 15 },
      { role: "photo", rate_below_pct: 5, rate_above_pct: 5 },
      { role: "contract", rate_below_pct: 5, rate_above_pct: 5 },
    ],
  },
  "PMC-INT-SAL-POL-001": {
    variants: { intl_lead_gen: 10, deal_manager: 20, full_cycle: 25 },
    agent_total_cap_pct: 25,
    total_cap_pct: 50,
  },
  "PMC-RENT-POL-001": {
    stacking: true,
    total_cap_pct: 70,
    roles: [
      { role: "sourcing", rate_pct: 10 },
      { role: "listing", rate_pct: 10 },
      { role: "photo", rate_pct: 5 },
      { role: "contract", rate_pct: 15 },
      { role: "selling", rate_pct: 30 },
    ],
  },
  "PMC-PM-POL-001": { pm_ratio_pct: 10 },
};

// ── Оролт/гаралт ──────────────────────────────────────────

export type RoleAssignment = {
  agentProfileId: string;
  role: CommissionRole;
  /** F-458: хамтарсан үүргийн бичгээр бүртгэсэн хуваарилалт (%) */
  splitPct?: number | null;
  /** Нотолгооны эх мөрийн id (crm_transaction_agent_roles.id) */
  refId?: string;
};

export type CalcFlags = {
  /** F-468: хамтын зуучлалын туг — стандарт selling хаагдана */
  coBrokerage?: boolean;
  /** F-414: дахин түрээслүүлэлт — хөлс 0₮, урамшуулал 0 */
  replacement?: boolean;
};

export type CalcRow = {
  agentProfileId: string;
  role: CommissionRole;
  appliedRatePct: number;
  baseAmount: number;
  amount: number;
  evidence: Record<string, unknown>;
};

export type CalcResult = {
  rows: CalcRow[];
  /** F-459: нийлбэр дээд хязгаараас хэтэрсэн → түгжигдэнэ */
  locked: boolean;
  /** Блоклогч алдаанууд (монголоор) */
  errors: string[];
  /** Мэдээллийн тэмдэглэл (блоклохгүй) */
  notes: string[];
  totalRatePct: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Хувийн нарийвчлал — numeric(7,4)-тэй нийцүүлж 4 орон. */
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** F-455: татварын дараах цэвэр суурь (татварын хувь санхүүгийн тохиргооноос). */
export function netBaseAmount(grossVerifiedIncome: number, taxPct: number): number {
  if (!Number.isFinite(grossVerifiedIncome) || grossVerifiedIncome <= 0) return 0;
  const pct = Number.isFinite(taxPct) && taxPct > 0 ? Math.min(taxPct, 100) : 0;
  return round2(grossVerifiedIncome * (1 - pct / 100));
}

/** F-456: босгын оператор — үнэ босгыг давсан эсэх. */
export function isAboveThreshold(price: number, threshold?: ThresholdConfig): boolean {
  if (!threshold || !Number.isFinite(threshold.amount)) return false;
  return threshold.op === ">=" ? price >= threshold.amount : price > threshold.amount;
}

function roleRate(cfg: PolicyRoleConfig, above: boolean): number {
  if (typeof cfg.rate_pct === "number") return cfg.rate_pct;
  const r = above ? cfg.rate_above_pct : cfg.rate_below_pct;
  return typeof r === "number" ? r : 0;
}

/** Хэлцлийн төрөл → журмын код (co-brokerage туг BR журам руу шилжүүлнэ). */
export function policyCodeForTxnType(
  txnType: string,
  opts?: { coBrokerage?: boolean }
): CommissionPolicyCode {
  switch (txnType) {
    case "sale":
      return opts?.coBrokerage ? "PMC-SAL-BR-POL-001" : "PMC-SAL-POL-001";
    case "international_sale":
      return "PMC-INT-SAL-POL-001";
    case "standard_rental":
    case "managed_rental":
    case "replacement":
    default:
      return "PMC-RENT-POL-001";
  }
}

// ── Гол тооцоолол (F-452–459, 467, 468, 414) ─────────────

export function calcCommission({
  policyCode,
  payload,
  assignments,
  baseAmount,
  price,
  flags,
}: {
  policyCode: string;
  payload: CommissionPolicyPayload;
  assignments: RoleAssignment[];
  /** F-455: татварын дараах, Санхүү баталгаажуулсан цэвэр орлого (хэсэгчилсэн байж болно — F-464) */
  baseAmount: number;
  /** Босгын харьцуулалтад хэрэглэх үнэ (хэлцлийн ₮ дүйцэл) */
  price: number;
  flags?: CalcFlags;
}): CalcResult {
  const errors: string[] = [];
  const notes: string[] = [];

  // F-414: дахин түрээслүүлэлт → бүх мөр 0.
  if (flags?.replacement) {
    const rows: CalcRow[] = assignments.map((a) => ({
      agentProfileId: a.agentProfileId,
      role: a.role,
      appliedRatePct: 0,
      baseAmount: 0,
      amount: 0,
      evidence: { replacement: true, role_record_id: a.refId ?? null },
    }));
    notes.push("Дахин түрээслүүлэлт: хөлс 0₮, урамшуулал 0 (F-414).");
    return { rows, locked: false, errors, notes, totalRatePct: 0 };
  }

  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    return { rows: [], locked: false, errors: ["Тооцооллын суурь дүн буруу (F-455)."], notes, totalRatePct: 0 };
  }

  // Олон улсын журам — 3 хувилбар (F-467).
  if (policyCode === "PMC-INT-SAL-POL-001" || payload.variants) {
    return calcInternational({ payload, assignments, baseAmount, errors, notes });
  }

  const above = isAboveThreshold(price, payload.threshold);
  const stacking = payload.stacking !== false; // default: давхарлана (тохиргоо шийднэ)
  const roleConfigs = new Map<string, PolicyRoleConfig>();
  for (const rc of payload.roles ?? []) roleConfigs.set(rc.role, rc);

  // F-468: co-brokerage туг → стандарт борлуулагчийн (selling) тооцоолол хаагдана.
  let effective = assignments;
  const hasCoBrokerRoles = assignments.some((a) => a.role === "seller_side" || a.role === "buyer_side");
  const coBrokerage = Boolean(flags?.coBrokerage) || hasCoBrokerRoles;
  if (coBrokerage) {
    const dropped = effective.filter((a) => a.role === "selling");
    if (dropped.length) {
      notes.push("Хамтын зуучлалын туг идэвхтэй: стандарт борлуулагчийн үүргийн тооцоолол хаагдав (F-468).");
    }
    effective = effective.filter((a) => a.role !== "selling");
  }

  // Үүрэг бүрээр бүлэглэж split шалгана (F-458).
  const byRole = new Map<string, RoleAssignment[]>();
  for (const a of effective) {
    if (!byRole.has(a.role)) byRole.set(a.role, []);
    byRole.get(a.role)!.push(a);
  }

  const rows: CalcRow[] = [];
  for (const [role, group] of byRole) {
    const cfg = roleConfigs.get(role);
    if (!cfg) {
      notes.push(`«${role}» үүрэг энэ журамд тохируулагдаагүй — 0 хувь (F-452).`);
      continue;
    }
    const fullRate = roleRate(cfg, above);
    const multi = group.length > 1;
    const missingSplit = multi && group.some((a) => a.splitPct == null);
    if (missingSplit) {
      errors.push(
        `«${role}» үүргийг ${group.length} агент хамтран гүйцэтгэсэн ч хуваарилалт бүртгэгдээгүй — «Хянасан» руу шилжихгүй (F-458).`
      );
    }
    for (const a of group) {
      const split = multi ? (a.splitPct ?? 100 / group.length) : (a.splitPct ?? 100);
      const applied = round4((fullRate * split) / 100);
      const amount = round2((baseAmount * applied) / 100);
      rows.push({
        agentProfileId: a.agentProfileId,
        role: a.role as CommissionRole,
        appliedRatePct: applied,
        baseAmount: round2(baseAmount),
        amount,
        evidence: {
          role_record_id: a.refId ?? null,
          rate_full_pct: fullRate,
          split_pct: multi || a.splitPct != null ? split : null,
          threshold_above: payload.threshold ? above : null,
          ...(missingSplit && a.splitPct == null ? { missing_split: true } : {}),
          ...(coBrokerage ? { co_brokerage: true } : {}),
        },
      });
    }
  }

  // F-457: stacking OFF → агент бүрд хамгийн өндөр дүнтэй ганц үүрэг үлдэнэ.
  let finalRows = rows;
  if (!stacking) {
    const byAgent = new Map<string, CalcRow[]>();
    for (const r of rows) {
      if (!byAgent.has(r.agentProfileId)) byAgent.set(r.agentProfileId, []);
      byAgent.get(r.agentProfileId)!.push(r);
    }
    finalRows = [];
    for (const [, agentRows] of byAgent) {
      if (agentRows.length === 1) {
        finalRows.push(agentRows[0]);
        continue;
      }
      const kept = agentRows.reduce((a, b) => (b.amount > a.amount ? b : a));
      const dropped = agentRows.filter((r) => r !== kept).map((r) => r.role);
      notes.push("Давхарлан тооцохгүй тохиргоотой: хамгийн өндөр хувьтай нэг үүрэг үлдэв (F-457).");
      finalRows.push({ ...kept, evidence: { ...kept.evidence, dropped_roles: dropped } });
    }
  }

  const totalRatePct = round4(finalRows.reduce((s, r) => s + r.appliedRatePct, 0));

  // F-459: нийлбэрийн шалгалт → түгжээ.
  let locked = false;
  if (typeof payload.total_cap_pct === "number" && totalRatePct > payload.total_cap_pct + 1e-9) {
    locked = true;
    errors.push(
      `Бүх хүлээн авагчийн хувийн нийлбэр (${totalRatePct}%) батлагдсан дээд хязгаараас (${payload.total_cap_pct}%) хэтэрлээ — тооцоо түгжигдэв (F-459).`
    );
  }

  return { rows: finalRows, locked, errors, notes, totalRatePct };
}

// ── Олон улсын журам (F-467) ──────────────────────────────

function calcInternational({
  payload,
  assignments,
  baseAmount,
  errors,
  notes,
}: {
  payload: CommissionPolicyPayload;
  assignments: RoleAssignment[];
  baseAmount: number;
  errors: string[];
  notes: string[];
}): CalcResult {
  const variants = payload.variants ?? {};
  const rows: CalcRow[] = [];
  const byAgent = new Map<string, RoleAssignment[]>();
  for (const a of assignments) {
    if (a.role !== "intl_lead_gen" && a.role !== "deal_manager") {
      notes.push(`«${a.role}» үүрэг олон улсын журмын хувилбарт хамаарахгүй — алгасав (F-467).`);
      continue;
    }
    if (!byAgent.has(a.agentProfileId)) byAgent.set(a.agentProfileId, []);
    byAgent.get(a.agentProfileId)!.push(a);
  }

  for (const [agentId, group] of byAgent) {
    const hasLead = group.some((a) => a.role === "intl_lead_gen");
    const hasMgr = group.some((a) => a.role === "deal_manager");
    let variant: "intl_lead_gen" | "deal_manager" | "full_cycle";
    let role: CommissionRole;
    if (hasLead && hasMgr) {
      // Бүрэн мөчлөг: хоёр хувилбарын хувийг ДАВХАРДУУЛАХГҮЙ (F-467) —
      // зөвхөн full_cycle хувь; тохируулагдаагүй бол алдаа.
      if (typeof variants.full_cycle !== "number") {
        errors.push(
          "Олон улсын журмын хувилбаруудыг давхардуулахыг хориглоно: бүрэн мөчлөгийн (full_cycle) хувь тохируулагдаагүй байна (F-467)."
        );
        continue;
      }
      variant = "full_cycle";
      role = "deal_manager";
    } else if (hasLead) {
      variant = "intl_lead_gen";
      role = "intl_lead_gen";
    } else {
      variant = "deal_manager";
      role = "deal_manager";
    }
    let rate = variants[variant];
    if (typeof rate !== "number") {
      errors.push(`Олон улсын журмын «${variant}» хувилбарын хувь тохируулагдаагүй байна (F-452/467).`);
      continue;
    }
    // F-467: агент талын нийт урамшуулал дээд хэмжээнээс хэтрэхгүй.
    if (typeof payload.agent_total_cap_pct === "number" && rate > payload.agent_total_cap_pct) {
      notes.push(
        `Агентын нийт урамшууллын дээд хэмжээ (${payload.agent_total_cap_pct}%) хэрэглэгдэв (F-467).`
      );
      rate = payload.agent_total_cap_pct;
    }
    rows.push({
      agentProfileId: agentId,
      role,
      appliedRatePct: rate,
      baseAmount: round2(baseAmount),
      amount: round2((baseAmount * rate) / 100),
      evidence: {
        variant,
        role_record_id: group[0]?.refId ?? null,
        ...(variant === "full_cycle" ? { merged_roles: ["intl_lead_gen", "deal_manager"] } : {}),
      },
    });
  }

  const totalRatePct = round4(rows.reduce((s, r) => s + r.appliedRatePct, 0));
  let locked = false;
  if (typeof payload.total_cap_pct === "number" && totalRatePct > payload.total_cap_pct + 1e-9) {
    locked = true;
    errors.push(
      `Хувийн нийлбэр (${totalRatePct}%) дээд хязгаараас (${payload.total_cap_pct}%) хэтэрлээ — түгжигдэв (F-459).`
    );
  }
  return { rows, locked, errors, notes, totalRatePct };
}

// ── Хугацааны шатлал (F-465/502) ──────────────────────────

export type LeaseFeeTier = { code: string; min_months: number; fee_pct?: number };

/**
 * Бүтэн сарын тоо — Postgres age() семантиктай ижил:
 * жил×12 + сар; өдрийн дугаар хүрээгүй бол 1 сар хасна.
 */
export function monthsBetween(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00Z`);
  const e = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return 0;
  let m = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  if (e.getUTCDate() < s.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * F-465/502: гэрээний хугацааг огнооноос ангилж шатлалын кодыг буцаана
 * (settings 'rental_fee_tiers' — DB-ийн crm_lease_duration_tier-тэй ижил дүрэм).
 */
export function classifyLeaseDuration(
  startIso: string,
  endIso: string,
  tiers: LeaseFeeTier[]
): string | null {
  const months = monthsBetween(startIso, endIso);
  let best: LeaseFeeTier | null = null;
  for (const t of tiers ?? []) {
    const min = Number.isFinite(t.min_months) ? t.min_months : 0;
    if (months >= min && (best === null || min > best.min_months)) best = { ...t, min_months: min };
  }
  return best?.code ?? null;
}

/** F-465: шатлалын хувиар хөлсний дүнг санал болгоно (сарын түрээс × хувь). */
export function suggestRentalFee(monthlyRent: number, tier: LeaseFeeTier | null): number {
  if (!tier || typeof tier.fee_pct !== "number" || monthlyRent <= 0) return 0;
  return round2((monthlyRent * tier.fee_pct) / 100);
}

// ── Сарын PM хуваарилалт (F-466) ──────────────────────────

/** Зөвхөн бодитоор орсон цэвэр үйлчилгээний орлогоос, тохиргоот харьцаагаар. */
export function calcMonthlyPmCommission(netIncome: number, ratioPct: number): number {
  if (!Number.isFinite(netIncome) || netIncome <= 0) return 0;
  if (!Number.isFinite(ratioPct) || ratioPct <= 0) return 0;
  return round2((netIncome * ratioPct) / 100);
}

// ── Хэсэгчилсэн орлогын нэмэлт тооцоо (F-464) ─────────────

export type ExistingCommissionSum = {
  agentProfileId: string | null;
  role: CommissionRole;
  amount: number;
  baseAmount: number;
};

/**
 * F-463/464: одоогийн зорилтот мөрүүдээс аль хэдийн тооцогдсон дүнг хасаж,
 * ҮЛДЭХ олголтын (нэмэлт) мөрүүдийг буцаана. Үлдэгдэл орж ирэхэд дахин
 * дуудагдаж автоматаар нэмэлт тооцоо үүсгэнэ.
 */
export function diffCommissionRows(target: CalcRow[], existing: ExistingCommissionSum[]): CalcRow[] {
  const sums = new Map<string, { amount: number; base: number }>();
  for (const e of existing) {
    const key = `${e.agentProfileId ?? ""}|${e.role}`;
    const cur = sums.get(key) ?? { amount: 0, base: 0 };
    cur.amount += e.amount;
    cur.base += e.baseAmount;
    sums.set(key, cur);
  }
  const out: CalcRow[] = [];
  for (const row of target) {
    const key = `${row.agentProfileId}|${row.role}`;
    const prev = sums.get(key) ?? { amount: 0, base: 0 };
    const deltaAmount = round2(row.amount - prev.amount);
    if (deltaAmount <= 0.005) continue;
    const deltaBase = Math.max(0, round2(row.baseAmount - prev.base));
    out.push({
      ...row,
      amount: deltaAmount,
      baseAmount: deltaBase,
      evidence: prev.amount > 0 ? { ...row.evidence, supplement: true, prev_amount: round2(prev.amount) } : row.evidence,
    });
  }
  return out;
}

import {
  activationMissing,
  autoActivates,
  brokerageEndDateError,
  buildChecklist,
  contractRegisterMissing,
  countContractFiles,
  isUnconfirmableKey,
  type ChecklistContract,
  type ChecklistInput,
  type ChecklistTarget,
  type ContractFileCounts,
  type UnconfirmableKey,
} from "@/lib/crm2/checklist";

/**
 * «Гэрээ бүртгэх» доод цонхны (ContractSheet) цэвэр загвар — клиент, сервер, тест.
 *
 * Гэрээ = PMC-ийн тамга, гарын үсэгтэй НЭГ PDF (20261125000100, батлах алхамгүй). Агент PDF-ээ
 * хавсаргаж (скан → нэг PDF, эсвэл PDF файл), дуусах огноог шалгаж, «PMC-ийн тамга, гарын үсэгтэй»-г
 * тэмдэглээд «Бүртгэх» дарна. Дугаарыг (B###) DB олгоно, эхлэх огноо = бүртгэсэн өдөр.
 * Эцсийн шалгалт DB дээр (crm2_brokerage_register → crm2_brokerage_missing); энд зөвхөн урьдчилан харуулна.
 */

export type { ContractFileCounts };

export type ContractForm = {
  /** Дуусах огноо (YYYY-MM-DD) — заавал; анхдагч нь өнөөдөр + brokerage.default_term_months − 1 хоног. */
  end_date: string;
  /** «PMC-ийн тамга, гарын үсэгтэй» (одоогийн PDF-д). */
  stamp_confirmed: boolean;
};

export type ContractPropertyLike = {
  contract_agent_id: string | null;
  unconfirmed: readonly string[] | null;
};

// ── Огноо ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD + N сар − 1 хоног (12 сар: 2026-11-13 → 2027-11-12). Сарын сүүлийн өдрийг хавчина. */
export function termEndDate(start: string, months: number): string | null {
  const m = ISO_DATE.exec(start);
  if (!m || !Number.isFinite(months) || months < 1) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const targetMonth = mo + Math.round(months);
  const ty = y + Math.floor(targetMonth / 12);
  const tm = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** Дуусах огнооны түргэн сонголт (сар): 6, 12, 24 ба оффисын анхдагч хугацаа — өсөхөөр, давхардалгүй, 60 сар хүртэл. */
export function endDateChips(termMonths: number): number[] {
  const out: number[] = [];
  for (const m of [6, 12, 24, Math.round(termMonths)]) {
    if (Number.isFinite(m) && m >= 1 && m <= 60 && !out.includes(m)) out.push(m);
  }
  return out.sort((a, b) => a - b);
}

// ── Анхны төлөв ───────────────────────────────────────────────────────────

/**
 * Маягтын анхны утга: ноорогт маргаашаас хойшхи дуусах огноо байвал түүнийг, эс бөгөөс
 * өнөөдөр + termMonths − 1 хоног. Тамганы тэмдэглэгээ үргэлж хоосон (PDF бүрт дахин тэмдэглэнэ).
 */
export function initialContractForm(opts: {
  contract: { end_date: string | null } | null;
  today: string;
  termMonths: number;
}): ContractForm {
  const { contract: c, today, termMonths } = opts;
  const end = c?.end_date && c.end_date > today ? c.end_date : (termEndDate(today, termMonths) ?? "");
  return { end_date: end, stamp_confirmed: false };
}

// ── Шалгалт ────────────────────────────────────────────────────────────────

export type ContractFieldErrors = Partial<Record<"end_date" | "stamp_confirmed", string>>;

export const STAMP_REQUIRED_TEXT = "PMC-ийн тамга, гарын үсэгтэйг баталгаажуулна уу.";

/** Бүртгэхийн өмнөх хатуу алдаа: дуусах огноо (өнөөдрөөс 5 жилийн дотор) ба тамганы тэмдэглэгээ. */
export function contractFormErrors(form: ContractForm, today: string): ContractFieldErrors {
  const e: ContractFieldErrors = {};
  const end = brokerageEndDateError(form.end_date, today);
  if (end) e.end_date = end;
  if (!form.stamp_confirmed) e.stamp_confirmed = STAMP_REQUIRED_TEXT;
  return e;
}

// ── Файл ───────────────────────────────────────────────────────────────────

type FileLike = { id?: string; kind: string | null; mime_type?: string | null };

/** Гэрээний файлын тоо: PDF гэрээ, PDF биш гэрээ (хуучин зураг), өмчлөл, бусад. */
export function fileCounts(files: readonly FileLike[] | null | undefined): ContractFileCounts {
  return countContractFiles(files);
}

const isContractKind = (f: FileLike) => (f.kind ?? "contract") === "contract";
const isPdf = (f: FileLike) => (f.mime_type ?? "").toLowerCase() === "application/pdf";

/** Гэрээний PDF (DB нэгээс олныг зөвшөөрөхгүй) — байхгүй бол null. */
export function contractPdf<T extends FileLike>(files: readonly T[] | null | undefined): T | null {
  return (files ?? []).find((f) => isContractKind(f) && isPdf(f)) ?? null;
}

/** Хуучин урсгалын гэрээний зураг (kind='contract', PDF биш) — устгатал бүртгэхгүй ('file_not_pdf'). */
export function legacyContractImages<T extends FileLike>(files: readonly T[] | null | undefined): T[] {
  return (files ?? []).filter((f) => isContractKind(f) && !isPdf(f));
}

/** Нэмэлт баримт (өмчлөл, иргэний үнэмлэх, бусад). */
export function extraDocs<T extends FileLike>(files: readonly T[] | null | undefined): T[] {
  return (files ?? []).filter((f) => !isContractKind(f));
}

// ── Гэрээ байгуулсан агент ─────────────────────────────────────────────────

/**
 * Агент гэрээ байгуулсан агентыг гараар сольсон бол хөрөнгөд бичих patch (баталгаажуулалттай);
 * солиогүй бол null — бүртгэх RPC өөрөө бөглөж/баталгаажуулна.
 */
export function contractAgentPatch(
  agentId: string | null | undefined,
  property: ContractPropertyLike
): { contract_agent_id: string; unconfirmed?: UnconfirmableKey[] } | null {
  if (!agentId || agentId === property.contract_agent_id) return null;
  const unconfirmed = property.unconfirmed ?? [];
  if (!unconfirmed.includes("contract_agent_id")) return { contract_agent_id: agentId };
  return {
    contract_agent_id: agentId,
    unconfirmed: unconfirmed.filter((k): k is UnconfirmableKey => k !== "contract_agent_id" && isUnconfirmableKey(k)),
  };
}

// ── Дутуу зүйлс ────────────────────────────────────────────────────────────

/**
 * Бүртгэхэд дутуу: contractRegisterMissing (≙ crm2_brokerage_missing, DB-ийн дарааллаар) + тамганы
 * тэмдэглэгээгүй бол 'stamp_unconfirmed' (RPC-тэй адил төгсгөлд). Маягтын хадгалаагүй дуусах огноог тусгана.
 */
export function contractMissing(
  input: ChecklistInput,
  form: ContractForm,
  opts: {
    status: ChecklistContract["status"];
    /** Гэрээний бодит эзэн (≙ coalesce(гэрээний эзэн, хөрөнгийн эзэн)) — effectiveContractOwner(). */
    owner: { id: string; nameUnverified: boolean; source: string | null } | null | "hidden";
    files: ContractFileCounts;
    /**
     * false — өмчлөлийн баримт (restricted) харах эрхгүй: RLS файлыг нуудаг тул тоо нь мэдэгдэхгүй, DB
     * (crm2_brokerage_missing) өөрөө шалгана — 'ownership_doc'-ийг дутуу гэж үзэхгүй.
     */
    ownershipKnown?: boolean;
  }
): string[] {
  const o = opts.owner;
  const owner = o && o !== "hidden" ? o : null;
  const contract: ChecklistContract = {
    status: opts.status,
    start_date: null,
    end_date: form.end_date || null,
    approved_at: null,
    registered_at: null,
    stamp_confirmed: form.stamp_confirmed,
    owner_contact_id: owner?.id ?? null,
    ownerNameUnverified: owner?.nameUnverified ?? false,
    ownerSource: owner?.source ?? null,
    pdfCount: opts.files.pdf,
    nonPdfContractCount: opts.files.nonPdf,
    ownershipFileCount: opts.ownershipKnown === false ? null : opts.files.ownership,
  };
  const out = contractRegisterMissing({ ...input, owner: o, contract });
  // Цонхонд огноог хоосолсон (анхдагч нь үргэлж бөглөгдсөн) — DB-ийн дарааллаар эхэнд.
  if (!form.end_date) out.unshift("end_date");
  if (!form.stamp_confirmed) out.push("stamp_unconfirmed");
  return out;
}

/**
 * Гэрээний бодит эзэн (≙ crm2_brokerage_missing: coalesce(гэрээний эзэн, хөрөнгийн эзэн)). Сунгалтын
 * ноорог өмнөх гэрээний эзнийг өвлөнө — хөрөнгийн одоогийн эзнээс өөр байж болно. Гэрээнд эзэн бичигдсэн
 * боловч RLS-ээр харагдахгүй бол 'hidden' (DB өөрөө шалгана).
 */
export function effectiveContractOwner<O extends { id: string }>(
  propertyOwner: O | null | "hidden",
  contract: { owner_contact_id: string | null; owner: O | null } | null
): { owner: O | null | "hidden"; fromContract: boolean } {
  if (!contract?.owner_contact_id) return { owner: propertyOwner, fromContract: false };
  const own = contract.owner && contract.owner.id === contract.owner_contact_id ? contract.owner : null;
  return { owner: own ?? "hidden", fromContract: true };
}

export type PropertyGap = { key: string; label: string; target: ChecklistTarget };

/**
 * crm2_brokerage_register-ийн бөглөх дүрэм: хоосон «гэрээ байгуулсан агент»-ыг бүртгэгчээр (би) бөглөх
 * эсэх — бүртгэгч оффисын идэвхтэй ажилтан, мөн «нэг агент олон үүрэг» зөвшөөрөгдсөн эсвэл бүртгэгч
 * листлэгч/зурагчин биш. Бөглөхгүй бол хоосон үлдэж хөрөнгө идэвхжихэд дутуу болно.
 */
export function registrantFillsContractAgent(
  property: { contract_agent_id: string | null; listing_agent_id: string | null; photo_agent_id: string | null },
  me: { id: string; isStaff: boolean },
  sameAgentMultiRole: boolean
): boolean {
  if (property.contract_agent_id || !me.isStaff) return false;
  return sameAgentMultiRole || (me.id !== property.listing_agent_id && me.id !== property.photo_agent_id);
}

/**
 * Хөрөнгө идэвхжихэд дутуу (crm2_property_missing − гэрээ). Бүртгэлийг саатуулахгүй — нөхмөгц DB
 * автоматаар идэвхжүүлнэ.
 *   registering (анхдагч) — ноорог бүртгэхийн өмнө: agentId = бүртгэхэд тавигдах гэрээ байгуулсан агент
 *     (сонгосон, одоогийн, эсвэл registrantFillsContractAgent бол би; null = хоосон үлдэнэ), бүртгэл
 *     түүнийг баталгаажуулна (unconfirmed-ээс хасна).
 *   registering = false — бүртгэгдсэн гэрээ: хөрөнгийн бодит утга (орлуулахгүй).
 */
export function propertyGaps(input: ChecklistInput, agentId: string | null, opts: { registering?: boolean } = {}): PropertyGap[] {
  const registering = opts.registering ?? true;
  const property = registering
    ? {
        ...input.property,
        contract_agent_id: agentId ?? input.property.contract_agent_id,
        unconfirmed: (input.property.unconfirmed ?? []).filter((k) => k !== "contract_agent_id"),
      }
    : input.property;
  const next: ChecklistInput = { ...input, property };
  const keys = activationMissing(next).filter((k) => k !== "brokerage_contract");
  if (!keys.length) return [];
  const items = new Map(buildChecklist(next).groups.flatMap((g) => g.items.map((i) => [i.key, i] as const)));
  return keys.map((key) => {
    const item = items.get(key);
    return { key, label: item?.label ?? key, target: item?.target ?? { sheet: "checklist", field: null } };
  });
}

// ── Хөрөнгийн идэвхжүүлэлт ─────────────────────────────────────────────────

export type ActivationPanelState = { kind: "hidden" } | { kind: "ready" } | { kind: "blocked"; missing: string[] };

/**
 * Бүртгэгдсэн (хүчинтэй) гэрээтэй ноорог хөрөнгө (эсвэл сунгалт бүртгэгдсэн «гэрээ дууссан» — autoActivates):
 * дутуу бол жагсаалт (нөхмөгц DB автоматаар идэвхжүүлнэ); бүрэн боловч идэвхжээгүй (ховор — автомат
 * идэвхжүүлэлт гацсан) бол «Идэвхжүүлэх».
 */
export function activationPanelState(opts: {
  propertyStatus: ChecklistInput["property"]["status"];
  hasActiveContract: boolean;
  check: { ok: boolean; missing: readonly string[] } | null;
  /** Хөрөнгийн status_changed_at ба хүчинтэй гэрээний registered_at («гэрээ дууссан» хөрөнгөд). */
  statusChangedAt?: string | null;
  activeRegisteredAt?: string | null;
}): ActivationPanelState {
  const auto = autoActivates(
    { status: opts.propertyStatus, status_changed_at: opts.statusChangedAt },
    opts.hasActiveContract ? { status: "active", registered_at: opts.activeRegisteredAt ?? null } : null
  );
  if (!auto || !opts.check) return { kind: "hidden" };
  if (!opts.check.ok) return { kind: "blocked", missing: [...opts.check.missing] };
  return { kind: "ready" };
}

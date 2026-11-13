import { HIDDEN_CONTACT_LABEL, TASK_KINDS } from "@/lib/crm2/labels";
import type { Crm2Paths } from "@/lib/crm2/paths";
import type { Crm2RequestKind, Crm2TaskKind } from "@/lib/crm2/types";

/**
 * Батлах дэлгэц (/…/crm/approvals): хүлээгдэж буй зүйлсийг хэсэгт хуваах, хүсэлтийн
 * объектын холбоос, шошго, хүсэлтэд хадгалсан дуудлагууд. Цэвэр модуль.
 */

type Decidable = { canDecide: boolean; mine?: boolean };

/**
 * toDecide — миний шийдвэрлэх (өөрийгөө батлах эрхтэй бол өөрийнх ч орно);
 * mine — миний гаргасан, өөр хүн шийдвэрлэх; others — харагдаж буй ч миний эрхэд биш.
 */
export function splitPending<T extends Decidable>(items: T[]): { toDecide: T[]; mine: T[]; others: T[] } {
  const toDecide: T[] = [];
  const mine: T[] = [];
  const others: T[] = [];
  for (const it of items) {
    if (it.canDecide) toDecide.push(it);
    else if (it.mine) mine.push(it);
    else others.push(it);
  }
  return { toDecide, mine, others };
}

type RequestTarget = {
  kind: Crm2RequestKind;
  target: {
    propertyId: string | null;
    contactId: string | null;
    dealId: string | null;
    /** Объектыг (RLS-ээр) харах эрхтэй эсэх; false бол холбоос нь хоосон хуудас руу хөтөлнө. */
    visible?: boolean;
  };
};

/**
 * Хүсэлтийн объект руу холбоос (хөрөнгийн карт, хэлцэл, харилцагчийн карт).
 * Харах эрхгүй хэлцэл → хөрөнгийн карт; харах эрхгүй харилцагч → холбоосгүй.
 */
export function requestTargetHref(req: RequestTarget, paths: Pick<Crm2Paths, "property" | "deal" | "contact">): string | null {
  const t = req.target;
  if (req.kind === "deal_transfer") {
    if (t.visible === false) return t.propertyId ? paths.property(t.propertyId) : null;
    if (t.dealId && t.propertyId) return paths.deal(t.propertyId, t.dealId);
  }
  if (req.kind === "contact_transfer") {
    if (t.visible === false) return null;
    if (t.contactId) return paths.contact(t.contactId);
  }
  if (t.propertyId) return paths.property(t.propertyId);
  return null;
}

// ── Хүсэлтэд хадгалсан дуудлага (payload.calls[]) ──────────────────────────

export type RequestCallOutcome =
  | { kind: "recorded"; dealId: string | null; dealCreated: boolean }
  | { kind: "skipped"; reason: string };

export type RequestCallView = {
  occurredAt: string;
  propertyId: string | null;
  /** null — хөрөнгийг харах эрхгүй (эсвэл id алга). */
  propertyCode: string | null;
  note: string | null;
  result: string | null;
  nextAction: Crm2TaskKind | null;
  nextActionDue: string | null;
  nextActionNote: string | null;
  loggedByName: string | null;
  /** Батлагдсаны дараа: бүртгэгдсэн эсвэл алгассан; хүлээгдэж буй үед null. */
  outcome: RequestCallOutcome | null;
};

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(o: Obj, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.trim() ? v : null;
}

const TASK_KIND_SET = new Set<string>(TASK_KINDS);

function rawCalls(payload: unknown): Obj[] {
  const calls = asObj(payload)?.calls;
  if (!Array.isArray(calls)) return [];
  return calls.map(asObj).filter((c): c is Obj => !!c);
}

/** Хадгалсан дуудлагуудын хөрөнгийн id (кодыг RLS-тэй уншихад). */
export function requestCallPropertyIds(payload: unknown): string[] {
  return [...new Set(rawCalls(payload).map((c) => str(c, "property_id")).filter((x): x is string => !!x))];
}

/**
 * payload.calls[]-ийг харуулах хэлбэрт (цагийн дарааллаар). Объект биш, цаггүй мөрийг
 * алгасна; next_action-ийг TASK_KINDS-оор шалгана.
 */
export function parseRequestCalls(
  payload: unknown,
  propCode: Map<string, string>,
  names: Record<string, string>
): RequestCallView[] {
  const out: RequestCallView[] = [];
  for (const c of rawCalls(payload)) {
    const occurredAt = str(c, "occurred_at");
    if (!occurredAt) continue;
    const propertyId = str(c, "property_id");
    const next = str(c, "next_action");
    const loggedBy = str(c, "logged_by");
    const rec = asObj(c.recorded);
    let outcome: RequestCallOutcome | null = null;
    if (rec) {
      const skipped = str(rec, "skipped");
      outcome = skipped
        ? { kind: "skipped", reason: skipped }
        : { kind: "recorded", dealId: str(rec, "deal_id"), dealCreated: rec.deal_created === true };
    }
    out.push({
      occurredAt,
      propertyId,
      propertyCode: propertyId ? (propCode.get(propertyId) ?? null) : null,
      note: str(c, "note"),
      result: str(c, "result"),
      nextAction: next && TASK_KIND_SET.has(next) ? (next as Crm2TaskKind) : null,
      nextActionDue: str(c, "next_action_due"),
      nextActionNote: str(c, "next_action_note"),
      loggedByName: loggedBy ? (names[loggedBy] ?? null) : null,
      outcome,
    });
  }
  return out.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

/** Батлагдсан хүсэлтийн дуудлагын үр дүнгийн тоо. */
export function requestCallCounts(calls: Pick<RequestCallView, "outcome">[]): { recorded: number; skipped: number } {
  let recorded = 0;
  let skipped = 0;
  for (const c of calls) {
    if (c.outcome?.kind === "recorded") recorded++;
    else if (c.outcome?.kind === "skipped") skipped++;
  }
  return { recorded, skipped };
}

// ── Хүсэлтийн объектын шошго ───────────────────────────────────────────────

export type RequestTargetLookup = {
  propCode: Map<string, string>;
  dealCode: Map<string, string>;
  /** Харах эрхтэй харилцагч: id → «C001 · Нэр». */
  contactLabel: Map<string, string>;
};

/**
 * Хүсэлтийн объектын шошго ба харагдах эсэх (RLS-ээр уншигдсан мөр = харагдана).
 * Хүсэгч ихэвчлэн шилжүүлэх харилцагч/хэлцлийг харж чадахгүй — тэр үед «харах эрхгүй»
 * гэж, хадгалсан эхний дуудлагын хөрөнгийн кодоор ялгана.
 */
export function requestTargetLabel(
  r: { kind: Crm2RequestKind; targetId: string; propertyId: string | null; calls?: Pick<RequestCallView, "propertyCode">[] },
  lookup: RequestTargetLookup
): { label: string; visible: boolean } {
  if (r.kind === "property_status") {
    const code = lookup.propCode.get(r.targetId);
    return { label: code ?? "Хөрөнгө", visible: true };
  }
  if (r.kind === "deal_transfer") {
    const pc = r.propertyId ? lookup.propCode.get(r.propertyId) : null;
    const dc = lookup.dealCode.get(r.targetId);
    return { label: [pc, dc ?? "Хэлцэл"].filter(Boolean).join(" · "), visible: !!dc };
  }
  const known = lookup.contactLabel.get(r.targetId);
  if (known) return { label: known, visible: true };
  const firstCode = (r.calls ?? []).find((c) => c.propertyCode)?.propertyCode ?? null;
  return { label: firstCode ? `${HIDDEN_CONTACT_LABEL} · ${firstCode}` : HIDDEN_CONTACT_LABEL, visible: false };
}

// ── Шийдвэрийн цонхны тайлбар ──────────────────────────────────────────────

/** Батлагдсаны дараах мэдэгдэл — алгассан дуудлага байвал тоог нь хэлнэ. */
export function approvedToast(
  skipped: number,
  t: { success: (m: string) => void; info: (m: string, o?: { description?: string }) => void }
): void {
  if (skipped > 0) {
    t.info(`Батлагдлаа · ${skipped} дуудлага алгассан`, { description: "Хүсэгчид мэдэгдэл очсон." });
  } else t.success("Хүсэлт батлагдлаа");
}

/**
 * Хадгалсан дуудлагатай хүсэлтийн шийдвэрийн үр дагавар (дизайн §5а) — батлах, татгалзах,
 * цуцлах цонхны тайлбар. calls = 0 бол null (ерөнхий тайлбар).
 */
export function storedCallsNotice(kind: "approve" | "reject" | "cancel", calls: number | undefined, label?: string): string | null {
  if (!calls) return null;
  if (kind === "approve") {
    return `Шилжүүлэлт хэрэгжиж, хадгалсан ${calls} дуудлага хүсэгчийн нэр дээр анхны цагаар нь бүртгэгдэнэ. Бүртгэж чадаагүйг алгасаж, хүсэгчид мэдэгдэнэ.`;
  }
  if (kind === "reject") return `Хадгалсан ${calls} дуудлага бүртгэгдэхгүй; харилцагчийн одоогийн хариуцагчид мэдэгдэнэ.`;
  return `«${label ?? "Энэ"}» хүсэлтийг буцаан татна. Хадгалсан ${calls} дуудлага бүртгэгдэхгүй бөгөөд дахин сэргээгдэхгүй.`;
}

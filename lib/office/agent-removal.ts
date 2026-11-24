import { z } from "zod";

/**
 * Оффисын админ агентыг «Хасах» — цэвэр дүрэм (серверийн импортгүй; client
 * диалог ч, server action ч ашиглана).
 *
 * DB-ийн office_agent_removal_check() нь хориг, CRM түүх, зарын тоог буцаана;
 * office_remove_agent() нь дахин шалгаад нэг транзакцид гүйцэтгэнэ. Энд тэр
 * JSON-ийг тайлбарлаж, сонголтыг шалгаж, хүнд ойлгомжтой текст гаргана.
 */

const blockerItemSchema = z
  .object({
    deal_id: z.string().optional(),
    deal_code: z.string().nullable().optional(),
    property_id: z.string().nullable().optional(),
    property_code: z.string().nullable().optional(),
    roles: z.array(z.string()).optional(),
    staff_id: z.string().optional(),
    name: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  });

const blockerSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    count: z.number().optional(),
    items: z.array(blockerItemSchema).optional(),
  });

const removalCheckSchema = z
  .object({
    agent: z.object({
      id: z.string(),
      name: z.string().nullable(),
      status: z.string(),
      office_id: z.string().nullable(),
      has_login: z.boolean(),
    }),
    staff: z.object({ id: z.string(), is_active: z.boolean(), offboarding: z.boolean() }).nullable(),
    blockers: z.array(blockerSchema),
    /** Нийтийн зар эсвэл Staff хөрөнгө оруулж байсан эсэх. */
    had_listings: z.boolean(),
    /** Одоогийн CRM-д оффисын бүртгэл (харилцагч, хэлцэл, гэрээ...) хариуцсан/үүсгэсэн эсэх. */
    has_crm_work: z.boolean(),
    mode: z.enum(["delete", "archive"]),
    has_history: z.boolean(),
    history: z.record(z.string(), z.number()),
    listings: z.object({ total: z.number(), active: z.number(), linked: z.number() }),
    leads: z.number(),
    conversations: z.number(),
    projects: z.number(),
    viewings: z.number(),
  });

export type RemovalBlocker = z.infer<typeof blockerSchema>;
export type RemovalBlockerItem = z.infer<typeof blockerItemSchema>;
export type RemovalCheck = z.infer<typeof removalCheckSchema>;
export type ListingsChoice = "transfer" | "delete";
export type TransferTarget = { id: string; name: string };

/** DB-ийн JSON-ийг шалгаж хөрвүүлнэ (буруу хэлбэртэй бол null). */
export function parseRemovalCheck(raw: unknown): RemovalCheck | null {
  const r = removalCheckSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Баталгаажуулах нэрийг харьцуулах хэлбэр — DB-ийн normalize(lower(...))-тэй ижил. */
export function normalizeConfirmName(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Бичсэн нэр агентын нэртэй таарах эсэх (том/жижиг үсэг, илүү зай хамаарахгүй). */
export function confirmNameMatches(input: string, agentName: string | null | undefined): boolean {
  const want = normalizeConfirmName(agentName);
  return want.length > 0 && normalizeConfirmName(input) === want;
}

/** Шилжүүлэх/устгах зүйл (зар, лид, төсөл, үзлэг) байгаа эсэх — сонголт шаардана. */
export function needsListingsChoice(c: RemovalCheck): boolean {
  return c.listings.total + c.leads + c.projects + c.viewings > 0;
}

/** CRM-ийн хөрөнгөтэй холбоотой зар байвал устгах сонголтыг хаана. */
export function canDeleteListings(c: RemovalCheck): boolean {
  return c.listings.linked === 0;
}

/** Анхдагч сонголт: шилжүүлэх (хүлээн авах агент байвал), эс бөгөөс устгах. */
export function defaultListingsChoice(c: RemovalCheck, targets: TransferTarget[]): ListingsChoice | null {
  if (!needsListingsChoice(c)) return null;
  if (targets.length > 0) return "transfer";
  return canDeleteListings(c) ? "delete" : "transfer";
}

/** Зарын сонголтын алдаа (null = зөв). DB ч дахин шалгана. */
export function listingsChoiceError(
  c: RemovalCheck,
  choice: ListingsChoice | null,
  targetId: string | null,
  targets: TransferTarget[]
): string | null {
  if (!needsListingsChoice(c)) return null;
  if (choice !== "transfer" && choice !== "delete") return "Зарыг шилжүүлэх эсвэл устгахыг сонгоно уу.";
  if (choice === "delete" && !canDeleteListings(c)) {
    return `CRM-ийн Staff хөрөнгөтэй холбоотой ${c.listings.linked} зар байна — устгахгүй, шилжүүлнэ үү.`;
  }
  if (choice === "transfer") {
    if (!targetId) return "Хүлээн авах агентыг сонгоно уу.";
    if (targetId === c.agent.id) return "Өөр агентыг сонгоно уу.";
    if (!targets.some((t) => t.id === targetId)) return "Хүлээн авах агент оффисын идэвхтэй агент байх ёстой.";
  }
  return null;
}

/**
 * Хасалтын үр дүн (эзний дүрэм, 2026-11-24): ЯМАР Ч зар оруулж байгаагүй хүнийг
 * түүхтэй нь бүрэн устгана; зар оруулж байсан эсвэл одоогийн CRM-д оффисын
 * бүртгэл хариуцсан хүний CRM түүхийг хадгалж архивлана. DB-ийн `mode`-оор.
 */
export function removalOutcome(c: RemovalCheck): "delete" | "archive" {
  if (!c.agent.has_login) return "delete";
  return c.mode === "archive" || c.had_listings || c.has_crm_work ? "archive" : "delete";
}

/** CRM түүхийн нийт бичлэг (харуулах). */
export function historyTotal(c: RemovalCheck): number {
  return Object.values(c.history).reduce((a, b) => a + b, 0);
}

/** Хасахад юу болохыг тайлбарлах мөрүүд (баталгаажуулах цонх). */
export function removalSummary(
  c: RemovalCheck,
  choice: ListingsChoice | null,
  targetName: string | null
): string[] {
  const lines: string[] = [];
  const { total, active } = c.listings;
  if (total > 0) {
    const what = `${total} зар${active > 0 && active !== total ? ` (${active} идэвхтэй)` : ""}`;
    if (choice === "transfer") lines.push(`${what} ${targetName ? `«${targetName}»` : "сонгосон агент"}-д шилжинэ.`);
    else if (choice === "delete") lines.push(`${what} зураг, хадгалсан жагсаалтын хамт устна.`);
  }
  const extra = [
    c.leads > 0 ? `${c.leads} лид` : null,
    c.projects > 0 ? `${c.projects} төсөл` : null,
    c.viewings > 0 ? `${c.viewings} үзлэг` : null,
  ].filter(Boolean);
  if (extra.length > 0) {
    lines.push(choice === "transfer" ? `${extra.join(", ")} мөн шилжинэ.` : `${extra.join(", ")} устна.`);
  }
  if (c.conversations > 0) lines.push(`Худалдан авагчтай хийсэн ${c.conversations} чат устна.`);

  if (!c.agent.has_login) {
    lines.push("Нэвтрэх бүртгэлгүй агент — зөвхөн агентын карт устна.");
  } else if (removalOutcome(c) === "archive") {
    const why = c.had_listings ? "Зар оруулж байсан" : "CRM-д оффисын бүртгэл (харилцагч, хэлцэл г.м.) хариуцсан";
    const n = historyTotal(c);
    lines.push(
      `${why} тул CRM-ийн түүх${n > 0 ? ` (${n} бичлэг)` : ""} хадгалагдана — нэр нь «(хасагдсан) ${c.agent.name ?? ""}» гэж харагдана.`
    );
    lines.push("Нэвтрэлт бүрмөсөн хаагдаж, оффисын хандалт хасагдана; и-мэйл/утас чөлөөлөгдөнө (дахин бүртгүүлж болно).");
  } else {
    const n = historyTotal(c);
    lines.push(
      `Зар оруулж байгаагүй — агентын карт, CRM бүртгэл, нэвтрэх бүртгэл${n > 0 ? ` болон түүх (${n} бичлэг)` : ""} бүрэн устна.`
    );
  }
  lines.push("Нийтийн сайт, оффисын жагсаалтаас шууд алга болно. Буцаах боломжгүй.");
  return lines;
}

export type BlockerLink = { href: string; label: string };

const ROLE_LABEL: Record<string, string> = { listing: "листлэгч", contract: "гэрээ", photo: "зураг" };

/** Хоригийг засах холбоосууд (оффисын CRM панель). */
export function blockerLinks(b: RemovalBlocker, base = "/office/crm"): BlockerLink[] {
  const items = b.items ?? [];
  switch (b.code) {
    case "deals":
      return items
        .filter((i) => i.deal_id && i.property_id)
        .map((i) => ({
          href: `${base}/staff/${i.property_id}/deals/${i.deal_id}`,
          label: `Хэлцэл ${i.deal_code ?? ""}${i.property_code ? ` · ${i.property_code}` : ""}`.trim(),
        }));
    case "property_roles":
      return items
        .filter((i) => i.property_id)
        .map((i) => ({
          href: `${base}/staff/${i.property_id}`,
          label: `${i.property_code ?? "Хөрөнгө"}${i.roles?.length ? ` — ${i.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}` : ""}`,
        }));
    case "substitute":
    case "crm_admin":
    case "act":
    case "legacy":
      return [{ href: `${base}/settings/staff`, label: "CRM → Тохиргоо → Ажилтан" }];
    default:
      return [];
  }
}

/** Нийт хүлээгдэж буй тооноос харуулсан нь цөөн бол «…ба N бусад». */
export function moreCount(b: RemovalBlocker): number {
  const shown = b.items?.length ?? 0;
  return Math.max(0, (b.count ?? shown) - shown);
}

/** DB/PostgREST-ийн алдааг хүнд ойлгомжтой болгоно. */
export function mapRemovalError(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "Хасаж чадсангүй. Дахин оролдоно уу.";
  if (/lock timeout|deadlock|could not obtain lock/i.test(m)) return "Систем завгүй байна — хэдэн секундын дараа дахин оролдоно уу.";
  if (/violates foreign key/i.test(m)) return "Холбоотой бүртгэл үлдсэн тул хасаж чадсангүй — системийн админд хандана уу.";
  if (/permission denied/i.test(m)) return "Танд энэ агентыг хасах эрх алга.";
  // DB-ийн өөрийн монгол мессеж (хориг, сонголтын алдаа) — «CRM: » угтварыг арилгана.
  if (/[А-Яа-яЁёӨөҮү]/.test(m)) return m.replace(/^CRM:\s*/, "");
  return "Хасаж чадсангүй. Дахин оролдоно уу.";
}

// ───────────── Байгаа бүртгэлийг агент болгох (createAgentByOffice) ─────────────

export type ExistingAccount = {
  role: "buyer" | "agent" | "office_admin" | "admin";
  officeId: string | null;
  /** Энэ профайлын agent мөр (profile_id unique тул 0 эсвэл 1). */
  agent: { id: string; officeId: string | null; status: "pending" | "active" | "rejected" } | null;
  /** Энэ оффисын crm_staff мөр хасагдсан (crm_staff_removals) эсэх. */
  staffRemoved?: boolean;
};

export type ExistingAccountDecision =
  | { kind: "convert" }
  | { kind: "reactivate"; agentId: string }
  | { kind: "refuse"; error: string };

/**
 * И-мэйл аль хэдийн бүртгэлтэй үед: энгийн хэрэглэгч → энэ оффисын агент
 * болгоно; энэ оффисын идэвхгүй/хүлээгдэж буй агент → сэргээнэ; админ, өөр
 * оффисын эсвэл аль хэдийн идэвхтэй агент → татгалзана.
 */
export function decideExistingAccount(acc: ExistingAccount, officeId: string): ExistingAccountDecision {
  if (acc.role === "admin" || acc.role === "office_admin") {
    return { kind: "refuse", error: "Энэ и-мэйл админ эрхтэй бүртгэлд хамаарна — агент болгох боломжгүй." };
  }
  if (acc.officeId && acc.officeId !== officeId) {
    return { kind: "refuse", error: "Энэ хэрэглэгч өөр оффист харьяалагддаг — агент болгох боломжгүй." };
  }
  if (acc.staffRemoved) {
    return { kind: "refuse", error: "Энэ бүртгэлийг оффисоос хассан — шинэ и-мэйлээр бүртгэнэ үү." };
  }
  if (acc.agent) {
    if (acc.agent.officeId !== officeId) {
      return {
        kind: "refuse",
        error: acc.agent.officeId
          ? "Энэ хэрэглэгч өөр оффисын агент — агент болгох боломжгүй."
          : "Энэ хэрэглэгч аль хэдийн агентаар (оффисгүй) бүртгэлтэй — системийн админд хандана уу.",
      };
    }
    if (acc.agent.status === "active") {
      return { kind: "refuse", error: "Энэ хэрэглэгч аль хэдийн танай оффисын идэвхтэй агент байна." };
    }
    return { kind: "reactivate", agentId: acc.agent.id };
  }
  return { kind: "convert" };
}

/** «Аль хэдийн бүртгэлтэй» алдаа эсэх (Supabase Auth-ийн мессеж). */
export function isAlreadyRegisteredError(message: string | null | undefined): boolean {
  return /already|registered|exist/i.test(message ?? "");
}

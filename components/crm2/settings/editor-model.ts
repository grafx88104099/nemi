import {
  COMMISSION_DEFAULT_RE,
  parseCommissionDefault,
  suspiciousCommission,
  type CommissionDefaultKind,
} from "@/lib/crm2/commission-defaults";
import { foldSearchText } from "@/lib/search/fold";

/**
 * Тохиргооны засварлагчдын цэвэр логик (staff сонгогч, шимтгэлийн анхдагч,
 * ангиллын тайлбар, мөрийн тэмдэглэл). React, сервер хамаарахгүй — vitest-ээр шалгана.
 * Эцсийн шалгалт validateSettingValue (settings-policies) ба crm2_set_setting-д.
 */

// ── Staff сонгогч (staff.quick_add_pilot) ─────────────────────────────────

export type StaffOption = { profile_id: string; name: string; team_name: string | null };

export type SelectedStaffRow = { id: string; name: string; team: string | null; inactive: boolean };

/** Нэр · баг (баггүй бол зөвхөн нэр). */
export function staffRowText(name: string, team: string | null | undefined): string {
  return team ? `${name} · ${team}` : name;
}

/**
 * Сонгогдсон мөр (сонгосон дарааллаар; лавлахад байхгүй бол «идэвхгүй») ба
 * сонгох боломжтой ажилтан (нэр эсвэл багаар хайсан, нэрээр эрэмбэлсэн).
 */
export function staffPickerView(
  staff: readonly StaffOption[],
  selected: readonly string[],
  query: string
): { selected: SelectedStaffRow[]; available: StaffOption[] } {
  const byId = new Map(staff.map((s) => [s.profile_id.toLowerCase(), s]));
  const chosen = new Set(selected.map((x) => x.toLowerCase()));
  const rows: SelectedStaffRow[] = selected.map((id) => {
    const s = byId.get(id.toLowerCase());
    return s
      ? { id, name: s.name, team: s.team_name, inactive: false }
      : { id, name: "Идэвхгүй ажилтан", team: null, inactive: true };
  });
  const q = foldSearchText(query).trim();
  const available = staff
    .filter((s) => !chosen.has(s.profile_id.toLowerCase()))
    .filter((s) => !q || foldSearchText(`${s.name} ${s.team_name ?? ""}`).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
  return { selected: rows, available };
}

/** Нэмэх / хасах. Дээд тоонд хүрсэн бол нэмэхгүй. */
export function toggleStaffId(list: readonly string[], id: string, maxItems: number): string[] {
  const key = id.toLowerCase();
  if (list.some((x) => x.toLowerCase() === key)) return list.filter((x) => x.toLowerCase() !== key);
  if (list.length >= maxItems) return [...list];
  return [...list, key];
}

// ── Шимтгэлийн анхдагч (brokerage.default_commission) ─────────────────────

export type CommissionRowKind = CommissionDefaultKind | "";
export type CommissionRow = { kind: CommissionRowKind; text: string };

const KINDS: readonly CommissionDefaultKind[] = ["percent", "rent_x", "fixed"];

/** Хадгалсан (эсвэл засаж буй) '<төрөл>:<утга>' → мөр. Хоосон/буруу төрөл → бөглөхгүй. */
export function readCommissionRow(raw: unknown): CommissionRow {
  if (typeof raw !== "string") return { kind: "", text: "" };
  const i = raw.indexOf(":");
  const kind = (i < 0 ? raw : raw.slice(0, i)).trim() as CommissionDefaultKind;
  if (!KINDS.includes(kind)) return { kind: "", text: "" };
  return { kind, text: i < 0 ? "" : raw.slice(i + 1) };
}

/** Утасны гарын «2,5», «500 000» → «2.5», «500000». */
export function cleanCommissionText(text: string): string {
  return text.replace(/[\s ]/g, "").replace(/,/g, ".");
}

/** Нэг ангиллын мөрийг шинэчилнэ. Төрөлгүй бол тухайн ангиллыг хасна (= урьдчилан бөглөхгүй). */
export function writeCommissionRow(
  map: Readonly<Record<string, unknown>>,
  category: string,
  row: CommissionRow
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (typeof v === "string" && k !== category) out[k] = v;
  if (row.kind) out[category] = `${row.kind}:${cleanCommissionText(row.text)}`;
  return out;
}

/** Мөрийн алдаа (null = зөв эсвэл бөглөхгүй). DB-ийн дүрэмтэй ижил. */
export function commissionRowError(row: CommissionRow): string | null {
  if (!row.kind) return null;
  const text = cleanCommissionText(row.text);
  if (!text) return "Утгаа оруулна уу.";
  if (!/^\d+(\.\d+)?$/.test(text)) return "Зөвхөн тоо оруулна уу.";
  if (!COMMISSION_DEFAULT_RE.test(`${row.kind}:${text}`)) return "Бутархай хэсэг 2 оронтой хүртэл байна.";
  const value = Number(text);
  if (row.kind === "percent" && value > 100) return "Хувь 100-аас ихгүй.";
  if (row.kind === "rent_x" && (value < 0.1 || value > 12)) return "0.1–12 дахин хооронд байна.";
  return null;
}

const fmtThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Агентын гэрээнд юу бөглөгдөхийг нэг мөрөөр (null = бөглөхгүй эсвэл утга буруу). */
export function commissionRowPreview(row: CommissionRow): string | null {
  if (!row.kind || commissionRowError(row)) return null;
  const d = parseCommissionDefault(`${row.kind}:${cleanCommissionText(row.text)}`);
  if (!d) return null;
  if (d.kind === "percent") return `Гэрээнд үнийн ${d.value}% гэж бөглөнө`;
  if (d.kind === "rent_x") {
    return `Төгрөгийн сарын нийт түрээсийг ${d.value}-аар үржүүлж тогтмол дүнгээр бөглөнө; бусад үнэд бөглөхгүй`;
  }
  return `Гэрээнд тогтмол ${fmtThousands(d.value)} ₮ гэж бөглөнө`;
}

/** Сэжигтэй утгын сануулга (хувь ≥ 50, түрээсэд 100%). */
export function commissionRowWarning(row: CommissionRow, category: string): string | null {
  if (row.kind !== "percent" || commissionRowError(row)) return null;
  return suspiciousCommission("percent", Number(cleanCommissionText(row.text)), category);
}

/** Ангилалд санал болгох төрлүүд: худалдахад «сарын түрээсийн N дахин» утгагүй (одоо сонгосон бол үлдээнэ). */
export function commissionKindsFor(category: string, current: CommissionRowKind): CommissionDefaultKind[] {
  if (category !== "sale") return [...KINDS];
  return KINDS.filter((k) => k !== "rent_x" || current === "rent_x");
}

// ── Ангиллын тайлбар (property.category_hints) ────────────────────────────

/** Нэг ангиллын тайлбарыг шинэчилнэ. Хоосон бол тухайн ангиллыг хасна (= тайлбаргүй). */
export function writeCategoryHint(
  map: Readonly<Record<string, unknown>>,
  category: string,
  text: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (typeof v === "string" && k !== category) out[k] = v;
  if (text.trim() !== "") out[category] = text;
  return out;
}

// ── Мөрийн тэмдэглэл (тохиргооны хоорондын хамаарал, сануулга) ────────────

export type SettingNote = { tone: "info" | "warn"; text: string };

type NoteValues = {
  "staff.quick_add"?: unknown;
  "staff.quick_add_pilot"?: unknown;
  "digest.scope"?: unknown;
  "ai.listing_parse"?: unknown;
};

/** Тохиргооны мөрийн доор харуулах тэмдэглэл. aiKeyConfigured — сервер дээр тооцсон (түлхүүрийг өөрийг нь хэзээ ч дамжуулахгүй). */
export function settingNotes(key: string, values: NoteValues, opts: { aiKeyConfigured: boolean }): SettingNote[] {
  const pilot = Array.isArray(values["staff.quick_add_pilot"]) ? values["staff.quick_add_pilot"].length : 0;
  const notes: SettingNote[] = [];
  switch (key) {
    case "staff.quick_add":
      notes.push({
        tone: "info",
        text: "Утасны «Хуваалцах»-аар ирсэн зарын текст ба сүлжээгүй үед хадгалсан бүртгэл энэ тохиргооноос үл хамааран бүх агентад шуурхай бүртгэлээр нээгдэнэ.",
      });
      if (values["staff.quick_add"] === "pilot" && pilot === 0) {
        notes.push({ tone: "warn", text: "Туршилтын агент сонгоогүй тул шуурхай бүртгэл хэнд ч нээгдэхгүй." });
      }
      break;
    case "staff.quick_add_pilot":
      notes.push({ tone: "info", text: "Хуучин бүрэн форм хүн бүрт «Бүрэн форм» холбоосоор үргэлж нээлттэй." });
      if (values["digest.scope"] === "pilot") {
        notes.push({ tone: "info", text: "Өдрийн сануулга «Туршилтын агентуудад» горимд энэ жагсаалтын агентуудад очно." });
      }
      break;
    case "digest.scope":
      if (values["digest.scope"] === "pilot" && pilot === 0) {
        notes.push({ tone: "warn", text: "Туршилтын агент сонгоогүй тул өдрийн сануулга хэнд ч очихгүй." });
      }
      break;
    case "ai.listing_parse":
      notes.push({
        tone: "warn",
        text: "Асаавал агентын наасан зарын текст (утас, тоот, хаалганы код, имэйл, эзний нэрийг нуусны дараа) Anthropic-ийн серверт боловсруулагдана. Оффисын нууцлалын зөвшөөрлөөр шийднэ.",
      });
      if (!opts.aiKeyConfigured) {
        notes.push({
          tone: values["ai.listing_parse"] === true ? "warn" : "info",
          text: "Сервер дээр AI-ийн түлхүүр тохируулаагүй — асаасан ч «AI-аар задлах» товч гарахгүй, дүрмийн задлалт ажиллана.",
        });
      } else {
        notes.push({ tone: "info", text: "Сервер дээр AI-ийн түлхүүр тохируулсан." });
      }
      break;
    case "brokerage.default_commission":
      notes.push({
        tone: "warn",
        text: "Урьдчилан бөглөсөн утга бүрийг агент гэрээн дээр «Зөв» гэж баталгаажуулна; баталгаажуулаагүй бол гэрээг батлуулахаар илгээх боломжгүй.",
      });
      break;
  }
  return notes;
}

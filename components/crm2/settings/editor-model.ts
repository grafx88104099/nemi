import { foldSearchText } from "@/lib/search/fold";

/**
 * Тохиргооны засварлагчдын цэвэр логик (staff сонгогч, ангиллын тайлбар, мөрийн тэмдэглэл).
 * React, сервер хамаарахгүй — vitest-ээр шалгана.
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
        text: "Утасны «Хуваалцах»-аар ирсэн зарын текст ба сүлжээгүй үед хадгалсан бүртгэл шуурхай бүртгэл асаалттай агентад шуурхай бүртгэлээр, бусдад бүрэн формоор (зөвлөмжтэй) нээгдэнэ.",
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
  }
  return notes;
}

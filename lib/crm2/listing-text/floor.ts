/**
 * Давхар «12/18» — нэг талбарт давхар ба барилгын давхрыг хамт бичих.
 * ЦЭВЭР, клиентэд аюулгүй (FloorField, бичвэр задлагч).
 *
 * Хязгаар нь crm2_properties-ийн check-тэй ижил: давхар −10…300, барилга 1…300,
 * давхар нь барилгын давхраас их байж болохгүй.
 */

export const FLOOR_MIN = -10;
export const FLOOR_MAX = 300;
export const BUILDING_FLOORS_MIN = 1;
export const BUILDING_FLOORS_MAX = 300;

export type FloorValue = { floor: number; buildingFloors: number | null };

/** «/», «\», «*», «-», «.», «／», зай — хоёр тооны хооронд нэг тусгаарлагч. */
const FLOOR_RE = /^\s*(-?\d{1,3})\s*(?:(?:[/\\*.\-／]|\s)\s*(\d{1,3})?)?\s*$/;

function validFloor(floor: number, buildingFloors: number | null): boolean {
  if (!Number.isInteger(floor) || floor < FLOOR_MIN || floor > FLOOR_MAX) return false;
  if (buildingFloors === null) return true;
  if (!Number.isInteger(buildingFloors) || buildingFloors < BUILDING_FLOORS_MIN || buildingFloors > BUILDING_FLOORS_MAX) {
    return false;
  }
  return floor <= buildingFloors;
}

/**
 * «12/18», «12-18», «12 / 18», «12*18», «12 18», «12.18», «12», «-1» → утга;
 * буруу, хязгаараас гадуур эсвэл давхар > барилга бол null. Бичиж байх үеийн
 * «12/» хэлбэрийг давхар л гэж уншина.
 */
export function parseFloorText(s: string): { floor: number; buildingFloors: number | null } | null {
  const m = FLOOR_RE.exec(String(s ?? ""));
  if (!m) return null;
  const floor = Number(m[1]);
  const buildingFloors = m[2] !== undefined ? Number(m[2]) : null;
  return validFloor(floor, buildingFloors) ? { floor, buildingFloors } : null;
}

/** Утгыг маягтын бичвэр болгоно («12/18», «12»). */
export function formatFloorText(floor: number | null | undefined, buildingFloors?: number | null): string {
  if (floor == null) return buildingFloors != null ? `/${buildingFloors}` : "";
  return buildingFloors != null ? `${floor}/${buildingFloors}` : String(floor);
}

/**
 * Урьдчилан харах бичвэр: «12-р давхар / 18 давхартай». Газар доорх давхар:
 * «Газар доорх 1-р давхар», 0 бол «Цокол давхар».
 */
export function describeFloor(floor: number | null | undefined, buildingFloors?: number | null): string {
  const parts: string[] = [];
  if (floor != null) {
    if (floor > 0) parts.push(`${floor}-р давхар`);
    else if (floor === 0) parts.push("Цокол давхар");
    else parts.push(`Газар доорх ${Math.abs(floor)}-р давхар`);
  }
  if (buildingFloors != null) parts.push(`${buildingFloors} давхартай`);
  return parts.join(" / ");
}

// ── Чөлөөт бичвэрээс давхар хайх (parse.ts) ───────────────────────────────

export type FloorFinding = {
  floor?: number;
  buildingFloors?: number;
  floorConfidence?: "high" | "low";
  buildingConfidence?: "high" | "low";
  evidence?: string;
};

const W = "[а-яөүёa-z]";
const DAVHAR = "(?:давхар|давхр|davhar|davkhar)";
/** Барилгыг заах үг: «16 давхар байр», «9 давхарын барилга», «2 давхар таун хаус». */
const BUILDING_NOUN = `(?:байр|барилга|хаус|байшин|таун|орон\\s+сууц|сууц|оффис|офис|bair|barilga)`;

type Hit = { kind: "pair" | "floor" | "building"; a: number; b?: number; conf: "high" | "low"; at: number; text: string };

/** Бага үсэгтэй (утас далдалсан) бичвэрээс давхар/барилгын давхрыг олно. */
export function findFloorInText(low: string): FloorFinding {
  const hits: Hit[] = [];
  const push = (h: Hit) => hits.push(h);

  // 1) «14/16 давхар», «давхар: 14/16», «давхар 12-18».
  const pairAfter = new RegExp(`(^|[^0-9.,/])(-?\\d{1,3})\\s*[/\\\\]\\s*(\\d{1,3})\\s*(?:-?\\s*р\\s*)?${DAVHAR}`, "g");
  for (const m of low.matchAll(pairAfter)) {
    push({ kind: "pair", a: Number(m[2]), b: Number(m[3]), conf: "high", at: m.index ?? 0, text: m[0] });
  }
  const pairBefore = new RegExp(`${DAVHAR}${W}*\\s*:?\\s*(-?\\d{1,3})\\s*[/\\\\-]\\s*(\\d{1,3})(?![0-9.,])`, "g");
  for (const m of low.matchAll(pairBefore)) {
    push({ kind: "pair", a: Number(m[1]), b: Number(m[2]), conf: "high", at: m.index ?? 0, text: m[0] });
  }
  // 2) «16 давхарын 14 давхарт».
  const buildingThenFloor = new RegExp(
    `(^|[^0-9.,/])(\\d{1,3})\\s*${DAVHAR}(?:ын|ийн|ын|ны)?\\s+(?:барилгын\\s+|байрны\\s+)?(-?\\d{1,3})\\s*(?:-?\\s*(?:р|дугаар|дахь)\\s*)?${DAVHAR}`,
    "g"
  );
  for (const m of low.matchAll(buildingThenFloor)) {
    push({ kind: "pair", a: Number(m[3]), b: Number(m[2]), conf: "high", at: m.index ?? 0, text: m[0] });
  }
  // 3) «15-р давхар(т)», «3 дугаар давхар».
  const ordinal = new RegExp(`(^|[^0-9.,/])(-?\\d{1,3})\\s*-?\\s*(?:р|дугаар|дахь|r)\\s*${DAVHAR}`, "g");
  for (const m of low.matchAll(ordinal)) {
    push({ kind: "floor", a: Number(m[2]), conf: "high", at: m.index ?? 0, text: m[0] });
  }
  // 4) «N давхар…»: -т → давхар; -тай / + барилгын үг → барилгын давхар; нүцгэн → давхар (low).
  const plain = new RegExp(`(^|[^0-9.,/+-])(\\d{1,3})\\s*${DAVHAR}(${W}*)(\\s+${BUILDING_NOUN})?`, "g");
  for (const m of low.matchAll(plain)) {
    const n = Number(m[2]);
    const suffix = m[3] ?? "";
    const at = m.index ?? 0;
    if (/^(т|t)$/.test(suffix) || (suffix === "ын" && !m[4])) {
      push({ kind: "floor", a: n, conf: suffix === "ын" ? "low" : "high", at, text: m[0] });
    } else if (/^(тай|tai)$/.test(suffix) || m[4]) {
      push({ kind: "building", a: n, conf: "high", at, text: m[0] });
    } else if (suffix === "") {
      push({ kind: "floor", a: n, conf: "low", at, text: m[0] });
    }
  }
  // 5) Нүцгэн «14/16» (контекстгүй) — low.
  const barePair = /(^|[^0-9.,/:])(\d{1,2})\s*\/\s*(\d{1,2})(?![0-9/.,])/g;
  for (const m of low.matchAll(barePair)) {
    const a = Number(m[2]);
    const b = Number(m[3]);
    if (b >= 2 && b <= 60 && a >= 1 && a <= b) push({ kind: "pair", a, b, conf: "low", at: m.index ?? 0, text: m[0] });
  }

  const out: FloorFinding = {};
  const rank = (h: Hit) => (h.conf === "high" ? 0 : 1);
  const sorted = [...hits].sort((x, y) => rank(x) - rank(y) || (x.kind === "pair" ? 0 : 1) - (y.kind === "pair" ? 0 : 1) || x.at - y.at);
  for (const h of sorted) {
    if (h.kind === "pair" && h.b !== undefined) {
      if (!validFloor(h.a, h.b)) continue;
      if (out.floor === undefined && out.buildingFloors === undefined) {
        out.floor = h.a;
        out.buildingFloors = h.b;
        out.floorConfidence = h.conf;
        out.buildingConfidence = h.conf;
        out.evidence = h.text.trim();
      }
    } else if (h.kind === "floor") {
      if (out.floor === undefined && validFloor(h.a, null)) {
        out.floor = h.a;
        out.floorConfidence = h.conf;
        out.evidence ??= h.text.trim();
      }
    } else if (h.kind === "building") {
      if (out.buildingFloors === undefined && h.a >= BUILDING_FLOORS_MIN && h.a <= BUILDING_FLOORS_MAX) {
        out.buildingFloors = h.a;
        out.buildingConfidence = h.conf;
        out.evidence ??= h.text.trim();
      }
    }
  }
  if (out.floor !== undefined && out.buildingFloors !== undefined && out.floor > out.buildingFloors) {
    delete out.buildingFloors;
    delete out.buildingConfidence;
    out.floorConfidence = "low";
  }
  return out;
}

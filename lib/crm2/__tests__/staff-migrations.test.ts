import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROPERTY_TYPES } from "@/lib/constants";
import { FEATURE_KEYS } from "@/lib/listing-features";

/**
 * Staff шуурхай бүртгэлийн миграцууд (20261124000100…0800) ↔ TS тогтмолын тохирол.
 * checklist.ts / phones.ts-ийг ТЕКСТЭЭР уншина (импортлохгүй) — тэдгээр нь өөр ажлын хэсэгт бичигддэг.
 */

const ROOT = join(__dirname, "..", "..", "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
// Staff хялбарчлалын 8 файл: 20261124000100 … 20261124000800 (тухайн өдрийн бусад migration — агент
// хасах 005000, avatars 006000 гэх мэт — энэ багцад орохгүй).
const STAFF_FILE = /^20261124000[1-8]00_[a-z0-9_]+\.sql$/;
const LAST_BEFORE = "20261123000800_listing_features_facets.sql";

const STAFF_FILES = readdirSync(MIG_DIR)
  .filter((f) => STAFF_FILE.test(f))
  .sort();

function mig(fragment: string): string {
  const f = STAFF_FILES.find((x) => x.includes(fragment));
  if (!f) throw new Error(`миграц олдсонгүй: ${fragment}`);
  return readFileSync(join(MIG_DIR, f), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** SQL-ийн `--` тайлбарыг хасна (мөр доторх тэмдэгт мөрийн «--»-д энэ миграцуудад хэрэглэгдээгүй). */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Файл доторх `create (or replace) function public.<name>(` -ийн СҮҮЛИЙН тодорхойлолтын бие ($tag$ … $tag$). */
function fnBody(sql: string, name: string): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, "gi");
  let body: string | null = null;
  for (const m of sql.matchAll(re)) {
    const open = /\$[a-z_]*\$/i.exec(sql.slice(m.index));
    if (!open) continue;
    const start = m.index + open.index + open[0].length;
    const end = sql.indexOf(open[0], start);
    body = sql.slice(start, end);
  }
  if (body === null) throw new Error(`функц олдсонгүй: ${name}`);
  return body;
}

/** `'a', 'b'` жагсаалтыг уншина. */
function quoted(list: string): string[] {
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** TS файлын `export const NAME = [ … ]` массивын мөрүүд. */
function tsConstArray(src: string, name: string): string[] {
  const m = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
  if (!m) throw new Error(`${name} олдсонгүй`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const CHECKLIST_SRC = readRepo("lib/crm2/checklist.ts");

describe("staff миграц: unconfirmed жагсаалт", () => {
  const sql0100 = stripComments(mig("000100_crm2_staff_columns"));
  const whitelist = (() => {
    const m = /crm2_properties_unconfirmed_chk check \([\s\S]*?unconfirmed <@ array\[([\s\S]*?)\]::text\[\]/.exec(sql0100);
    if (!m) throw new Error("unconfirmed CHECK олдсонгүй");
    return quoted(m[1]);
  })();

  it("(a) 0100-ийн CHECK = checklist.ts UNCONFIRMABLE_KEYS", () => {
    expect(whitelist.length).toBeGreaterThan(10);
    expect(new Set(whitelist).size).toBe(whitelist.length);
    expect(whitelist).toEqual(tsConstArray(CHECKLIST_SRC, "UNCONFIRMABLE_KEYS"));
  });

  it("(b) 0600 crm2_publish_confirm_keys = checklist.ts PUBLISH_CONFIRM_KEYS (= жагсаалт − дотоод түлхүүр)", () => {
    const body = stripComments(fnBody(mig("000600_crm2_publish_payload"), "crm2_publish_confirm_keys"));
    const m = /array\[([\s\S]*?)\]::text\[\]/.exec(body);
    const sqlKeys = quoted(m?.[1] ?? "");
    expect(sqlKeys).toEqual(tsConstArray(CHECKLIST_SRC, "PUBLISH_CONFIRM_KEYS"));
    const internal = new Set(["notes", "listing_agent_id", "contract_agent_id", "photo_agent_id"]);
    expect(sqlKeys).toEqual(whitelist.filter((k) => !internal.has(k)));
  });

  it("(i) 0600 crm2_publish_blockers баталгаажаагүй утгыг шалгана", () => {
    const body = stripComments(fnBody(mig("000600_crm2_publish_payload"), "crm2_publish_blockers"));
    expect(body).toMatch(/\bunconfirmed\b/);
    expect(body).toContain("crm2_publish_confirm_keys()");
  });
});

describe("staff миграц: нийтийн зарын payload (0600)", () => {
  const payload = stripComments(fnBody(mig("000600_crm2_publish_payload"), "crm2_listing_payload"));

  it("(c) features = lib/listing-features.ts FEATURE_KEYS (дараалал ижил)", () => {
    const m = /'features',\s*to_jsonb\(array\([\s\S]*?unnest\(array\[([\s\S]*?)\]::text\[\]\)\s*with ordinality/.exec(payload);
    expect(m).not.toBeNull();
    expect(quoted(m![1])).toEqual([...FEATURE_KEYS]);
  });

  it("(d) type CASE-ийн утга бүр PROPERTY_TYPES-д, ELSE = 'Обьект'", () => {
    const m = /'type',\s*case p\.property_type([\s\S]*?)\bend\b/.exec(payload);
    expect(m).not.toBeNull();
    const caseBody = m![1];
    const results = [...caseBody.matchAll(/\b(?:then|else)\s+'([^']+)'/g)].map((x) => x[1]);
    expect(results.length).toBeGreaterThanOrEqual(6);
    for (const r of results) expect(PROPERTY_TYPES as readonly string[]).toContain(r);
    expect(/\belse\s+'([^']+)'/.exec(caseBody)?.[1]).toBe("Обьект");
    // Тохиргооны шошгыг (property.types) нийтийн type-д бичихгүй.
    expect(caseBody).not.toContain("property.types");
  });
});

describe("staff миграц: файл", () => {
  it("(e) бүх файл 20261123000800-ийн дараа эрэмбэлэгдэнэ", () => {
    expect(STAFF_FILES.length).toBe(8);
    for (const f of STAFF_FILES) expect(f > LAST_BEFORE).toBe(true);
    const all = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(all.indexOf(LAST_BEFORE)).toBeLessThan(all.indexOf(STAFF_FILES[0]));
  });

  it("(f) дотоод журмын баримтыг иш татахгүй", () => {
    for (const f of STAFF_FILES) {
      expect(readFileSync(join(MIG_DIR, f), "utf8"), f).not.toContain("docs/crm/spec");
    }
  });

  it("файл бүр DEPLOY болон rollback тэмдэглэлтэй", () => {
    for (const f of STAFF_FILES) {
      const head = readFileSync(join(MIG_DIR, f), "utf8").split("\n").slice(0, 60).join("\n");
      expect(head, f).toMatch(/DEPLOY/);
      expect(head, f).toMatch(/rollback/i);
    }
  });
});

describe("staff миграц: шуурхай бүртгэл (0400)", () => {
  const sql0400 = mig("000400_crm2_quick_create");
  const sql0400nc = stripComments(sql0400);

  it("(g) client_key уралдаан: advisory lock + unique_violation", () => {
    const body = stripComments(fnBody(sql0400, "crm2_create_property_quick"));
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body.toLowerCase()).toContain("when unique_violation");
  });

  it("(h) crm2_property_duplicates яг 1 аргументтай", () => {
    const sigs = [...sql0400nc.matchAll(/create (?:or replace )?function public\.crm2_property_duplicates\(([^)]*)\)/gi)];
    expect(sigs.length).toBeGreaterThan(0);
    for (const s of sigs) {
      const args = s[1].split(",").map((a) => a.trim()).filter(Boolean);
      expect(args).toEqual(["p_property uuid"]);
    }
    expect(sql0400nc).toMatch(/grant execute on function public\.crm2_property_duplicates\(uuid\) to authenticated/);
  });

  it("crm2_resolve_owner-ийг authenticated дуудахгүй", () => {
    expect(sql0400nc).toMatch(/revoke all on function public\.crm2_resolve_owner\(jsonb\) from public, anon, authenticated/);
    expect(sql0400nc).not.toMatch(/grant execute on function public\.crm2_resolve_owner/);
  });
});

describe("staff миграц: утасны хэв (0600 ↔ phones.ts)", () => {
  const body = fnBody(mig("000600_crm2_publish_payload"), "crm2_phone_pattern");
  const sqlPattern = /select '([^']+)'::text/.exec(body)?.[1] ?? "";

  // [текст, утас гэж танигдах эсэх]
  const SAMPLES: [string, boolean][] = [
    ["Холбогдох: 9911 2233", true],
    ["99112233", true],
    ["+976 88-11-22-33", true],
    ["утас 7011-2233 оффис", true],
    ["Үнэ 35000000 ₮", false],
    ["Үнэ 85000000төг", false],
    ["81.47 м2, 12/18 давхар", false],
    ["123456789", false],
    ["2 өрөө 3 давхар", false],
  ];

  it("SQL хэв JS-д ажиллана (lookbehind-гүй) ба жишээг зөв ялгана", () => {
    expect(sqlPattern).not.toBe("");
    expect(sqlPattern).not.toMatch(/\(\?<[=!]/);
    const re = new RegExp(sqlPattern);
    for (const [text, isPhone] of SAMPLES) expect(re.test(text), text).toBe(isPhone);
    expect("Утас 9911 2233.".replace(new RegExp(sqlPattern, "g"), "$1•••• ••••")).toBe("Утас •••• ••••.");
  });

  const phonesPath = join(ROOT, "lib", "crm2", "listing-text", "phones.ts");
  it.skipIf(!existsSync(phonesPath))("phones.ts PHONE_PATTERN_SOURCE = SQL crm2_phone_pattern()", () => {
    const src = readFileSync(phonesPath, "utf8");
    const m = /PHONE_PATTERN_SOURCE\s*(?::\s*string\s*)?=\s*(["'`])([\s\S]*?)\1/.exec(src);
    expect(m).not.toBeNull();
    // TS мөрийн "\\" → "\".
    const tsPattern = m![2].replace(/\\\\/g, "\\");
    expect(tsPattern).toBe(sqlPattern);
  });
});

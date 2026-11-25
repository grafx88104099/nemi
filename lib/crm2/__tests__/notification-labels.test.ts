import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENT_LABEL, notificationEventLabel } from "@/lib/crm2/notification-labels";

/**
 * Мэдэгдлийн төрлийн нэр DB-тэй синк: хамгийн сүүлийн функцийн бие ба өгөгдлийн засварын DO блок дахь
 * crm2_notify(…, '<төрөл>', …) бүр NOTIFICATION_EVENT_LABEL-д нэртэй байна (DB-д холбогдохгүй).
 */
const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");
const FILES = fs
  .readdirSync(MIGRATIONS)
  .filter((x) => x.endsWith(".sql"))
  .sort();
const read = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");

/** Функц бүрийн ХАМГИЙН СҮҮЛИЙН бие ($$ … $$) — labels.test.ts-ийн latestFn-тэй ижил дүрэм. */
function latestBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /create (?:or replace )?function public\.(\w+)\b[\s\S]*?\$\$([\s\S]*?)\$\$/g;
  for (const f of FILES) for (const m of read(f).matchAll(re)) out.set(m[1], m[2]);
  return out;
}

/** Миграцийн DO блок ($do$ … $do$) — өгөгдлийн засвар мэдэгдэл илгээж болно. */
function doBlocks(): { file: string; body: string }[] {
  return FILES.flatMap((file) => [...read(file).matchAll(/do \$do\$([\s\S]*?)\$do\$/g)].map((m) => ({ file, body: m[1] })));
}

/**
 * crm2_notify( … ) дуудлага бүрийн 2-р аргумент (төрөл). Хаалт, мөр ('…', '' escape), -- тайлбарыг
 * тооцож дээд түвшний таслалаар хуваана.
 */
function notifyTypeArgs(body: string): string[] {
  const out: string[] = [];
  const head = "crm2_notify(";
  let i = body.indexOf(head);
  while (i !== -1) {
    let j = i + head.length;
    let depth = 1;
    let start = j;
    const args: string[] = [];
    while (j < body.length && depth > 0) {
      const ch = body[j];
      if (ch === "'") {
        j++;
        while (j < body.length) {
          if (body[j] === "'" && body[j + 1] === "'") j += 2;
          else if (body[j] === "'") break;
          else j++;
        }
      } else if (ch === "-" && body[j + 1] === "-") {
        const nl = body.indexOf("\n", j);
        j = nl === -1 ? body.length : nl;
        continue;
      } else if (ch === "(" || ch === "[") depth++;
      else if (ch === "]") depth--;
      else if (ch === ")") {
        depth--;
        if (depth === 0) args.push(body.slice(start, j));
      } else if (ch === "," && depth === 1) {
        args.push(body.slice(start, j));
        start = j + 1;
      }
      j++;
    }
    if (args.length >= 2) out.push(args[1].trim());
    i = body.indexOf(head, j);
  }
  return out;
}

/** Төрлийн аргументаас crm… литерал (case … then 'a' else 'b' end бол хоёулаа). */
const typeLiterals = (arg: string) => [...arg.matchAll(/'(crm[a-z0-9_]*)'/g)].map((m) => m[1]);

function emittedTypes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (src: string, body: string) => {
    for (const arg of notifyTypeArgs(body)) {
      const lits = typeLiterals(arg);
      // Төрлийг хувьсагчаар дамжуулбал тестээр шалгагдахгүй — литерал байх ёстой.
      expect(lits.length, `${src}: crm2_notify-ийн төрөл литерал биш (${arg})`).toBeGreaterThan(0);
      for (const t of lits) out.set(t, [...(out.get(t) ?? []), src]);
    }
  };
  for (const [name, body] of latestBodies()) if (name !== "crm2_notify") add(name, body);
  for (const d of doBlocks()) add(`DO ${d.file}`, d.body);
  return out;
}

describe("мэдэгдлийн төрлийн нэр ≙ crm2_notify (хамгийн сүүлийн миграц)", () => {
  let cache: Map<string, string[]> | null = null;
  const emittedMap = () => (cache ??= emittedTypes());

  it("задлагч: case илэрхийлэл, массив, давхар таслал, тайлбар", () => {
    const body = `
      perform public.crm2_notify(array[a, b], 'crm2_request', 'Гарчиг, таслалтай', x || ', ' || y, '/l');
      perform public.crm2_notify(public.f(o, array[a, b]), -- тайлбар (хаалт
        case when v_kind = 'deal_transfer' then 'crm2_deal_transferred' else 'crm2_contact_transferred' end,
        'It''s', 'b', 'l');`;
    const args = notifyTypeArgs(body);
    expect(args).toHaveLength(2);
    expect(typeLiterals(args[0])).toEqual(["crm2_request"]);
    expect(typeLiterals(args[1])).toEqual(["crm2_deal_transferred", "crm2_contact_transferred"]);
  });

  it("илгээгдэж буй төрөл бүр нэртэй", () => {
    expect(emittedMap().size).toBeGreaterThan(10);
    for (const [type, srcs] of emittedMap()) {
      expect(NOTIFICATION_EVENT_LABEL[type], `${type} (${[...new Set(srcs)].join(", ")})`).toBeTruthy();
    }
  });

  it("20261125000100: бүртгэл ба «Гэрээ буруу» мэдэгдэл", () => {
    expect(emittedMap().get("crm2_brokerage_registered")).toEqual(expect.arrayContaining(["crm2_brokerage_register"]));
    expect(emittedMap().get("crm2_brokerage_invalid")).toEqual(["crm2_brokerage_invalidate"]);
    expect(NOTIFICATION_EVENT_LABEL.crm2_brokerage_registered).toBe("Зуучлалын гэрээ бүртгэгдсэн");
    expect(NOTIFICATION_EVENT_LABEL.crm2_brokerage_invalid).toBe("Гэрээ буруу — ноорог руу буцсан");
    // Батлах урсгал ба идэвхжүүлэлтийн мэдэгдэл функцээс илгээгдэхгүй болсон (түүхэн мөрт нэр нь үлдэнэ).
    const fnOnly = new Map([...emittedMap()].map(([t, s]) => [t, s.filter((x) => !x.startsWith("DO "))] as const));
    for (const old of ["crm2_brokerage_pending", "crm2_brokerage_decided", "crm2_activation_blocked", "crm2_activation_ready"]) {
      expect(fnOnly.get(old) ?? [], old).toEqual([]);
      expect(NOTIFICATION_EVENT_LABEL[old], old).toMatch(/\(хуучин\)$/);
    }
  });

  it("одоо илгээгдэж буй төрлийг «(хуучин)» гэж нэрлэхгүй", () => {
    for (const [type, srcs] of emittedMap()) {
      if (srcs.every((s) => s.startsWith("DO "))) continue; // зөвхөн нэг удаагийн өгөгдлийн засвар
      expect(NOTIFICATION_EVENT_LABEL[type], type).not.toMatch(/хуучин/);
    }
  });

  it("notificationEventLabel: CRM бус → null, мэдэгдэхгүй CRM → «CRM»", () => {
    expect(notificationEventLabel("crm2_brokerage_registered")).toBe("Зуучлалын гэрээ бүртгэгдсэн");
    expect(notificationEventLabel("crm_team_lead")).toBe("Багийн ахлагч");
    expect(notificationEventLabel("crm_something_old")).toBe("CRM");
    expect(notificationEventLabel("listing_approved")).toBeNull();
    expect(notificationEventLabel(null)).toBeNull();
    expect(notificationEventLabel(undefined)).toBeNull();
    expect(notificationEventLabel("")).toBeNull();
  });
});

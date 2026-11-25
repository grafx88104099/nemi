import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 20261125000100_crm2_contract_register.sql — зуучлалын гэрээг батлах алхамгүй болгох migration-ийн
 * ТЕКСТИЙН шалгалт (DB-д холбогдохгүй). Ажиллагааг prod дээрх rolled-back sim шалгадаг.
 */

const MIG_DIR = join(__dirname, "..", "..", "..", "supabase", "migrations");
const FILE = "20261125000100_crm2_contract_register.sql";
const SQL = readFileSync(join(MIG_DIR, FILE), "utf8").replace(/\r\n/g, "\n");

/** SQL-ийн `--` тайлбарыг хасна (энэ файлын тэмдэгт мөрөнд «--» байхгүй). */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

const CODE = stripComments(SQL);

/** Файл доторх `create or replace function public.<name>(` -ийн СҮҮЛИЙН тодорхойлолт: толгой ба бие ($$ … $$). */
function fn(name: string): { head: string; body: string } {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, "g");
  let found: { head: string; body: string } | null = null;
  for (const m of SQL.matchAll(re)) {
    const rest = SQL.slice(m.index);
    const open = rest.indexOf("$$");
    const close = rest.indexOf("$$", open + 2);
    if (open < 0 || close < 0) continue;
    found = { head: rest.slice(0, open), body: rest.slice(open + 2, close) };
  }
  if (!found) throw new Error(`функц олдсонгүй: ${name}`);
  return found;
}

const body = (name: string) => stripComments(fn(name).body);

/** `do $do$ … $do$` өгөгдлийн засварын блок. */
const DATA_FIX = (() => {
  const m = /do \$do\$([\s\S]*?)\$do\$;/.exec(SQL);
  if (!m) throw new Error("өгөгдлийн засварын DO блок олдсонгүй");
  return m[1];
})();

const RETIRED_KEYS = [
  "brokerage.require_file",
  "brokerage.default_commission",
  "brokerage.activation_mode",
  "brokerage.require_special_terms",
  "digest.pending_days",
];

describe("гэрээ бүртгэх migration: файл", () => {
  it("толгойд DEPLOY, Rollback тэмдэглэл; эхний команд lock_timeout", () => {
    const head = SQL.split("\n").slice(0, 80).join("\n");
    expect(head).toMatch(/DEPLOY/);
    expect(head).toMatch(/Rollback/);
    expect(head).toMatch(/office_person_refs/); // «Хасах»: шинэ uuid багана автоматаар тоологдоно
    const firstStatement = CODE.trim().split(";")[0].trim();
    expect(firstStatement).toBe("set local lock_timeout = '3s'");
  });

  it("дотоод журмын баримтыг иш татахгүй", () => {
    expect(SQL).not.toContain("docs/crm/spec");
    expect(SQL).not.toMatch(/PMC-CRM-(TOR|PRO)/i);
    expect(SQL).not.toMatch(/журам/i);
  });

  it("бүх функцийн бие $$-ээр (labels/settings тестийн latestFn үүнийг л уншдаг), DO блок $do$-оор", () => {
    expect(SQL).not.toContain("$function$");
    const fns = [...SQL.matchAll(/create or replace function public\.(\w+)\(/g)];
    expect(fns.length).toBeGreaterThanOrEqual(20);
    for (const m of fns) {
      const rest = SQL.slice(m.index);
      const firstQuote = /\$[a-z_]*\$/.exec(rest);
      expect(firstQuote?.[0], m[1]).toBe("$$");
    }
    expect(SQL).toMatch(/do \$do\$/);
  });

  it("дахин тодорхойлсон prod функц бүр «-- ШИНЭ» тэмдэгтэй", () => {
    for (const name of [
      "crm2_property_has_valid_contract",
      "crm2_brokerage_missing",
      "crm2_missing_text",
      "crm2_brokerage_guard",
      "crm2_brokerage_files_guard",
      "crm2_brokerage_submit",
      "crm2_brokerage_approve",
      "crm2_brokerage_reject",
      "crm2_brokerage_withdraw",
      "crm2_daily_maintenance",
      "crm2_daily_digest",
      "crm2_setting_keys",
      "crm2_setting_default",
      "crm2_set_setting",
    ]) {
      expect(fn(name).body, name).toContain("-- ШИНЭ");
    }
  });
});

describe("гэрээ бүртгэх migration: эрх", () => {
  const PUBLIC_RPCS = [
    ["crm2_brokerage_register", "uuid, date, boolean"],
    ["crm2_brokerage_invalidate", "uuid, text"],
    ["crm2_can_invalidate_brokerage", "uuid"],
  ] as const;
  const INTERNAL = [
    ["crm2_property_try_activate", "uuid, boolean"],
    ["crm2_contract_watcher_ids", "uuid, uuid[]"],
    ["crm2_property_autoactivate", ""],
  ] as const;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  it.each(PUBLIC_RPCS)("%s: SECURITY DEFINER + search_path, authenticated-д нээлттэй, anon/PUBLIC-д хаалттай", (name, sig) => {
    const head = fn(name).head.toLowerCase();
    expect(head).toContain("security definer");
    expect(head).toContain("set search_path = public");
    const s = `public\\.${name}\\(${esc(sig)}\\)`;
    expect(CODE).toMatch(new RegExp(`revoke all on function ${s} from public, anon;`));
    expect(CODE).toMatch(new RegExp(`grant execute on function ${s} to authenticated, service_role;`));
    expect(CODE).not.toMatch(new RegExp(`grant [^;]*on function ${s} to [^;]*\\banon\\b`));
  });

  it.each(INTERNAL)("%s: зөвхөн service_role (authenticated дуудахгүй)", (name, sig) => {
    expect(fn(name).head.toLowerCase()).toContain("security definer");
    const s = `public\\.${name}\\(${esc(sig)}\\)`;
    expect(CODE).toMatch(new RegExp(`revoke all on function ${s} from public, anon, authenticated;`));
    expect(CODE).toMatch(new RegExp(`grant execute on function ${s} to service_role;`));
    expect(CODE).not.toMatch(new RegExp(`grant [^;]*on function ${s} to [^;]*\\b(authenticated|anon)\\b`));
  });
});

describe("гэрээ бүртгэх migration: хуучин батлах урсгал", () => {
  it.each(["crm2_brokerage_submit", "crm2_brokerage_approve", "crm2_brokerage_reject", "crm2_brokerage_withdraw"])(
    "%s нь ижил сигнатуртай, зөвхөн алдаа өгөх stub",
    (name) => {
      const b = body(name).trim();
      expect(b).toMatch(/^begin\s+raise exception 'CRM: гэрээг батлуулах шаардлагагүй болсон[^']*«Гэрээ бүртгэх»[^']*';\s+end$/);
    },
  );

  it("approve stub хуучин 4 параметр, анхдагч утгаа хадгална (create or replace амжилттай)", () => {
    const head = fn("crm2_brokerage_approve").head.replace(/\s+/g, " ");
    expect(head).toContain("p_contract uuid, p_note text default null, p_expected_updated_at timestamptz default null, p_file_checked boolean default null");
    expect(fn("crm2_brokerage_approve").head).toMatch(/returns jsonb/);
    expect(fn("crm2_brokerage_submit").head).toMatch(/returns void/);
    expect(fn("crm2_brokerage_reject").head).toMatch(/returns void/);
    expect(fn("crm2_brokerage_withdraw").head).toMatch(/returns void/);
  });

  it("'pending' дахин үүсэхгүй: crm2_brokerage_no_pending CHECK өгөгдлийн засварын ДАРАА нэмэгдэнэ", () => {
    const add = CODE.indexOf("add constraint crm2_brokerage_no_pending check (status <> 'pending')");
    expect(add).toBeGreaterThan(0);
    expect(add).toBeGreaterThan(CODE.indexOf("do $do$"));
  });
});

describe("гэрээ бүртгэх migration: өгөгдлийн засвар (idempotent)", () => {
  const fix = stripComments(DATA_FIX);

  it("зөвхөн status = 'pending' мөрийг уншина; гэрээний UPDATE бүр тухайн мөрөөр", () => {
    expect(fix).toMatch(/from public\.crm2_brokerage_contracts b[\s\S]*?where b\.status = 'pending'/);
    const updates = [...fix.matchAll(/update public\.crm2_brokerage_contracts([\s\S]*?);/g)].map((m) => m[1]);
    expect(updates.length).toBe(2);
    for (const u of updates) expect(u).toMatch(/where id = v_r\.id\s*$/);
  });

  it("active болгохдоо kind='contract' application/pdf файлтай мөрийг л (stamp_confirmed = false, бүртгэгч = илгээгч)", () => {
    expect(fix).toMatch(/f\.kind = 'contract' and f\.mime_type = 'application\/pdf'\) as has_pdf/);
    const active = /if v_r\.has_pdf and v_r\.start_date is not null and v_r\.end_date >= v_today then\n([\s\S]*?)\n {4}else\n([\s\S]*?)\n {4}end if;/.exec(fix);
    expect(active).not.toBeNull();
    expect(active![1]).toMatch(/set status = 'active', registered_by = v_agent/);
    expect(active![1]).toMatch(/stamp_confirmed = false/);
    expect(active![1]).toContain("crm2_property_try_activate(v_r.property_id, true)");
    expect(active![1]).toContain("crm2_contract_watcher_ids");
    expect(active![2]).toMatch(/set status = 'draft' where id = v_r\.id/);
    expect(fix).toMatch(/v_agent := coalesce\(v_r\.submitted_by, v_r\.responsible_agent_id\)/);
  });

  it("хуучин «батлах» мэдэгдлийг уншсан болгоно, устгахгүй", () => {
    expect(fix).toMatch(/update public\.notifications set read_at = now\(\)\s+where type = 'crm2_brokerage_pending' and read_at is null/);
    expect(fix).not.toMatch(/delete from/i);
    expect(fix).toContain("crm2_rpc_begin('Шинэ дүрмээр шилжүүлсэн");
  });
});

describe("гэрээ бүртгэх migration: гэрээ = зөвхөн PDF", () => {
  it("files_guard: kind='contract' нь application/pdf + .pdf, зөвхөн ноорогт, нэг PDF", () => {
    const b = body("crm2_brokerage_files_guard");
    expect(b).toMatch(/if new\.kind = 'contract' then/);
    expect(b).toMatch(/v_mime is distinct from 'application\/pdf' or new\.storage_path !~\* '\\\.pdf\$'/);
    expect(b).toMatch(/v_b\.status <> 'draft' and auth\.uid\(\) is not null/);
    expect(b).toContain("гэрээнд нэг PDF хавсаргана");
    expect(b).toMatch(/if tg_op = 'UPDATE' then\s+raise exception/); // мөрийг хэзээ ч засахгүй → NOT VALID CHECK аюулгүй
  });

  it("files_guard DELETE: гэрээний мөрийг түгжиж шинээр уншина — зэрэг бүртгэгдсэн гэрээний файлыг салгахгүй", () => {
    const b = body("crm2_brokerage_files_guard");
    expect(b).toMatch(
      /if tg_op = 'DELETE' then\s+if auth\.uid\(\) is not null and not public\.crm2_in_rpc\(\) and pg_trigger_depth\(\) = 1 then\s+select b\.status into v_b from public\.crm2_brokerage_contracts b\s+where b\.id = old\.contract_id for share;\s+if found and v_b\.status <> 'draft' then\s+raise exception/
    );
    expect(b).toMatch(/return old;\s+end if;/);
    expect(CODE).toMatch(
      /create trigger crm2_brokerage_files_guard\s+before insert or update or delete on public\.crm2_brokerage_files\s+for each row execute function public\.crm2_brokerage_files_guard\(\);/
    );
  });

  it("crm2_brokerage_missing 'file': мөр + storage-ийн одоо байгаа PDF объект", () => {
    const b = body("crm2_brokerage_missing");
    expect(b).toMatch(
      /join storage\.objects o on o\.bucket_id = 'crm2-docs' and o\.name = f\.storage_path\s+where f\.contract_id = v_b\.id and f\.kind = 'contract'\s+and f\.mime_type = 'application\/pdf'\s+and o\.metadata->>'mimetype' = 'application\/pdf'\) then\s+v_missing := array_append\(v_missing, 'file'\);/
    );
  });

  it("NOT VALID CHECK ба нэг-PDF unique index", () => {
    expect(CODE).toMatch(
      /add constraint crm2_brokerage_files_contract_pdf\s+check \(kind <> 'contract' or mime_type = 'application\/pdf'\) not valid;/,
    );
    expect(CODE).toMatch(
      /create unique index if not exists crm2_brokerage_files_one_pdf\s+on public\.crm2_brokerage_files \(contract_id\)\s+where kind = 'contract' and mime_type = 'application\/pdf';/,
    );
    expect(CODE).toContain("drop index if exists public.crm2_brokerage_pending_idx;");
  });

  it("хүчинтэй гэрээ = батлагдсан ЭСВЭЛ бүртгэгдсэн; PDF шаардахгүй (хуучин B001 JPEG-тэй)", () => {
    const b = body("crm2_property_has_valid_contract");
    expect(b).toContain("(b.approved_at is not null or b.registered_at is not null)");
    expect(b).not.toContain("crm2_brokerage_files");
    expect(CODE).toMatch(/check \(status not in \('active', 'expired'\) or approved_at is not null or registered_at is not null\)/);
    expect(CODE).toMatch(/check \(status in \('draft', 'terminated'\) or \(start_date is not null and end_date is not null\)\)/);
  });
});

describe("гэрээ бүртгэх migration: guard", () => {
  const b = body("crm2_brokerage_guard");

  it("хэрэглэгчийн INSERT: дугаар үргэлж систем (B###), эхлэх огноо хоосон, бүртгэлийн талбар цэвэр", () => {
    expect(b).toMatch(/if not v_sys then\s+new\.status := 'draft';\s+new\.number := '';\s+new\.start_date := null;/);
    expect(b).toContain("new.registered_by := null; new.registered_at := null; new.stamp_confirmed := false;");
    expect(b).toContain("new.invalidated_by := null; new.invalidated_at := null;");
    expect(b).toContain("public.crm2_next_code(new.office_id, 'brokerage')");
  });

  it("хэрэглэгчийн UPDATE: дугаар, эхлэх огноо, шинэ баганыг зөвхөн RPC бичнэ", () => {
    for (const col of ["number", "start_date", "registered_by", "registered_at", "stamp_confirmed", "invalidated_by", "invalidated_at"]) {
      expect(b, col).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(b).toContain("бүртгэгдсэн гэрээг засахгүй");
  });
});

describe("гэрээ бүртгэх migration: шалгалт ба шошго", () => {
  it("crm2_brokerage_missing: шинэ кодын дараалал (checklist.ts contractRegisterMissing-тэй ижил)", () => {
    const codes = [...body("crm2_brokerage_missing").matchAll(/array_append\(v_missing, '(\w+)'\)/g)].map((m) => m[1]);
    expect(codes).toEqual(["end_date", "end_date_past", "owner", "owner_name", "file", "file_not_pdf", "ownership_doc"]);
    expect(body("crm2_brokerage_missing")).not.toMatch(/commission|special_terms|signer|prefilled|role_unconfirmed|require_file/);
  });

  it("crm2_missing_text: бүртгэлийн бүх код (+ stamp_unconfirmed, brokerage_contract) монгол нэртэй, хуучин кодууд үлдсэн", () => {
    const labels = new Map([...body("crm2_missing_text").matchAll(/when '(\w+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
    for (const code of ["end_date", "end_date_past", "owner", "owner_name", "file", "file_not_pdf", "ownership_doc", "stamp_unconfirmed"]) {
      expect(labels.get(code), code).toBeTruthy();
    }
    expect(labels.get("brokerage_contract")).toBe("бүртгэгдсэн, хүчинтэй зуучлалын гэрээ (PMC тамгатай PDF)");
    expect(labels.get("file")).toBe("гэрээний PDF (PMC-ийн тамга, гарын үсэгтэй)");
    for (const legacy of ["start_date", "commission", "special_terms", "signer_authority", "defaults_unconfirmed", "role_unconfirmed"]) {
      expect(labels.has(legacy), legacy).toBe(true);
    }
  });

  it("тохиргоо: хасагдсан 5 түлхүүр keys / default / set_setting-д байхгүй", () => {
    for (const f of ["crm2_setting_keys", "crm2_setting_default", "crm2_set_setting"]) {
      const b = body(f);
      for (const k of RETIRED_KEYS) expect(b, `${f}: ${k}`).not.toContain(`'${k}'`);
    }
    // crm2_setting_default: мөр бүр «when 'түлхүүр' then '<json>'» (labels.test-ийн regex)
    expect(fn("crm2_setting_default").body).toMatch(/^\s+when 'brokerage\.default_term_months'\s+then '12'$/m);
  });
});

describe("гэрээ бүртгэх migration: RPC", () => {
  it("register: тамга, PDF, 60 сар, хөрөнгийг идэвхжүүлэх, FYI = ахлагч ∪ батлагч", () => {
    const b = body("crm2_brokerage_register");
    expect(b).toContain("if p_stamp_confirmed is not true then");
    expect(b).toContain("'stamp_unconfirmed'");
    expect(b).toContain("public.crm2_brokerage_missing(v_b.id)");
    expect(b).toMatch(/v_end > \(v_today \+ interval '60 months'\)::date/);
    expect(b).toContain("'brokerage.default_term_months'");
    expect(b).toMatch(/set status = 'active', start_date = v_today, registered_by = v_me, registered_at = now\(\),\s+stamp_confirmed = true/);
    expect(b).toContain("public.crm2_property_try_activate(v_p.id, true)");
    expect(b).toContain("public.crm2_contract_watcher_ids(v_b.office_id, array[v_b.responsible_agent_id, v_me])");
    expect(b).toContain("'crm2_brokerage_registered'");
    expect(b).toContain("'already', true");
  });

  it("watcher_ids: ахлагч ∪ roles.approve, approvals.team_lead-ээс хамаарахгүй", () => {
    const b = body("crm2_contract_watcher_ids");
    expect(b).toContain("crm2_setting_roles('roles.approve', p_office)");
    expect(b).toContain("array['team_lead']::public.crm_role[]");
    expect(b).toMatch(/\bunion\b/);
    expect(b).not.toContain("approvals.team_lead");
  });

  it("invalidate: эрх, цуцлалт + invalidated_*, хөрөнгө ноорог + published_at цэвэр, хүсэлт цуцлах, агентад мэдэгдэх", () => {
    const b = body("crm2_brokerage_invalidate");
    expect(b).toContain("public.crm2_can_invalidate_brokerage(v_b.id)");
    expect(b).toContain("char_length(v_reason) > 1900");
    expect(b).toMatch(/set status = 'terminated'[\s\S]*?invalidated_by = auth\.uid\(\), invalidated_at = now\(\)/);
    expect(b).toMatch(/v_p\.status in \('active', 'suspended', 'contract_ended'\)\s+and not public\.crm2_property_has_valid_contract\(v_p\.id\)/);
    expect(b).toMatch(/set status = 'draft', status_reason = 'Гэрээ буруу: ' \|\| v_reason, published_at = null/);
    expect(b).toMatch(/update public\.crm2_requests\s+set status = 'cancelled'[\s\S]*?kind = 'property_status'/);
    expect(b).toContain("'crm2_brokerage_invalid'");
  });

  it("can_invalidate: батлагч эсвэл хариуцагч/бүртгэгч/үүсгэгчийн багийн ахлагч", () => {
    const b = body("crm2_can_invalidate_brokerage");
    expect(b).toContain("public.crm2_brokerage_approver(b.responsible_agent_id)");
    expect(b).toContain("public.crm2_is_lead_of_any(array[b.responsible_agent_id, b.registered_by, b.created_by])");
  });
});

describe("гэрээ бүртгэх migration: автомат идэвхжүүлэлт ба cron", () => {
  it("4 AFTER trigger нэг функцээр; хөрөнгийнх зөвхөн ноорог / гэрээ дууссан үед", () => {
    const triggers = [...CODE.matchAll(/create trigger (\w+)\s+after ([\s\S]*?) on public\.(\w+)\s+for each row([\s\S]*?)execute function public\.crm2_property_autoactivate\(\);/g)];
    expect(triggers.map((t) => t[3]).sort()).toEqual(["crm2_contacts", "crm2_properties", "crm2_property_media", "crm2_property_private"]);
    const props = triggers.find((t) => t[3] === "crm2_properties")!;
    expect(props[4]).toContain("when (new.status in ('draft', 'contract_ended'))");
    const media = triggers.find((t) => t[3] === "crm2_property_media")!;
    expect(media[2]).toBe("insert");
    expect(media[4]).toContain("when (new.kind = 'image')");
    // Урьдчилсан шалгалт (харилцагч ба бусад хүснэгт) гэрээ дууссан хөрөнгийг ч хамарна.
    const pre = body("crm2_property_autoactivate");
    expect(pre.match(/x\.status in \('draft', 'contract_ended'\)/g)).toHaveLength(2);
    expect(pre).not.toMatch(/x\.status = 'draft'/);
  });

  it("try_activate: NO KEY UPDATE түгжээ (FK KEY SHARE-тэй deadlock үүсгэхгүй) exception блок дотор; алдааг warning болгоно", () => {
    const b = body("crm2_property_try_activate");
    expect(b).toContain("for no key update");
    expect(b).not.toMatch(/\bfor update\b/);
    // Түгжээ ч exception блок дотор — deadlock/lock алдаа хадгалалтыг унагахгүй.
    expect(b).toMatch(/\nbegin\s+begin\s+select x\.status, x\.status_changed_at into v_status, v_changed/);
    expect(b).toContain("public.crm2_property_has_valid_contract(p_property)");
    expect(b).toContain("cardinality(public.crm2_property_missing(p_property)) > 0");
    expect(b).toMatch(/exception when others then\s+raise warning/);
  });

  it("try_activate: гэрээ дууссан хөрөнгө — бүртгэл (p_allow_ended) эсвэл тэр төлөвөөс хойш бүртгэгдсэн гэрээ", () => {
    const b = body("crm2_property_try_activate");
    expect(b).toMatch(
      /if v_status = 'contract_ended' then\s+if not coalesce\(p_allow_ended, false\)\s+and not exists \(select 1 from public\.crm2_brokerage_contracts b\s+where b\.property_id = p_property and b\.status = 'active'\s+and b\.registered_at >= v_changed\) then\s+return false;/
    );
    expect(b).toMatch(/elsif v_status <> 'draft' then\s+return false;/);
  });

  it("өдөр тутмын шалгалт: activate_on_start/activation_mode-ийн оронд try_activate, activation_* мэдэгдэлгүй", () => {
    const b = body("crm2_daily_maintenance");
    expect(b).toContain("public.crm2_property_try_activate(v_r.id)");
    expect(b).toMatch(/x\.status = 'contract_ended'\s+and exists \(select 1 from public\.crm2_brokerage_contracts b\s+where b\.property_id = x\.id and b\.status = 'active'\s+and b\.registered_at >= x\.status_changed_at\)/);
    expect(b).not.toMatch(/crm2_activation_(blocked|ready)|activation_mode/);
    expect(b).toMatch(/'expired', v_expired, 'activated', v_activated/);
  });

  it("digest: «батлах» хэсэггүй, холбоос үргэлж дутуу бүртгэлийн жагсаалт", () => {
    const b = body("crm2_daily_digest");
    expect(b).not.toMatch(/approve|pending_days|батлах/);
    expect(b).toContain(" гэрээ бүртгэгдээгүй'");
    expect(b).toContain("'/agent/crm/staff/incomplete'");
  });

  it("түүх: crm2_brokerage_track шинэ баганыг бичнэ", () => {
    const m = /create trigger crm2_brokerage_track[\s\S]*?crm2_track_changes\(([\s\S]*?)\);/.exec(CODE);
    expect(m).not.toBeNull();
    for (const col of ["registered_by", "stamp_confirmed", "invalidated_by", "status", "number", "start_date", "end_date"]) {
      expect(m![1], col).toContain(`'${col}'`);
    }
  });
});

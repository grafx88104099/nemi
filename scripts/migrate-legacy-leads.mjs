// ============================================================
// Хуучин «Лид (CRM)» бүртгэлийг албан CRM руу нэг удаа шилжүүлэх
// (PRO-001 v2.1 §6.1): public.leads → crm_contacts + crm_leads,
// public.lead_activities → crm_activities.
//
//   Урьдчилан харах (бичихгүй):  node scripts/migrate-legacy-leads.mjs
//   Бодитоор шилжүүлэх:          node scripts/migrate-legacy-leads.mjs --apply
//   Нэг оффисоор хязгаарлах:     CRM_OFFICE_ID=<uuid> node scripts/migrate-legacy-leads.mjs --apply
//
// Шаардлага: SUPABASE_DB_URL (.env.local), миграци 20261107001400,
// 20261107001500 тавигдсан байх (leads.migrated_crm_lead_id).
// Идемпотент: migrated_crm_lead_id тэмдэгтэй мөрийг дахин шилжүүлэхгүй.
// Лид бүр тусдаа транзакцад — нэг нь унавал бусад нь хэвээр.
//
// Дүрэм:
//   • Оффисгүй агентын лид, утасгүй лидийг алгасна (тайланд).
//   • Ижил оффист ижил утастай харилцагч байвал түүнийг ашиглана; нээлттэй
//     сэжимтэй бол шинэ сэжим үүсгэхгүй, хуучин лидийг тэр сэжимд холбоно.
//   • Эх сурвалж: website/facebook/instagram/google → Дижитал суваг
//     (тайлбарт хуучин суваг), referral → Санал болголт, бусад → Бусад.
//   • Шат: new → Шинэ; contacted/viewing/offer → Идэвхтэй (агент CRM-ийн
//     ажилтан бол; ангилал C, дараагийн үйлдэл өнөөдөр «Эргэн холбогдох»);
//     closed/lost → Идэвхгүй.
//   • Шилжүүлсэн сэжимд эхний холболтын хугацаа тавихгүй (SLA тайланд орохгүй).
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error(".env.local-д SUPABASE_DB_URL алга.");

const SOURCE_MAP = {
  website: ["digital", "Цахим хуудас"],
  facebook: ["digital", "Facebook"],
  instagram: ["digital", "Instagram"],
  google: ["digital", "Google"],
  referral: ["referral", null],
  other: ["other", "Хуучин лидийн бүртгэлээс шилжүүлсэн"],
};

const CHANNEL_MAP = {
  call: "call",
  meeting: "meeting",
  message: "chat",
  note: "chat",
  viewing: "showing",
  email: "email",
};

function lifecycleOf(stage) {
  if (stage === "contacted" || stage === "viewing" || stage === "offer") return "active";
  if (stage === "closed" || stage === "lost") return "inactive";
  return "new";
}

function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D+/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 6) return "";
  if (d.length === 8) return `976${d}`;
  return d;
}

function splitName(full) {
  const words = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return { last: words[0], first: words.slice(1).join(" ") };
  return { last: null, first: words[0] ?? "Харилцагч" };
}

function ubToday() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = (text, params) => client.query(text, params);
  const report = { migrated: 0, linked: 0, skipped: [], activities: 0 };

  try {
    const col = await q(
      "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'migrated_crm_lead_id'"
    );
    if (!col.rows.length) throw new Error("Миграци 20261107001500 тавигдаагүй байна (leads.migrated_crm_lead_id алга).");

    const officeFilter = process.env.CRM_OFFICE_ID ?? null;
    const { rows: legacy } = await q(
      `select l.*, a.profile_id as agent_profile_id, a.office_id
         from public.leads l
         join public.agents a on a.id = l.agent_id
        where l.migrated_crm_lead_id is null
          and ($1::uuid is null or a.office_id = $1::uuid)
        order by l.created_at`,
      [officeFilter]
    );
    console.log(`${APPLY ? "ШИЛЖҮҮЛЭЛТ" : "УРЬДЧИЛАН ХАРАХ (--apply-гүй, бичихгүй)"}: ${legacy.length} мөр`);

    for (const l of legacy) {
      const tag = `lead ${l.id}`;
      if (!l.office_id) {
        report.skipped.push(`${tag}: агент оффисгүй`);
        continue;
      }
      const phone = normalizePhone(l.phone);
      if (!phone) {
        report.skipped.push(`${tag}: утасгүй`);
        continue;
      }
      const [srcCode, srcDetail] = SOURCE_MAP[l.source] ?? SOURCE_MAP.other;
      const src = await q(
        "select id from crm_lookups where office_id = $1 and kind = 'lead_source' and code = $2 and is_active",
        [l.office_id, srcCode]
      );
      if (!src.rows.length) {
        report.skipped.push(`${tag}: оффист «${srcCode}» эх сурвалжийн лавлах алга (seed-crm ажиллуулна)`);
        continue;
      }
      const sourceId = src.rows[0].id;
      const staff = await q(
        "select profile_id from crm_staff where office_id = $1 and profile_id = $2 and is_active and not offboarding",
        [l.office_id, l.agent_profile_id]
      );
      const ownerId = staff.rows[0]?.profile_id ?? null;
      const target = lifecycleOf(l.stage);
      const status = target === "active" && !ownerId ? "new" : target;

      if (!APPLY) {
        console.log(`  ${tag}: → ${status}${ownerId ? "" : " (эзэмшигчгүй — хуваарилалтын дараалалд)"}, эх сурвалж ${srcCode}`);
        continue;
      }

      try {
        await q("begin");
        // Харилцагч: ижил оффист ижил утас.
        const hit = await q(
          `select p.contact_id from crm_contact_phones p
             join crm_contacts c on c.id = p.contact_id
            where p.office_id = $1 and p.normalized = $2 and c.merged_into_id is null
            limit 1`,
          [l.office_id, phone]
        );
        let contactId = hit.rows[0]?.contact_id ?? null;
        if (!contactId) {
          const num = await q("select public.crm_next_number($1, 'contact') as n", [l.office_id]);
          const { last, first } = splitName(l.name);
          const c = await q(
            `insert into crm_contacts (office_id, number, kind, last_name, first_name, display_name, contact_types,
                                       source_id, source_detail, consent, created_by, created_at)
             values ($1, $2, 'person', $3, $4, $5, '{buyer}', $6, $7, 'not_asked', $8, $9)
             returning id`,
            [l.office_id, num.rows[0].n, last, first, [last, first].filter(Boolean).join(" "), sourceId, srcDetail, l.agent_profile_id, l.created_at]
          );
          contactId = c.rows[0].id;
          await q(
            "insert into crm_contact_phones (office_id, contact_id, raw, normalized, is_primary) values ($1, $2, $3, $4, true)",
            [l.office_id, contactId, l.phone, phone]
          );
        }

        const open = await q("select id from crm_leads where contact_id = $1 and status in ('new','active') limit 1", [contactId]);
        let leadId = open.rows[0]?.id ?? null;
        if (leadId) {
          report.linked += 1;
        } else {
          const note = [srcDetail, l.note ? `Тэмдэглэл: ${String(l.note).slice(0, 300)}` : null].filter(Boolean).join(" — ");
          const ins = await q(
            `insert into crm_leads (office_id, contact_id, owner_id, source_id, source_detail, status, received_at,
                                    created_by, created_at, channel_ref)
             values ($1, $2, $3, $4, $5, 'new', $6, $7, $6, $8)
             returning id`,
            [l.office_id, contactId, ownerId, sourceId, note || null, l.created_at, l.agent_profile_id, `legacy:${l.id}`]
          );
          leadId = ins.rows[0].id;
          report.migrated += 1;
        }

        // Үйл ажиллагаа (шинэ төлөвт байхад — дараагийн үйлдлийн шаардлагагүй үед).
        const acts = await q(
          "select * from lead_activities where lead_id = $1 and migrated_crm_activity_id is null order by occurred_at",
          [l.id]
        );
        for (const a of acts.rows) {
          const occurred = new Date(a.occurred_at) > new Date() ? new Date().toISOString() : a.occurred_at;
          const r = await q(
            `insert into crm_activities (office_id, contact_id, lead_id, channel, purpose, summary, outcome,
                                         occurred_at, owner_id, reached)
             values ($1, $2, $3, $4, 'follow_up', $5, 'open', $6, $7, null)
             returning id`,
            [
              l.office_id,
              contactId,
              leadId,
              CHANNEL_MAP[a.kind] ?? "chat",
              [a.summary, a.outcome ? `Үр дүн: ${a.outcome}` : null].filter(Boolean).join("\n"),
              occurred,
              l.agent_profile_id,
            ]
          );
          await q("update lead_activities set migrated_crm_activity_id = $1 where id = $2", [r.rows[0].id, a.id]);
          report.activities += 1;
        }

        // Шатны төлөв (шинээр үүсгэсэн сэжимд).
        if (!open.rows.length && status !== "new") {
          if (status === "active") {
            await q(
              `update crm_leads
                  set status = 'active', grade = 'c',
                      grade_override_reason = 'Хуучин бүртгэлээс шилжүүлсэн — ангиллыг дахин нягтална',
                      last_contact_at = coalesce(last_contact_at, $2::timestamptz, created_at),
                      next_step = 'Эргэн холбогдох', next_step_date = $3::date
                where id = $1`,
              [leadId, l.last_activity_at ?? null, ubToday()]
            );
          } else {
            await q("update crm_leads set status = 'inactive' where id = $1", [leadId]);
          }
        }

        await q("update public.leads set migrated_crm_lead_id = $1, migrated_at = now() where id = $2", [leadId, l.id]);
        await q("commit");
      } catch (e) {
        await q("rollback");
        report.skipped.push(`${tag}: алдаа — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log("\nДүн:");
  console.log(`  Шинэ сэжим: ${report.migrated}`);
  console.log(`  Байгаа нээлттэй сэжимд холбосон: ${report.linked}`);
  console.log(`  Шилжүүлсэн үйл ажиллагаа: ${report.activities}`);
  if (report.skipped.length) {
    console.log(`  Алгассан (${report.skipped.length}):`);
    for (const s of report.skipped) console.log(`   - ${s}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

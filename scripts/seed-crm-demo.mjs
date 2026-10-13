// ============================================================
// PMC CRM — ДЕМО/UAT өгөгдлийн seed (U9 crm-reports-uat).
//
// Урьдач нөхцөл:
//   1) Миграци 000100…000900 бүгд хэрэглэгдсэн
//   2) node scripts/seed-crm.mjs (тохиргоо/урсгал/гейт) ажилласан
//   3) Оффис + office_admin profile + agent@nemi.mn хэрэглэгч бий
//      (scripts/create-test-users.mjs, scripts/seed.mjs)
//
// Ажиллуулах:  node scripts/seed-crm-demo.mjs   (SUPABASE_DB_URL шаардана)
//
// АНХААР: демо өгөгдлийг НЭГ transaction дотор, түр зуур
// session_replication_role='replica' горимд (бүх trigger идэвхгүй)
// оруулна — учир нь түүх-хэлбэрийн демо мөрүүд (хаагдсан хэлцэл,
// өнгөрсөн огноотой шатны түүх, batch бүртгэл) бизнес-guard-уудын
// «зөвхөн урагшаа» урсгалыг дамжихгүйгээр бэлэн төлөвт тавигдана.
// Тиймээс энэ скрипт өгөгдлийн УЯЛДААГ өөрөө бүрэн хариуцна (доорх
// мөр бүр гейт/төлөвийн машины шаардлагыг гараар хангасан байдлаар
// бичигдсэн). Продакшн өгөгдөлд ХЭЗЭЭ Ч бүү ашигла.
// Дахин ажиллуулж болно — бүх мөр тогтмол UUID/дугаартай (идемпотент).
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
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error(".env.local-д SUPABASE_DB_URL алга — миграци хэрэглэсний дараа ажиллуулна.");

const J = (v) => JSON.stringify(v);

/** Тогтмол демо UUID (идемпотентийн түлхүүр): d(1) → …-000000000001 */
const d = (n) => `de300000-0000-4000-a000-${String(n).padStart(12, "0")}`;

/** Огнооны туслахууд */
const DAY = 86400000;
const iso = (msOffset) => new Date(Date.now() + msOffset).toISOString();
const day = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const monthFirst = (offsetMonths) => {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offsetMonths, 1))
    .toISOString()
    .slice(0, 10);
};

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    await q("begin");
    // Бүх trigger (guard/audit/FK) идэвхгүй — зөвхөн энэ transaction-д.
    await q("set local session_replication_role = 'replica'");

    // ── Оффис, profile-ууд ──
    let officeId = process.env.CRM_OFFICE_ID ?? null;
    if (!officeId) {
      const r = await q("select id from offices order by created_at limit 1");
      officeId = r.rows[0]?.id ?? null;
    }
    if (!officeId) throw new Error("Оффис олдсонгүй — эхлээд scripts/seed.mjs ажиллуулна.");

    const adminRes = await q(
      "select id from profiles where office_id = $1 and role = 'office_admin' order by created_at limit 1",
      [officeId]
    );
    const admin = adminRes.rows[0]?.id;
    if (!admin) throw new Error("office_admin profile олдсонгүй.");

    const agentRes = await q(
      "select p.id from profiles p join auth.users u on u.id = p.id where u.email = 'agent@nemi.mn' limit 1"
    );
    const agent = agentRes.rows[0]?.id ?? admin;
    if (agent === admin) console.log("⚠ agent@nemi.mn олдсонгүй — агентын мөрүүдэд админ profile ашиглана.");
    console.log("Оффис:", officeId, "| админ:", admin, "| агент:", agent);

    // ── Лавлах/урсгалын ID-ууд (seed-crm.mjs-ээс) ──
    const lookupId = async (kind, code) => {
      const r = await q(
        "select id from crm_lookups where office_id = $1 and kind = $2 and code = $3",
        [officeId, kind, code]
      );
      if (!r.rows[0]) throw new Error(`Лавлах олдсонгүй: ${kind}/${code} — scripts/seed-crm.mjs эхлээд ажиллуулна.`);
      return r.rows[0].id;
    };
    const srcWebsite = await lookupId("lead_source", "website");
    const srcFacebook = await lookupId("lead_source", "facebook");
    const srcReferral = await lookupId("lead_source", "referral");
    const lostPrice = await lookupId("lost_reason", "price");

    const stageId = async (plCode, stCode) => {
      const r = await q(
        `select s.id, p.id as pipeline_id from crm_stages s
         join crm_pipelines p on p.id = s.pipeline_id
         where p.office_id = $1 and p.code = $2 and s.code = $3`,
        [officeId, plCode, stCode]
      );
      if (!r.rows[0]) throw new Error(`Шат олдсонгүй: ${plCode}/${stCode} — scripts/seed-crm.mjs эхлээд ажиллуулна.`);
      return r.rows[0];
    };
    const pl1New = await stageId("PL-1", "new");
    const pl1Qualified = await stageId("PL-1", "qualified");
    const pl1Showing = await stageId("PL-1", "showing");
    const pl1Offer = await stageId("PL-1", "offer");
    const pl1Contract = await stageId("PL-1", "contract");
    const pl1Won = await stageId("PL-1", "closed_won");
    const pl1Lost = await stageId("PL-1", "closed_lost");
    const pl3Qualified = await stageId("PL-3", "qualified");

    // ── Салбар, баг, ажилтан ──
    const branch1 = d(101), branch2 = d(102), team1 = d(103);
    await q(
      `insert into crm_branches (id, office_id, code, name) values
         ($1, $3, 'central', 'Төв салбар'), ($2, $3, 'khanuul', 'Хан-Уул салбар')
       on conflict do nothing`,
      [branch1, branch2, officeId]
    );
    // code-оор бодит id-г буцааж авна (өмнө нь өөр id-тэй үүссэн байж болно)
    const br = async (code) =>
      (await q("select id from crm_branches where office_id = $1 and code = $2", [officeId, code])).rows[0].id;
    const b1 = await br("central");
    const b2 = await br("khanuul");

    await q(
      `insert into crm_teams (id, office_id, branch_id, name, lead_profile_id)
       values ($1, $2, $3, 'Борлуулалтын 1-р баг', $4)
       on conflict do nothing`,
      [team1, officeId, b1, admin]
    );

    await q(
      `insert into crm_staff (office_id, profile_id, branch_id, team_id, roles, panel_admin)
       values ($1, $2, $3, null, '{sales_director,ops_qc,finance,aml_officer,ceo,sysadmin}', true)
       on conflict (office_id, profile_id) do update
         set roles = excluded.roles, panel_admin = true, is_active = true, branch_id = excluded.branch_id`,
      [officeId, admin, b1]
    );
    if (agent !== admin) {
      await q(
        `insert into crm_staff (office_id, profile_id, branch_id, team_id, roles)
         values ($1, $2, $3, $4, '{agent}')
         on conflict (office_id, profile_id) do update
           set roles = excluded.roles, is_active = true, branch_id = excluded.branch_id, team_id = excluded.team_id`,
        [officeId, agent, b1, team1]
      );
    }

    // ── Харилцагчид (C1…C10) ──
    const C = Object.fromEntries([...Array(10)].map((_, i) => [i + 1, d(200 + i + 1)]));
    const contacts = [
      // [key, kind, last, first, org, display, types[], source, kyc]
      [1, "person", "Бат", "Батболд", null, "Б. Батболд", "{buyer}", srcWebsite, "pending"],
      [2, "person", "Дашням", "Сарнай", null, "Д. Сарнай", "{buyer}", srcFacebook, "pending"],
      [3, "person", "Гомбо", "Түвшин", null, "Г. Түвшин", "{buyer}", srcWebsite, "pending"],
      [4, "person", "Цэрэн", "Оюунаа", null, "Ц. Оюунаа", "{buyer}", srcFacebook, "pending"],
      [5, "person", "Жаргал", "Дорж", null, "Ж. Дорж", "{seller}", srcWebsite, "verified"],
      [6, "person", "Наран", "Энхжаргал", null, "Н. Энхжаргал", "{landlord}", srcWebsite, "verified"],
      [7, "person", "Сүхбат", "Болор", null, "С. Болор", "{tenant}", srcFacebook, "verified"],
      [8, "company", null, null, "Мөнх Констракшн ХХК", "Мөнх Констракшн ХХК", "{buyer}", srcWebsite, "verified"],
      [9, "person", "Отгон", "Ганзориг", null, "О. Ганзориг", "{buyer}", srcFacebook, "pending"],
      [10, "person", "Баяр", "Насанбат", null, "Б. Насанбат", "{buyer}", srcReferral, "pending"],
    ];
    for (const [k, kind, last, first, org, disp, types, src, kyc] of contacts) {
      await q(
        `insert into crm_contacts (id, office_id, number, kind, last_name, first_name, org_name,
           display_name, contact_types, source_id, lifecycle, consent, consent_at,
           kyc_public_status, is_repeat, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::crm_contact_type[], $10, 'active', 'granted', now(),
           $11, $12, $13, now() - interval '40 days')
         on conflict do nothing`,
        [C[k], officeId, `DEMO-C-${String(k).padStart(3, "0")}`, kind, last, first, org, disp, types, src,
         kyc, k === 8, admin]
      );
    }
    // Утас/имэйл (давхардлын демо: C3, C4 ижил дугаартай — DuplicateHint харагдана)
    const phones = [
      [d(231), 1, "9911-0001", "97699110001"], [d(232), 2, "9911-0002", "97699110002"],
      [d(233), 3, "9911-0003", "97699110003"], [d(234), 4, "9911-0003", "97699110003"],
      [d(235), 5, "9911-0005", "97699110005"], [d(236), 6, "9911-0006", "97699110006"],
      [d(237), 7, "9911-0007", "97699110007"], [d(238), 8, "7011-0008", "97670110008"],
    ];
    for (const [id, k, raw, norm] of phones) {
      await q(
        `insert into crm_contact_phones (id, office_id, contact_id, raw, normalized, is_primary)
         values ($1, $2, $3, $4, $5, true) on conflict do nothing`,
        [id, officeId, C[k], raw, norm]
      );
    }
    await q(
      `insert into crm_contact_emails (id, office_id, contact_id, email, is_primary)
       values ($1, $2, $3, 'batbold@example.mn', true) on conflict do nothing`,
      [d(241), officeId, C[1]]
    );

    // ── Профайлууд ──
    await q(
      `insert into crm_need_profiles (id, office_id, contact_id, profile_type, locations, property_types,
         budget_min, budget_target, budget_max, financing, rooms_min, timeline,
         must_haves, nice_to_haves, deal_breakers, status, completeness_pct, created_by)
       values
       ($1, $4, $5, 'buyer', $8, '{apartment}', 380000000, 430000000, 460000000, 'mixed', 3, '1_3m',
        $9, '[]', '[]', 'active', 100, $7),
       ($2, $4, $6, 'buyer', $8, '{apartment}', 330000000, 370000000, 400000000, 'loan', 2, '1_3m',
        $10, '[]', '[]', 'active', 100, $7),
       ($3, $4, $11, 'buyer', $8, '{apartment}', null, null, 350000000, 'not_ready', null, '3_12m',
        '[]', '[]', '[]', 'active', 60, $7)
       on conflict do nothing`,
      [d(301), d(302), d(303), officeId, C[1], C[2], admin,
       J(["ХУД", "БЗД"]), J(["Лифттэй", "Дулаан зогсоолтой", "Сургуульд ойр"]),
       J(["Нарны талтай", "2+ өрөө", "Шинэ угсралт"]), C[3]]
    );
    await q(
      `insert into crm_owner_profiles (id, office_id, contact_id, property_id, goal, asking_price,
         decision_authority, listing_state, status, created_by)
       values
       ($1, $3, $4, null, 'sell', 450000000, 'sole', 'agreed', 'active', $6),
       ($2, $3, $5, null, 'manage', 2800000, 'sole', 'agreed', 'active', $6)
       on conflict do nothing`,
      [d(311), d(312), officeId, C[5], C[6], admin]
    );

    // ── Сэжимүүд (L1…L6) — алтан дүрэм: идэвхтэйд 5 бүрдэл бүрэн ──
    const L = { 1: d(401), 2: d(402), 3: d(403), 4: d(404), 5: d(405), 6: d(406), 7: d(407) };
    const leadRows = [
      // [key, contact, status, grade, score, owner, next_step, next_date, last_contact_off, source, created_off]
      [1, C[1], "active", "a", 86, agent, "Гэрээний нөхцөл тохирох уулзалт", day(2), -1, srcWebsite, -25],
      [2, C[2], "active", "b", 68, agent, "Үзлэгийн дараах санал авах залгалт", day(-3), -4, srcFacebook, -20],
      [3, C[3], "new", null, null, agent, null, null, null, srcWebsite, -1],
      [4, C[4], "new", null, null, agent, null, null, null, srcFacebook, 0],
      [5, C[10], "new", null, null, agent, null, null, null, srcReferral, -2],
      [6, C[8], "inactive", "a", 90, agent, null, null, -10, srcWebsite, -60],
      [7, C[9], "recycled", "c", 45, admin, null, null, -30, srcFacebook, -70],
    ];
    for (const [k, contact, status, grade, score, owner, step, stepDate, lastOff, src, createdOff] of leadRows) {
      await q(
        `insert into crm_leads (id, office_id, contact_id, branch_id, owner_id, source_id, status,
           grade, score, last_contact_at, next_step, next_step_date,
           first_contact_due_at, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict do nothing`,
        [L[k], officeId, contact, b1, owner, src, status, grade, score,
         lastOff != null ? iso(lastOff * DAY) : null, step, stepDate,
         iso(createdOff * DAY + 4 * 3600000), admin, iso(createdOff * DAY)]
      );
    }

    // ── Объектууд (P1…P5) ──
    const P = { 1: d(501), 2: d(502), 3: d(503), 4: d(504), 5: d(505) };
    const props = [
      // [key, name, service, type, status, occupancy, price, rent, owner, branch, area, rooms]
      [1, "River Garden 3 өрөө", "sale", "apartment", "active", null, 450000000, null, C[5], b1, 82.5, 3],
      [2, "Хан-Уул Вилла 2 өрөө", "managed_rental", "apartment", "rented", "occupied", null, 2800000, C[6], b1, 60.2, 2],
      [3, "Zaisan Hill 2 өрөө", "managed_rental", "apartment", "active", "vacant", null, 2500000, C[6], b2, 55.0, 2],
      [4, "Баянгол дуплекс", "sale", "apartment", "draft", null, 380000000, null, C[5], b1, 96.0, 4],
      [5, "Encanto 3 өрөө (зарагдсан)", "sale", "apartment", "sold", null, 450000000, null, C[5], b1, 84.0, 3],
    ];
    for (const [k, name, svc, type, status, occ, price, rent, owner, branch, area, rooms] of props) {
      await q(
        `insert into crm_properties (id, office_id, number, name, address, branch_id, service_kind,
           property_type, price, rent_price, area_m2, rooms, status, occupancy,
           owner_contact_id, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now() - interval '50 days')
         on conflict do nothing`,
        [P[k], officeId, `DEMO-P-${String(k).padStart(3, "0")}`, name,
         J({ district: k === 3 ? "Хан-Уул" : "Баянзүрх", khoroo: String(k), complex: name.split(" ")[0], building: "1", unit: String(100 + k) }),
         branch, svc, type, price, rent, area, rooms, status, occ, owner, admin]
      );
    }
    await q(
      `insert into crm_property_roles (id, office_id, property_id, role, agent_profile_id)
       values ($1, $3, $4, 'sourcing', $6), ($2, $3, $5, 'sourcing', $6)
       on conflict do nothing`,
      [d(511), d(512), officeId, P[1], P[5], agent]
    );
    await q(
      `insert into crm_listing_agreements (id, office_id, property_id, number, signed_on, expires_on)
       values ($1, $2, $3, 'DEMO-LA-001', $4, $5) on conflict do nothing`,
      [d(521), officeId, P[1], day(-30), day(60)]
    );
    // Сул зогсолт: P2 өмнө нь 30 хоног сул байгаад түрээслэгдсэн; P3 одоо 20 хоног сул
    await q(
      `insert into crm_vacancy_periods (id, office_id, property_id, started_on, ended_on) values
         ($1, $3, $4, $6, $7), ($2, $3, $5, $8, null)
       on conflict do nothing`,
      [d(531), d(532), officeId, P[2], P[3], day(-150), day(-120), day(-20)]
    );

    // ── Боломжууд (O1…O6) ──
    const O = { 1: d(601), 2: d(602), 3: d(603), 4: d(604), 5: d(605), 6: d(606) };
    const opps = [
      // [key, pl, contact, lead, need, prop, owner, amount, expClose, state, stage, lostReason, createdOff]
      [1, pl1Qualified, C[1], L[1], d(301), P[1], agent, 450000000, day(30), "open", null, -18],
      [2, pl1Showing, C[2], L[2], d(302), P[1], agent, 380000000, day(45), "open", null, -14],
      [3, pl1Offer, C[4], null, null, P[1], admin, 520000000, day(20), "open", null, -10],
      [4, pl3Qualified, C[7], null, null, P[3], agent, 2800000, day(15), "open", null, -7],
      [5, pl1Won, C[8], L[6], null, P[5], agent, 450000000, day(-5), "won", null, -35],
      [6, pl1Lost, C[9], L[7], null, P[1], admin, 400000000, day(-2), "lost", lostPrice, -28],
    ];
    for (const [k, st, contact, lead, need, prop, owner, amount, exp, state, , createdOff] of opps) {
      await q(
        `insert into crm_opportunities (id, office_id, pipeline_id, stage_id, contact_id, property_id,
           need_profile_id, lead_id, owner_id, branch_id, amount, expected_close_on, state,
           lost_reason_id, lost_note, stage_entered_at, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         on conflict do nothing`,
        [O[k], officeId, st.pipeline_id, st.id, contact, prop, need, lead, owner, b1,
         amount, exp, state,
         state === "lost" ? lostPrice : null, state === "lost" ? "Үнийн санал зөрсөн" : null,
         iso(-2 * DAY), admin, iso(createdOff * DAY), iso(-2 * DAY)]
      );
    }
    // Санал (O3 — offer шатны G2 нотолгоо)
    await q(
      `insert into crm_offers (id, office_id, opportunity_id, direction, amount, valid_until, relayed_at, created_by)
       values ($1, $2, $3, 'offer', 520000000, $4, now() - interval '2 days', $5)
       on conflict do nothing`,
      [d(611), officeId, O[3], day(10), admin]
    );
    // Шатны түүх — энэ 7 хоногийн хөдөлгөөн (R-02/R-04 самбарт)
    const hist = [
      [d(621), O[1], pl1New.id, pl1Qualified.id, -2],
      [d(622), O[2], pl1Qualified.id, pl1Showing.id, -1],
      [d(623), O[3], pl1Showing.id, pl1Offer.id, -1],
      [d(624), O[5], pl1Contract.id, pl1Won.id, -2],
      [d(625), O[6], pl1Showing.id, pl1Lost.id, -3],
    ];
    for (const [id, opp, from, to, off] of hist) {
      await q(
        `insert into crm_stage_history (id, office_id, opportunity_id, from_stage_id, to_stage_id, moved_by, entered_at)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
        [id, officeId, opp, from, to, agent, iso(off * DAY)]
      );
    }

    // ── Үйл ажиллагааны бүртгэл (энэ 7 хоног) ──
    const acts = [
      // [id, contact, opp, lead, channel, purpose, outcome, next, nextDate, occurredOffH, feedback, owner]
      [d(701), C[1], O[1], L[1], "call", "follow_up", "advanced", "Гэрээний нөхцөл тохирох уулзалт", day(2), -30, null, agent],
      [d(702), C[1], O[1], L[1], "meeting", "negotiation", "advanced", "Санал бэлдэж илгээх", day(3), -6, null, agent],
      [d(703), C[2], O[2], L[2], "call", "follow_up", "open", "Үзлэгийн дараах санал авах залгалт", day(1), -50, null, agent],
      [d(704), C[2], O[2], L[2], "showing", "screening", "open", "Саналыг нь 24 цагт бүртгэх", day(1), -20, null, agent],
      [d(705), C[1], O[1], L[1], "showing", "screening", "advanced", "Дараагийн үзлэг товлох", day(4), -70, "price", agent],
      [d(706), C[3], null, L[3], "call", "screening", "open", "Хэрэгцээний профайл бөглөх", day(1), -28, null, agent],
      [d(707), C[4], O[3], null, "chat", "offer", "advanced", "Сөрөг саналын хариу авах", day(2), -26, null, admin],
      [d(708), C[7], O[4], null, "meeting", "screening", "advanced", "Түрээсийн нөхцөл танилцуулах", day(2), -48, null, agent],
      [d(709), C[8], O[5], null, "call", "service", "won", null, null, -100, null, agent],
      [d(710), C[6], null, null, "email", "service", "open", "Сарын тайлан илгээх", day(5), -12, null, admin],
    ];
    for (const [id, contact, opp, lead, ch, purpose, outcome, next, nextDate, offH, fb, owner] of acts) {
      await q(
        `insert into crm_activities (id, office_id, contact_id, opportunity_id, lead_id, channel, purpose,
           summary, outcome, next_step, next_step_date, occurred_at, backdated, feedback_category, owner_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, $13, $14, $12)
         on conflict do nothing`,
        [id, officeId, contact, opp, lead, ch, purpose,
         "Демо бүртгэл — " + ch, outcome, next, nextDate, iso(offH * 3600000), fb, owner]
      );
    }

    // ── Даалгавар (өнөөдөр + хэтэрсэн) ──
    const tasks = [
      [d(801), "Батболдод буцаан залгаж уулзалт баталгаажуулах", agent, iso(6 * 3600000), "pending"],
      [d(802), "Гэрээний баримтын бүрдэл шалгах (DEMO-S-001)", agent, iso(8 * 3600000), "in_progress"],
      [d(803), "Сарнайд үзлэгийн санал илгээх", agent, iso(-2 * DAY), "pending"],
      [d(804), "Сарын менежментийн бүртгэл бөглөх (DEMO-P-002)", admin, iso(3 * DAY), "pending"],
    ];
    for (const [id, title, resp, deadline, status] of tasks) {
      await q(
        `insert into tasks (id, office_id, created_by, responsible_id, title, status, priority, deadline)
         values ($1, $2, $3, $4, $5, $6, 'high', $7) on conflict do nothing`,
        [id, officeId, admin, resp, title, status, deadline]
      );
    }
    await q(
      `insert into crm_task_links (task_id, entity, entity_id, rule_code) values
         ($1, 'lead', $4, null), ($2, 'transaction', $5, 'D-09'), ($3, 'lead', $6, 'D-05')
       on conflict do nothing`,
      [d(801), d(802), d(803), L[1], d(901), L[2]]
    );

    // ── Хаагдсан хэлцэл (TX1 — KPI/шимтгэлийн эх) ──
    const TX1 = d(901);
    await q(
      `insert into crm_transactions (id, office_id, number, type, status, opportunity_id, property_id,
         amount, currency, fx_rate, opened_on, contracted_on, closed_on, file_completeness_pct, created_by, created_at, updated_at)
       values ($1, $2, 'DEMO-S-001', 'sale', 'closed', $3, $4, 450000000, 'MNT', 1,
         $5, $6, $7, 100, $8, $9, now())
       on conflict do nothing`,
      [TX1, officeId, O[5], P[5], day(-30), day(-20), day(-5), admin, iso(-30 * DAY)]
    );
    await q(
      `insert into crm_transaction_parties (id, office_id, transaction_id, contact_id, role) values
         ($1, $3, $4, $5, 'buyer'), ($2, $3, $4, $6, 'seller')
       on conflict do nothing`,
      [d(911), d(912), officeId, TX1, C[8], C[5]]
    );
    await q(
      `insert into crm_transaction_agent_roles (id, office_id, transaction_id, agent_profile_id, role, split_pct)
       values ($1, $2, $3, $4, 'selling', 100)
       on conflict do nothing`,
      [d(913), officeId, TX1, agent]
    );
    // Баримтууд (4 ангилал — 100% бүрдэл) + холбоос
    const docs = [
      [d(921), "contract", "Худалдах-худалдан авах гэрээ (демо)"],
      [d(922), "payment_proof", "Төлбөрийн баримт (демо)"],
      [d(923), "ownership", "Өмчлөлийн гэрчилгээ (демо)"],
      [d(924), "identity", "Иргэний баримт (демо)"],
    ];
    for (const [id, cat, title] of docs) {
      await q(
        `insert into crm_documents (id, office_id, category, title, storage_path, mime, uploaded_by)
         values ($1, $2, $3, $4, $5, 'application/pdf', $6) on conflict do nothing`,
        [id, officeId, cat, title, `crm-docs/${officeId}/demo-${id}.pdf`, admin]
      );
      await q(
        `insert into crm_document_links (document_id, entity, entity_id)
         values ($1, 'transaction', $2) on conflict do nothing`,
        [id, TX1]
      );
    }
    await q(
      `insert into crm_transaction_contracts (id, office_id, transaction_id, contract_type, number, signed_on, doc_id)
       values ($1, $2, $3, 'sale', 'DEMO-CT-001', $4, $5) on conflict do nothing`,
      [d(931), officeId, TX1, day(-20), d(921)]
    );
    await q(
      `insert into crm_payment_schedule_lines (id, office_id, transaction_id, due_on, amount, kind, paid_amount)
       values ($1, $2, $3, $4, 450000000, 'full', 450000000) on conflict do nothing`,
      [d(941), officeId, TX1, day(-7)]
    );
    for (const [i, label] of ["Түлхүүр хүлээлгэн өгсөн", "Тоолуурын заалт бүртгэсэн", "СӨХ-д мэдэгдсэн", "Акт үйлдсэн"].entries()) {
      await q(
        `insert into crm_handover_items (id, office_id, transaction_id, label, done, done_on, responsible_id, sort_order)
         values ($1, $2, $3, $4, true, $5, $6, $7) on conflict do nothing`,
        [d(951 + i), officeId, TX1, label, day(-6), agent, i]
      );
    }
    // Орлогын төлбөр — Санхүү баталгаажуулсан (KPI verified income + Д-25 босго давсан)
    await q(
      `insert into crm_payments (id, office_id, kind, transaction_id, schedule_line_id, paid_on, amount,
         currency, fx_rate, method, finance_verified_by, finance_verified_at, created_by, created_at)
       values ($1, $2, 'income', $3, $4, $5, 450000000, 'MNT', 1, 'bank', $6, $7, $6, $7)
       on conflict do nothing`,
      [d(961), officeId, TX1, d(941), day(-6), admin, iso(-5 * DAY)]
    );

    // ── МУТСТ демо (Д-25 босго → кейс + дохио, R-13) ──
    const CASE1 = d(971);
    await q(
      `insert into crm_aml_cases (id, office_id, contact_id, transaction_id, status, threshold_due_on, officer_id)
       values ($1, $2, $3, $4, 'open', $5, $6) on conflict do nothing`,
      [CASE1, officeId, C[8], TX1, day(4), admin]
    );
    await q(
      `insert into crm_aml_alerts (id, office_id, contact_id, transaction_id, payment_id, alert_kind,
         reported_by, category, observed, amount_mnt, payment_method, case_id)
       values ($1, $2, $3, $4, $5, 'threshold', $6, 'threshold',
         'Босго давсан төлбөр — 450,000,000₮ (Д-25 автомат дохио)', 450000000, 'bank', $7)
       on conflict do nothing`,
      [d(972), officeId, C[8], TX1, d(961), admin, CASE1]
    );

    // ── Түрээсийн менежмент ──
    const MA1 = d(1001), LSE1 = d(1002);
    await q(
      `insert into crm_management_agreements (id, office_id, number, owner_contact_id, start_on, end_on,
         fee_pct, repair_approval_limit, status, renewal_reminder_days, created_by)
       values ($1, $2, 'DEMO-MA-001', $3, $4, $5, 10, 500000, 'active', 30, $6)
       on conflict do nothing`,
      [MA1, officeId, C[6], day(-180), day(185), admin]
    );
    await q(
      `insert into crm_leases (id, office_id, number, property_id, tenant_contact_id, landlord_contact_id,
         start_on, end_on, monthly_rent, payment_day, grace_days, deposit_amount, deposit_holder,
         deposit_received_on, is_managed, management_agreement_id, duration_tier, status, created_by)
       values ($1, $2, 'DEMO-LS-001', $3, $4, $5, $6, $7, 2800000, 5, 3, 2800000, 'pmc',
         $6, true, $8, '12_plus', 'active', $9)
       on conflict do nothing`,
      [LSE1, officeId, P[2], C[7], C[6], day(-120), day(245), MA1, admin]
    );
    await q(`update crm_properties set active_lease_id = $1, management_agreement_id = $2 where id = $3`, [LSE1, MA1, P[2]]);
    await q(`update crm_properties set management_agreement_id = $1 where id = $2`, [MA1, P[3]]);

    // Нэхэмжлэх: 2 төлөгдсөн + 1 хоцролттой (12 хоног, R-09 d8_plus)
    const invs = [
      // [id, number, period, dueOff, status, sentOff]
      [d(1011), "DEMO-INV-001", monthFirst(-2), null, "paid"],
      [d(1012), "DEMO-INV-002", monthFirst(-1), null, "paid"],
      [d(1013), "DEMO-INV-003", monthFirst(0), -12, "sent"],
    ];
    for (const [id, number, period, dueOff, status] of invs) {
      const due = dueOff != null ? day(dueOff) : `${period.slice(0, 8)}05`;
      await q(
        `insert into crm_invoices (id, office_id, number, type, lease_id, recipient_contact_id,
           period_month, issued_on, due_on, amount, status, sent_at)
         values ($1, $2, $3, 'mgmt_fee', $4, $5, $6, $7, $8, 2800000, $9, $10)
         on conflict do nothing`,
        [id, officeId, number, LSE1, C[7], period, period, due, status, iso(-15 * DAY)]
      );
    }
    // Төлөгдсөн нэхэмжлэхийн орлогын төлбөрүүд (verified — R-14 орлогод)
    for (const [i, invId] of [d(1011), d(1012)].entries()) {
      await q(
        `insert into crm_payments (id, office_id, kind, invoice_id, lease_id, paid_on, amount, currency,
           fx_rate, method, finance_verified_by, finance_verified_at, created_by, created_at)
         values ($1, $2, 'income', $3, $4, $5, 2800000, 'MNT', 1, 'bank', $6, $7, $6, $7)
         on conflict do nothing`,
        [d(1021 + i), officeId, invId, LSE1, day(-60 + i * 30), admin, iso((-60 + i * 30) * DAY)]
      );
    }
    // Хоцролтын шатлал (Д-15/16 демо)
    await q(
      `insert into crm_arrears_escalations (id, office_id, invoice_id, lease_id, step, assigned_role, task_id, escalated_at)
       values ($1, $3, $4, $5, 1, 'agent', null, $6), ($2, $3, $4, $5, 2, 'team_lead', null, $7)
       on conflict do nothing`,
      [d(1031), d(1032), officeId, d(1013), LSE1, iso(-8 * DAY), iso(-4 * DAY)]
    );

    // Сарын бүртгэл (R-07): өнгөрсөн сар 100%, энэ сар дутуу (hold)
    await q(
      `insert into crm_monthly_records (id, office_id, agreement_id, property_id, lease_id, month, data,
         completeness_pct, commission_hold)
       values
       ($1, $3, $4, $5, $6, $7, $9, 100, false),
       ($2, $3, $4, $5, $6, $8, $10, 58.8, true)
       on conflict do nothing`,
      [d(1041), d(1042), officeId, MA1, P[2], LSE1, monthFirst(-1), monthFirst(0),
       J({ rent_collected: 2800000, note: "Демо — бүрэн" }), J({ note: "Демо — дутуу" })]
    );
    // Өмчлөгчийн тайлан (R-10): өнгөрсөн сар, хугацаандаа илгээгдсэн
    const prevStart = monthFirst(-1);
    const prevEnd = new Date(new Date(monthFirst(0) + "T00:00:00Z").getTime() - DAY).toISOString().slice(0, 10);
    await q(
      `insert into crm_owner_statements (id, office_id, agreement_id, owner_contact_id, period_start, period_end,
         income, expenses, mgmt_fee, detail, sent_at, acknowledged_at)
       values ($1, $2, $3, $4, $5, $6, 2800000, 150000, 280000, $7, $8, $9)
       on conflict do nothing`,
      [d(1051), officeId, MA1, C[6], prevStart, prevEnd,
       J({ lines: [{ label: "Түрээсийн орлого", amount: 2800000 }, { label: "Засварын зардал", amount: -150000 }] }),
       iso(-3 * DAY), iso(-1 * DAY)]
    );

    // ── Шимтгэл ──
    const CFG1 = d(1101);
    await q(
      `insert into crm_commission_config_versions (id, office_id, policy_code, payload, valid_from, created_by)
       values ($1, $2, 'PMC-SAL-POL-001', $3, '2020-01-01', $4)
       on conflict do nothing`,
      [CFG1, officeId, J({ demo: true, roles: { selling: 2.0, sourcing: 0.5 }, note: "Демо хувилбар — бодит хувийг тохиргооноос" }), admin]
    );
    const comms = [
      // [id, role, rate, base, amount, status, paid]
      [d(1111), "selling", 2.0, 450000000, 9000000, "reviewed", 0],
      [d(1112), "sourcing", 0.5, 450000000, 2250000, "calculated", 0],
    ];
    for (const [id, role, rate, base, amount, status, paid] of comms) {
      await q(
        `insert into crm_commission_records (id, office_id, source_type, transaction_id, recipient_type,
           recipient_profile_id, role, applied_rate_pct, base_amount, amount, paid_amount, status,
           config_version_id, evidence)
         values ($1, $2, 'transaction', $3, 'agent', $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict do nothing`,
        [id, officeId, TX1, agent, role, rate, base, amount, paid, status, CFG1,
         J({ txn: "DEMO-S-001", income_verified: true, split: "100% selling" })]
      );
    }
    // ҮХХ багийн сарын PM тооцоо (F-466) — олгогдсон
    await q(
      `insert into crm_commission_records (id, office_id, source_type, lease_id, monthly_record_id,
         recipient_type, role, applied_rate_pct, base_amount, amount, paid_amount, status,
         config_version_id, evidence)
       values ($1, $2, 'lease_monthly', $3, $4, 'team', 'pm_team', 10, 2800000, 280000, 280000, 'paid', $5, $6)
       on conflict do nothing`,
      [d(1113), officeId, LSE1, d(1041), CFG1, J({ month: monthFirst(-1), record_complete: true })]
    );

    // ── Дараах үйлчилгээ: NPS, реферал, гомдол ──
    await q(
      `insert into crm_nps_surveys (id, office_id, transaction_id, contact_id, sent_at, score, comment, answered_at)
       values ($1, $2, $3, $4, $5, 9, 'Маш сайн үйлчилгээ байлаа — демо', $6)
       on conflict do nothing`,
      [d(1201), officeId, TX1, C[8], iso(-4 * DAY), iso(-3 * DAY)]
    );
    await q(
      `insert into crm_referrals (id, office_id, referrer_contact_id, lead_id)
       values ($1, $2, $3, $4) on conflict do nothing`,
      [d(1202), officeId, C[8], L[5]]
    );
    await q(
      `insert into crm_complaints (id, office_id, contact_id, source, severity, description, status,
         resolved_at, resolution, created_by)
       values ($1, $2, $3, 'manual', 'normal', 'Засварын хүсэлтийн хариу удсан (демо)', 'resolved',
         $4, 'Засварын багтай холбож шийдвэрлэсэн', $5)
       on conflict do nothing`,
      [d(1203), officeId, C[7], iso(-2 * DAY), admin]
    );

    // ── Дүрмийн гүйлтийн лог (R-12 Д-30 тоолуур) ──
    const runCnt = await q(
      "select count(*)::int as c from crm_rule_runs where office_id = $1 and rule_code = 'D-30'",
      [officeId]
    );
    if (runCnt.rows[0].c === 0) {
      await q(
        `insert into crm_rule_runs (office_id, rule_code, entity, entity_id, status, result) values
           ($1, 'D-30', 'property', $2, 'ok', '{"demo":true}'),
           ($1, 'D-30', 'property', $3, 'ok', '{"demo":true}')`,
        [officeId, P[3], P[1]]
      );
    }

    await q("commit");
    console.log("✓ CRM демо өгөгдөл амжилттай орлоо.");
    console.log("  Самбарууд: /office/crm, /office/crm/reports, /agent/crm");
    console.log("  Демо объектууд DEMO- угтвартай дугаараар ялгагдана.");
  } catch (e) {
    await q("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("✗ Демо seed алдаа:", e.message);
  process.exit(1);
});

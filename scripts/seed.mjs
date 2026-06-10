// ============================================================
// Нэми — mock дата seed (Phase 1)
// legacy/assets/js/data.js-ийг ачаалж remote DB рүү оруулна.
// Ажиллуулах:  node scripts/seed.mjs
// Дахин ажиллуулж болно (seed мөрүүдийг эхэлж устгана).
// ============================================================
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- .env.local-оос SUPABASE_DB_URL уншина ----
function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error(".env.local-д SUPABASE_DB_URL алга");

// ---- data.js-ийг vm-ээр ачаалж NEMI_DATA авна ----
function loadData() {
  const code = fs.readFileSync(path.join(ROOT, "legacy/assets/js/data.js"), "utf8");
  const sandbox = { window: {}, Intl, console, Date };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.NEMI_DATA;
}
const D = loadData();

const J = (v) => (v == null ? null : JSON.stringify(v));

async function main() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    await q("begin");

    // ---- Цэвэрлэх (idempotent) ----
    await q("delete from messages");
    await q("delete from conversations where legacy_id is not null");
    await q("delete from reviews");
    await q("delete from ai_valuations");
    await q("delete from listing_photos");
    await q("delete from viewings where legacy_id is not null");
    await q("delete from leads where legacy_id is not null");
    await q("delete from listings where legacy_id is not null");
    // ТЭМДЭГЛЭЛ: offices/agents-ийг УСТГАХГҮЙ — legacy_id-аар upsert хийнэ.
    // (Устгавал FK on delete set null нь office_admin/agent холболтыг орхигдуулна.)

    // ---- offices ----
    const officeIdByLegacy = {};
    const officeIdByName = {};
    for (const o of D.offices) {
      const r = await q(
        `insert into offices (legacy_id, name, logo, color, verified, agents_count, listings_count)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (legacy_id) do update set
           name = excluded.name, logo = excluded.logo, color = excluded.color, verified = excluded.verified
         returning id`,
        [o.id, o.name, o.logo, o.color, o.verified, o.agents, o.listings]
      );
      officeIdByLegacy[o.id] = r.rows[0].id;
      officeIdByName[o.name] = r.rows[0].id;
    }
    console.log(`✓ offices: ${D.offices.length}`);

    // ---- agents ----
    const agentIdByLegacy = {};
    const agentIdByName = {};
    for (const a of D.agents) {
      const r = await q(
        `insert into agents
           (legacy_id, office_id, display_name, phone, avatar, rating, reviews_count,
            years, sold, listings_count, verified, premier, response_time,
            languages, areas, specialty, bio, sub_ratings)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
         on conflict (legacy_id) do update set
           office_id = excluded.office_id, display_name = excluded.display_name, phone = excluded.phone,
           avatar = excluded.avatar, years = excluded.years, sold = excluded.sold, verified = excluded.verified,
           premier = excluded.premier, response_time = excluded.response_time, languages = excluded.languages,
           areas = excluded.areas, specialty = excluded.specialty, bio = excluded.bio, sub_ratings = excluded.sub_ratings
         returning id`,
        [
          a.id, officeIdByLegacy[a.officeId], a.name, a.phone, a.avatar,
          a.rating, a.reviews, a.years, a.sold, a.listings, a.verified, a.premier,
          a.responseTime, a.languages, a.areas, a.specialty, a.bio, J(a.subRatings),
        ]
      );
      agentIdByLegacy[a.id] = r.rows[0].id;
      agentIdByName[a.name] = r.rows[0].id;
    }
    console.log(`✓ agents: ${D.agents.length}`);

    // ---- listings (+ photo + ai_valuation) ----
    // Зарим зарыг ТҮРЭЭС болгож, сарын үнэ + төлбөрийн нөхцөл (advance+deposit) онооно.
    const RENT = {
      "L-2403": { price: 2_500_000, advance: 1, deposit: 2 },
      "L-2404": { price: 1_500_000, advance: 1, deposit: 1 },
      "L-2408": { price: 1_800_000, advance: 2, deposit: 1 },
      "L-2411": { price: 1_600_000, advance: 1, deposit: 1 },
    };
    const listingIdByLegacy = {};
    const listingAgentByLegacy = {};
    for (const l of D.listings) {
      const rent = RENT[l.id] ?? null;
      const isRent = rent != null;
      const price = isRent ? rent.price : l.price;
      const perM2 = isRent ? (l.area ? Math.round(rent.price / l.area) : null) : l.pricePerM2;
      const r = await q(
        `insert into listings
           (legacy_id, agent_id, title, district, type, rooms, area, floor, price,
            price_per_m2, year, parking, status, verified, hot, featured, shared,
            description, amenities, ai_score, ai_note, photo, deal_type,
            rent_advance_months, rent_deposit_months, location)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
                 ST_SetSRID(ST_MakePoint($26,$27),4326)::geography)
         returning id`,
        [
          l.id, agentIdByLegacy[l.agent], l.title, l.district, l.type, l.rooms,
          l.area, l.floor, price, perM2, l.year || null, l.parking, l.status,
          l.verified, l.hot, l.featured, l.shared, l.desc ?? null,
          l.amenities ?? [], l.aiScore, l.aiNote, l.photo, isRent ? "rent" : "sale",
          isRent ? rent.advance : null, isRent ? rent.deposit : null, l.lng, l.lat,
        ]
      );
      const id = r.rows[0].id;
      listingIdByLegacy[l.id] = id;
      listingAgentByLegacy[l.id] = agentIdByLegacy[l.agent];

      await q(
        `insert into listing_photos (listing_id, url, sort_order, is_primary)
         values ($1,$2,0,true)`,
        [id, l.photo]
      );
      await q(
        `insert into ai_valuations (listing_id, score, note, model)
         values ($1,$2,$3,'seed')`,
        [id, l.aiScore, l.aiNote]
      );
    }
    console.log(`✓ listings: ${D.listings.length} (+ photos, ai_valuations)`);

    // ---- reviews (агент бүрд хэд хэдийг pool-оос цувуулж онооно) ----
    let ri = 0;
    let reviewCount = 0;
    for (const agent of D.agents) {
      const n = agent.premier ? 5 : 3; // premier агентад илүү тойм
      for (let k = 0; k < n; k++) {
        const rv = D.reviewPool[ri % D.reviewPool.length];
        ri++;
        await q(
          `insert into reviews (agent_id, author_name, area, deal_type, rating, text, verified, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [agentIdByName[agent.name], rv.name, rv.area, rv.type, rv.rating, rv.text, rv.verified, rv.date]
        );
        reviewCount++;
      }
    }
    console.log(`✓ reviews: ${reviewCount}`);

    // ---- leads (listing-ээс агентыг гаргана) ----
    for (const ld of D.leads) {
      await q(
        `insert into leads (legacy_id, agent_id, listing_id, name, phone, source, stage, score, note, last_touch)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          ld.id, listingAgentByLegacy[ld.listing], listingIdByLegacy[ld.listing],
          ld.name, ld.phone, ld.source, ld.stage, ld.score, ld.note, ld.lastTouch,
        ]
      );
    }
    console.log(`✓ leads: ${D.leads.length}`);

    // ---- conversations (chats) + messages ----
    const convIdByLegacy = {};
    for (const c of D.chats) {
      const r = await q(
        `insert into conversations (legacy_id, listing_id, agent_id, last_message_at)
         values ($1,$2,$3, now()) returning id`,
        [c.id, listingIdByLegacy[c.listing], agentIdByName[c.name]]
      );
      convIdByLegacy[c.id] = r.rows[0].id;
    }
    // messages thread → эхний чат (c-1)
    const firstConv = convIdByLegacy[D.chats[0].id];
    for (const m of D.messages) {
      await q(
        `insert into messages (conversation_id, sender_role, body)
         values ($1,$2,$3)`,
        [firstConv, m.from, m.text]
      );
    }
    console.log(`✓ conversations: ${D.chats.length}, messages: ${D.messages.length}`);

    // ---- viewings ----
    for (const v of D.viewings) {
      await q(
        `insert into viewings (legacy_id, listing_id, agent_id, scheduled_at, status)
         values ($1,$2,$3,$4,$5)`,
        [v.id, listingIdByLegacy[v.listing], agentIdByLegacy[v.agent], `${v.date}T${v.time}:00`, v.status]
      );
    }
    console.log(`✓ viewings: ${D.viewings.length}`);

    await q("commit");
    console.log("\n🎉 Seed амжилттай дууслаа.");
  } catch (e) {
    await q("rollback");
    console.error("❌ Seed алдаа, rollback хийлээ:\n", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

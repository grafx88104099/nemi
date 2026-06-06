// ============================================================
// Тест дата: agent@nemi.mn хэрэглэгчид 10 зар оруулна.
// Ажиллуулах:  node scripts/seed-agent-test.mjs
// Idempotent — TEST-AGENT-% legacy_id-тай мөрүүдийг эхэлж устгана.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- .env.local ачаална ----
const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
for (const line of txt.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error(".env.local-д SUPABASE_DB_URL алга");

const AGENT_EMAIL = "agent@nemi.mn";

const IMG = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;

// ---- 10 тест зар ----
const LISTINGS = [
  { title: "2 өрөө · Зайсан тауэр", district: "Хан-Уул", type: "Орон сууц", rooms: 2, area: 64, floor: "8/16", price: 285_000_000, year: 2021, parking: 1, status: "active", ai: 82, lng: 106.9135, lat: 47.8908, photo: "1502672260266-1c1ef2d93688", desc: "Зайсан тауэрын нарлаг 2 өрөө байр. Тавилгатай.", amenities: ["Лифт", "Зогсоол", "Камер"] },
  { title: "3 өрөө · River Garden", district: "Хан-Уул", type: "Орон сууц", rooms: 3, area: 110, floor: "12/18", price: 495_000_000, year: 2020, parking: 1, status: "active", ai: 88, lng: 106.9201, lat: 47.8855, photo: "1512917774080-9991f1c4c750", desc: "River Garden хотхоны premium 3 өрөө.", amenities: ["Лифт", "Хамгаалалт", "Тоглоомын талбай"] },
  { title: "1 өрөө · Сансар", district: "Баянзүрх", type: "Орон сууц", rooms: 1, area: 42, floor: "5/9", price: 165_000_000, year: 2015, parking: 0, status: "active", ai: 74, lng: 106.9412, lat: 47.9158, photo: "1493809842364-78817add7ffb", desc: "Сансарын төв, тохилог 1 өрөө.", amenities: ["Лифт"] },
  { title: "4 өрөө дуплекс · Хан-Уул", district: "Хан-Уул", type: "Орон сууц", rooms: 4, area: 185, floor: "15/16", price: 720_000_000, year: 2022, parking: 2, status: "active", ai: 91, lng: 106.9050, lat: 47.8790, photo: "1560448204-e02f11c3d0e2", desc: "Уулын үзэмжтэй дуплекс байр, 2 зогсоол.", amenities: ["Лифт", "Зогсоол", "Камер", "Фитнес"] },
  { title: "Хаус · Их тэнгэр", district: "Хан-Уул", type: "Хаус", rooms: 5, area: 280, floor: "-", price: 1_350_000_000, year: 2019, parking: 3, status: "active", ai: 86, lng: 106.8702, lat: 47.8521, photo: "1568605114967-8130f3a36994", desc: "Их тэнгэр амралтын бүсийн тусгай хаус.", amenities: ["Гараж", "Цэцэрлэг", "Камер"] },
  { title: "2 өрөө · Сүхбаатар дүүрэг", district: "Сүхбаатар", type: "Орон сууц", rooms: 2, area: 58, floor: "3/5", price: 235_000_000, year: 2010, parking: 0, status: "draft", ai: 70, lng: 106.9177, lat: 47.9201, photo: "1502005229762-cf1b2da7c5d6", desc: "Хотын төвд, барилгын ойролцоо.", amenities: ["Дэлгүүр ойр"] },
  { title: "Оффис · Шангри-Ла орчим", district: "Сүхбаатар", type: "Оффис", rooms: 0, area: 120, floor: "7/22", price: 540_000_000, year: 2018, parking: 2, status: "active", ai: 80, lng: 106.9170, lat: 47.9135, photo: "1497366216548-37526070297c", desc: "А зэрэглэлийн оффисын талбай.", amenities: ["Лифт", "Хамгаалалт", "Зогсоол"] },
  { title: "Газар · Налайх", district: "Налайх", type: "Газар", rooms: 0, area: 700, floor: "-", price: 95_000_000, year: null, parking: 0, status: "review", ai: 65, lng: 107.2400, lat: 47.7720, photo: "1500382017468-9049fed747ef", desc: "Гэр бүлийн орон сууц барих 0.07 га газар.", amenities: ["Цахилгаан", "Зам"] },
  { title: "3 өрөө · Encanto тауэр", district: "Сүхбаатар", type: "Орон сууц", rooms: 3, area: 96, floor: "10/22", price: 435_000_000, year: 2021, parking: 1, status: "active", ai: 87, lng: 106.9250, lat: 47.9180, photo: "1545324418-cc1a3fa10c00", desc: "Encanto тауэрын төвийн 3 өрөө.", amenities: ["Лифт", "Зогсоол", "Камер"] },
  { title: "Худалдааны талбай · Баянгол", district: "Баянгол", type: "Худалдааны талбай", rooms: 0, area: 85, floor: "1/9", price: 310_000_000, year: 2016, parking: 1, status: "active", ai: 78, lng: 106.8600, lat: 47.9120, photo: "1441986300917-64674bd600d8", desc: "Гудамжны фасадтай худалдааны талбай.", amenities: ["Витрин", "Зогсоол"] },
];

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = (t, p) => client.query(t, p);
  try {
    // ---- agent@nemi.mn → agents.id олно ----
    const ag = await q(
      `select a.id, a.display_name, a.status
         from public.agents a
         join auth.users u on u.id = a.profile_id
        where u.email = $1
        limit 1`,
      [AGENT_EMAIL]
    );
    if (!ag.rows.length) throw new Error(`${AGENT_EMAIL}-д холбогдсон agent мөр алга. Эхлээд create-test-users.mjs ажиллуулсан уу?`);
    const agentId = ag.rows[0].id;
    console.log(`✓ agent: ${ag.rows[0].display_name} (${agentId}), status=${ag.rows[0].status}`);

    await q("begin");
    // ---- хуучин тест мөрүүдийг цэвэрлэх ----
    const del = await q(
      `delete from public.listings where legacy_id like 'TEST-AGENT-%' returning id`
    );
    if (del.rowCount) console.log(`↺ хуучин тест зар устгав: ${del.rowCount}`);

    let n = 0;
    for (const l of LISTINGS) {
      n++;
      const legacy = `TEST-AGENT-${String(n).padStart(2, "0")}`;
      const perM2 = l.area ? Math.round(l.price / l.area) : null;
      const r = await q(
        `insert into public.listings
           (legacy_id, agent_id, title, district, type, rooms, area, floor, price,
            price_per_m2, year, parking, status, verified, description, amenities,
            ai_score, ai_note, photo, location)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                 ST_SetSRID(ST_MakePoint($20,$21),4326)::geography)
         returning id`,
        [
          legacy, agentId, l.title, l.district, l.type, l.rooms, l.area, l.floor,
          l.price, perM2, l.year, l.parking, l.status, l.ai >= 85,
          l.desc, l.amenities, l.ai, `AI үнэлгээ ${l.ai}`, IMG(l.photo), l.lng, l.lat,
        ]
      );
      const id = r.rows[0].id;
      await q(
        `insert into public.listing_photos (listing_id, url, sort_order, is_primary)
         values ($1,$2,0,true)`,
        [id, IMG(l.photo)]
      );
      await q(
        `insert into public.ai_valuations (listing_id, score, note, model)
         values ($1,$2,$3,'test-seed')`,
        [id, l.ai, `AI үнэлгээ ${l.ai}`]
      );
      console.log(`  + ${legacy}  ${l.title}  (${l.status})`);
    }

    await q("commit");
    console.log(`\n🎉 ${n} тест зар амжилттай орлоо → ${AGENT_EMAIL}`);
  } catch (e) {
    await q("rollback").catch(() => {});
    console.error("❌ алдаа, rollback:\n", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

# Нэми — Production хөгжүүлэлтийн бүрэн төлөвлөгөө

> Статик прототипийг **Next.js + Supabase** дээр ажиллах бодит систем болгон хувиргах төлөвлөгөө.
> Огноо: 2026-06-01 · Хувилбар: v1.0 (planning)

---

## 0. Шийдвэрлэсэн чиглэл

| Асуудал | Сонголт |
|---------|---------|
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** |
| Backend | **Supabase** (Postgres + Auth + Storage + Realtime + Edge Functions) |
| Интеграц | AI оноо, төлбөр (QPay), OAuth — **бүгд бодитоор** |
| Styling | Tailwind CSS + одоогийн брэнд токенуудыг (CSS variables) хадгална |
| Hosting | Frontend → **Vercel**, Backend → **Supabase Cloud** |

---

## 1. Технологийн стек

### Frontend
- **Next.js 15** (App Router, Server Components, Server Actions)
- **TypeScript** (strict)
- **Tailwind CSS** — `styles.css`-ийн `:root` токенуудыг `tailwind.config.ts` болон `globals.css`-д шилжүүлнэ (улбар шар брэнд өнгө хадгална)
- **shadcn/ui** эсвэл өөрийн компонент сан (одоогийн card/badge/btn загварыг хадгалах)
- **TanStack Query** — client-side кэш, optimistic update
- **react-hook-form + zod** — форм ба валидаци
- **Mapbox GL JS** эсвэл **MapLibre** — газрын зураг (listings-ийн lat/lng)

### Backend (Supabase)
- **Postgres 15** + өргөтгөлүүд: `postgis` (гео хайлт), `pg_trgm` (текст хайлт), `pgcrypto`
- **Supabase Auth** — email/нууц үг, **Google + Facebook OAuth**, утасны OTP (сонголтоор)
- **Supabase Storage** — зарын зураг, агентын аватар, баримт бичиг
- **Realtime** — чат, notification
- **Edge Functions (Deno)** — AI scoring, QPay webhook, имэйл/SMS, тооцоолол

### Гадаад үйлчилгээ
- **AI:** Anthropic Claude эсвэл OpenAI — зарын `aiScore`, тайлбар үүсгэлт, үнэлгээ
- **Төлбөр:** **QPay** (Монгол) — Premier захиалга, банкны интеграц
- **Имэйл:** Resend эсвэл Supabase SMTP
- **SMS:** Монголын SMS gateway (OTP, notification)

---

## 2. Өгөгдлийн загвар (Database Schema)

Одоогийн `assets/js/data.js`-ээс гаргаж авсан. Бүх хүснэгт RLS-тэй.

```
auth.users (Supabase built-in)
│
├── profiles                 -- хэрэглэгчийн профайл (role: buyer | agent | office_admin | admin)
│     id (uuid, = auth.uid)
│     full_name, avatar_url, phone, email, role, created_at
│
├── offices                  -- үл хөдлөхийн оффис
│     id, name, logo, color, verified, agents_count, listings_count
│
├── agents                   -- агент (profile + office холбоос)
│     id, profile_id → profiles, office_id → offices
│     phone, rating, reviews_count, years, sold, verified, premier
│     response_time, languages[], areas[], specialty, bio
│     sub_ratings (jsonb: knowledge/process/response/negotiation)
│
├── listings                 -- зар
│     id, agent_id → agents, title, district, type, rooms, area, floor
│     price, price_per_m2, year, parking, status (active|draft|review|sold)
│     verified, hot, featured, shared, description, amenities[]
│     location (geography POINT) ← lat/lng-г PostGIS-д хадгална
│     created_at, updated_at
│
├── listing_photos           -- зарын зургууд (Storage)
│     id, listing_id → listings, url, sort_order, is_primary
│
├── ai_valuations            -- AI үнэлгээний кэш
│     id, listing_id → listings, score, note, model, raw (jsonb), created_at
│
├── favorites                -- хадгалсан зар
│     user_id → profiles, listing_id → listings, created_at  (PK: хоёулаа)
│
├── saved_searches           -- хадгалсан хайлт + сэрэмжлүүлэг
│     id, user_id, filters (jsonb), alert_enabled
│
├── recently_viewed          -- сүүлд үзсэн
│     user_id, listing_id, viewed_at
│
├── leads                    -- агентын CRM лид
│     id, agent_id → agents, listing_id → listings, name, phone
│     source, stage (new|contacted|viewing|offer|closed|lost)
│     score, note, last_touch_at, created_at
│
├── conversations            -- чат харилцаа
│     id, listing_id → listings, buyer_id → profiles, agent_id → agents
│     last_message_at
│
├── messages                 -- чатын мессеж (Realtime)
│     id, conversation_id → conversations, sender_id, body, read_at, created_at
│
├── viewings                 -- үзлэгийн цаг товлох
│     id, listing_id, agent_id, buyer_id, scheduled_at
│     status (pending|confirmed|done|cancelled)
│
├── reviews                  -- агентын сэтгэгдэл
│     id, agent_id → agents, author_id → profiles, listing_id
│     rating, sub_ratings (jsonb), text, deal_type, verified, created_at
│
├── subscriptions            -- Premier захиалга (төлбөр)
│     id, agent_id → agents, plan, status, current_period_end
│     qpay_invoice_id, created_at
│
├── payments                 -- төлбөрийн гүйлгээ
│     id, subscription_id, amount, currency, qpay_payment_id, status, paid_at
│
└── notifications            -- мэдэгдэл
      id, user_id, type, title, body, link, read_at, created_at
```

### Гол шилжүүлэлтүүд
- `price: 520_000_000` → `bigint` (төгрөгийг бүхэл тоогоор)
- `lat/lng` → `location geography(POINT)` (гео хайлтад `ST_DWithin` ашиглана)
- `languages/areas/amenities` → `text[]` эсвэл тусдаа lookup хүснэгт
- `aiScore/aiNote` → `ai_valuations` хүснэгт рүү (кэшлэх, дахин тооцоолох боломжтой)

---

## 3. Аюулгүй байдал — Row Level Security (RLS)

Бүх хүснэгтэд RLS заавал. Гол бодлогууд:

| Хүснэгт | Уншина | Засна |
|---------|--------|-------|
| `listings` | бүгд (status=active), эзэмшигч агент (бүх статус) | зөвхөн эзэмшигч агент / тухайн оффисын админ |
| `favorites`, `saved_searches`, `recently_viewed` | зөвхөн эзэн | зөвхөн эзэн |
| `leads` | зөвхөн тухайн агент + оффис админ | зөвхөн тэдгээр |
| `messages` | зөвхөн харилцааны 2 тал | зөвхөн илгээгч |
| `reviews` | бүгд | зөвхөн зохиогч (худалдан авсан баталгаатай бол) |
| `subscriptions/payments` | зөвхөн эзэн агент | зөвхөн серверийн service role |

- `aiScore`, `verified`, `premier` зэрэг **итгэлцэлтэй талбаруудыг** хэрэглэгч өөрөө бичихгүй — зөвхөн Edge Function (service role) бичнэ.
- Role шалгалтыг `auth.jwt()` болон `profiles.role`-оор хийнэ.

---

## 4. Хөгжүүлэлтийн үе шатууд (Phases)

### Phase 0 — Суурь тавих (1 долоо хоног)
- [ ] Git repo эхлүүлэх (одоо git байхгүй), `.gitignore`, монорепо бүтэц
- [ ] Next.js 15 + TS + Tailwind scaffold
- [ ] Supabase төсөл үүсгэх (dev + prod орчин)
- [ ] Орчны хувьсагч (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE`, AI key, QPay key
- [ ] CI/CD: GitHub Actions → Vercel preview deploy
- [ ] `styles.css` → Tailwind токен болгон шилжүүлэх (брэнд өнгө, shadow, font)

### Phase 1 — Өгөгдлийн загвар (1 долоо хоног)
- [ ] Supabase migration-ууд (`supabase/migrations/*.sql`) — дээрх бүх хүснэгт
- [ ] PostGIS, pg_trgm өргөтгөл идэвхжүүлэх
- [ ] RLS бодлогууд бичих
- [ ] Seed script — `data.js`-ийн mock датаг бодит DB рүү оруулах (12 зар, 12 агент, 4 оффис г.м.)
- [ ] TypeScript төрлүүдийг автоматаар үүсгэх (`supabase gen types`)

### Phase 2 — Нэвтрэлт (Auth) (1 долоо хоног)
- [ ] Supabase Auth тохиргоо: email/нууц үг
- [ ] **Google + Facebook OAuth** (login.html-д аль хэдийн icon байгаа)
- [ ] Утасны OTP (сонголтоор)
- [ ] `profiles` хүснэгт + signup trigger (auth.users → profiles)
- [ ] Role-based routing (buyer / agent / office_admin)
- [ ] `login.html`, `agent-signup.html` хуудсуудыг хувиргах
- [ ] Middleware — хамгаалагдсан зам (dashboard, account г.м.)

### Phase 3 — Дизайн систем + layout (1 долоо хоног)
- [ ] `NEMI.topbar`, `NEMI.footer`, `NEMI.logoSVG` → React компонент
- [ ] Icon set (`I`) → `lucide-react` эсвэл өөрийн icon компонент
- [ ] `listingCard`, badge, avatar г.м. → дахин ашиглах компонент
- [ ] Layout, navigation, responsive (одоогийн `hide-sm` гэх мэт)

### Phase 4 — Үндсэн уншлагын хуудсууд (2 долоо хоног)
- [ ] `index` (нүүр) — featured зар, statistics
- [ ] `listings` — жагсаалт + шүүлтүүр + хуудаслалт
- [ ] `listing` — дэлгэрэнгүй (зураг галерей, агент, AI оноо, газрын зураг)
- [ ] `agents` — агентын жагсаалт + шүүлт
- [ ] `agent-profile` — агентын профайл + сэтгэгдэл
- [ ] `office`, `partners`, `news`, `home-loans` зэрэг статик/контент хуудсууд

### Phase 5 — Хэрэглэгчийн боломжууд (1–2 долоо хоног)
- [ ] `favorites` — хадгалах/устгах (optimistic)
- [ ] `recently-viewed` — автомат бичих
- [ ] `saved-searches` + имэйл сэрэмжлүүлэг
- [ ] `tours` — үзлэгийн цаг товлох
- [ ] `account` — профайл засах, тохиргоо
- [ ] `my-home`, `your-rental`, `my-team` хуудсууд

### Phase 6 — Агентын самбар + CRM (2 долоо хоног)
- [ ] `agent` / `dashboard` — статистик, лид
- [ ] Зар нэмэх/засах/устгах (CRUD)
- [ ] **Storage** — зарын зураг upload (resize, drag-drop, эрэмбэлэх)
- [ ] Лид удирдлага (kanban: new→contacted→viewing→offer→closed)
- [ ] `rental-manager` — түрээс удирдлага

### Phase 7 — Оффис админ (1 долоо хоног)
- [ ] Оффисын агентуудыг удирдах
- [ ] Бүх зарын тойм, статистик
- [ ] Баталгаажуулалт (verified) удирдлага

### Phase 8 — Realtime чат + мэдэгдэл (1–2 долоо хоног)
- [ ] `conversations` + `messages` хүснэгт + Realtime subscription
- [ ] Чат UI (одоогийн mock messages-ийг бодит болгох)
- [ ] Уншсан/уншаагүй төлөв, notification badge
- [ ] Push notification (Web Push сонголтоор)

### Phase 9 — AI үнэлгээ (бодит) (1 долоо хоног)
- [ ] **Edge Function: `valuate-listing`** — зарын дата → Claude/OpenAI → `aiScore` + тайлбар
- [ ] Зах зээлийн харьцуулалт (ижил дүүрэг/төрлийн зарууд)
- [ ] Үр дүнг `ai_valuations`-д кэшлэх, зар шинэчлэгдэхэд дахин тооцоолох
- [ ] AI тайлбар үүсгэгч (зарын description туслах)
- [ ] `ai.html` хуудасны боломжуудыг бодит болгох

### Phase 10 — Төлбөр (QPay) + Premier (1–2 долоо хоног)
- [ ] **QPay интеграц** — invoice үүсгэх, QR код
- [ ] **Edge Function: QPay webhook** — төлбөр баталгаажуулах → `subscriptions` идэвхжүүлэх
- [ ] Premier түвшний эрх (онцлох зар, badge)
- [ ] `partners.html` (Premier) худалдан авах урсгал
- [ ] Захиалгын сунгалт, төлбөрийн түүх

### Phase 11 — Газрын зураг + гео хайлт (1 долоо хоног)
- [ ] Mapbox/MapLibre интеграц
- [ ] Газрын зураг дээр зар харуулах (cluster)
- [ ] "Энэ хавьд хайх" — PostGIS `ST_DWithin` радиусын хайлт
- [ ] Газрын зургийг listing/listings хуудсанд

### Phase 12 — Хайлт ба шүүлтүүр (1 долоо хоног)
- [ ] Full-text хайлт (pg_trgm) — гарчиг, дүүрэг
- [ ] Үнэ/өрөө/талбай/төрөл/огноо шүүлтүүр
- [ ] Эрэмбэлэлт (үнэ, AI оноо, шинэлэг)
- [ ] URL query sync (`listings.html?id=...` стиль хадгалах)

### Phase 13 — Тест, аюулгүй байдал, гүйцэтгэл (1–2 долоо хоног)
- [ ] Unit тест (vitest), E2E тест (Playwright)
- [ ] RLS бодлогын тест (хэн юу хийж чадахыг шалгах)
- [ ] Security review (`/security-review`) — auth, RLS, XSS, төлбөрийн урсгал
- [ ] Гүйцэтгэл — индекс, query оновчлол, зураг (next/image)
- [ ] Хүртээмж (a11y), Lighthouse

### Phase 14 — Production deploy (1 долоо хоног)
- [ ] Vercel prod + Supabase prod орчин
- [ ] Domain, SSL, имэйл domain (SPF/DKIM)
- [ ] Monitoring: Sentry (алдаа), Supabase logs, analytics
- [ ] Backup бодлого, migration урсгал
- [ ] Хэрэглэгчийн баримт / нөхцөл, нууцлал

---

## 5. Файл/директорын зорилтот бүтэц

```
nemi/
├── app/                      # Next.js App Router
│   ├── (public)/             # нүүр, listings, agents, listing detail
│   ├── (auth)/               # login, signup
│   ├── (dashboard)/          # agent, office, account (хамгаалагдсан)
│   └── api/                  # route handlers (webhook гэх мэт)
├── components/               # дахин ашиглах UI (topbar, footer, listingCard...)
├── lib/
│   ├── supabase/             # client, server, middleware
│   ├── ai/                   # valuation helpers
│   └── qpay/                 # төлбөрийн клиент
├── supabase/
│   ├── migrations/           # SQL migration-ууд
│   ├── functions/            # Edge Functions (Deno)
│   └── seed.sql              # mock дата
├── types/                    # generated DB types
└── tailwind.config.ts
```

---

## 6. Migration стратеги (одоогийн прототипийг хадгалах)

1. Одоогийн 27 HTML-ийг **дизайн лавлагаа** болгон хадгална (`/legacy` фолдер).
2. Хуудас бүрийг Next.js route болгон **нэг нэгээр** хувиргана (Phase 4–7).
3. `data.js` → `seed.sql` (нэг удаагийн дата шилжүүлэлт).
4. `app.js`-ийн helper-уудыг React компонент/util болгоно.
5. `inline.py` build процессыг **устгана** (Next.js build орлоно).

---

## 7. Эрсдэл ба анхаарах зүйл

| Эрсдэл | Шийдэл |
|--------|--------|
| QPay sandbox/prod ялгаа | Эхлээд sandbox, webhook-ийг сайн тест |
| AI зардал (token) | Үр дүнг кэшлэх, зөвхөн зар өөрчлөгдөхөд дахин тооцоолох |
| RLS алдаа → дата задрах | Бүх policy-г тестээр баталгаажуулах, security review |
| Монгол текст хайлт | `pg_trgm` + кирилл normalize, шаардвал `unaccent` |
| Газрын зургийн зардал | MapLibre (үнэгүй) эсвэл Mapbox free tier |

---

## 8. Ойролцоо хугацаа

| Үе шат | Долоо хоног |
|--------|-------------|
| Phase 0–3 (суурь, auth, дизайн) | ~4 |
| Phase 4–7 (үндсэн хуудас, dashboard) | ~6 |
| Phase 8–12 (чат, AI, төлбөр, газрын зураг, хайлт) | ~6 |
| Phase 13–14 (тест, deploy) | ~3 |
| **Нийт** | **~19 долоо хоног (1 хөгжүүлэгч)** |

> 2–3 хүний баг бол ~10–12 долоо хоногт багасгах боломжтой (parallel ажил).

---

## 9. Дараагийн алхам (хамгийн эхэнд)

1. Git repo + Next.js scaffold + Supabase төсөл (Phase 0)
2. Schema migration + seed (Phase 1)
3. Auth (Phase 2)

Эдгээрийг эхлүүлэхэд бэлэн болсон бол хэлээрэй — Phase 0-оос эхэлж кодоор хэрэгжүүлж эхэлнэ.

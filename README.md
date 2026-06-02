# Нэми — Үл хөдлөхийн платформ

Монголын баталгаатай үл хөдлөхийн платформ. **Next.js 16 + Supabase** дээр баригдсан.

## Стек
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4
- **Backend:** Supabase (Postgres + PostGIS, Auth, Storage, Realtime)
- **Интеграц:** Anthropic Claude (AI үнэлгээ), QPay (төлбөр), MapLibre (газрын зураг)
- **Hosting:** Vercel (санал болгосон)

## Орон нутгийн ажиллагаа

```bash
npm install
cp .env.local.example .env.local   # утгуудыг бөглөх
npm run dev                          # http://localhost:3000
```

### Скриптүүд
| Команд | Үйлдэл |
|--------|--------|
| `npm run dev` | Хөгжүүлэлтийн сервер |
| `npm run build` | Production build |
| `npm run test` | Unit тест (vitest) |
| `npm run seed` | Mock дата DB рүү оруулах |

## Орчны хувьсагч (`.env.local`)
| Хувьсагч | Шаардлага | Тайлбар |
|----------|:---------:|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Серверийн нууц (webhook, seed) |
| `SUPABASE_DB_URL` | seed/migration | Pooler холболт |
| `ANTHROPIC_API_KEY` | AI | Claude API (AI үнэлгээ) |
| `QPAY_USERNAME` / `QPAY_PASSWORD` / `QPAY_INVOICE_CODE` | Төлбөр | QPay merchant |
| `NEXT_PUBLIC_APP_URL` | Төлбөр | Webhook callback-д ашиглах public URL |

## Database (Supabase)
- Migration-ууд: `supabase/migrations/`
- Хэрэглэх: `supabase db push --db-url "$SUPABASE_DB_URL"`
- Seed: `npm run seed`
- 17 хүснэгт, бүгд **RLS**-тэй (buyer / agent / office_admin / admin role).

## Бүтэц
```
app/
  (site)/        # нийтийн хуудас (Topbar+Footer): home, listings, agents, ...
  (auth)/        # login, signup, agent-signup
  (dashboard)/   # хамгаалагдсан: dashboard (агент), office (админ)
  api/qpay/      # QPay webhook
  auth/          # OAuth callback, logout
components/      # ui, layout, listings, agents, dashboard, chat, map ...
lib/             # supabase clients, queries, actions, ai, qpay
supabase/        # migrations
```

## Production deploy (Vercel)
1. Repo-г GitHub-д push хийх.
2. Vercel дээр import → framework автоматаар Next.js.
3. Дээрх орчны хувьсагчдыг Vercel project settings-д нэмэх.
4. `NEXT_PUBLIC_APP_URL`-ийг production домэйнаар тохируулах.
5. Supabase Auth → URL Configuration-д production домэйн + `/auth/callback`-ийг redirect URL болгон нэмэх.

## Тохируулах шаардлагатай (production функцийн бүрэн ажиллагаанд)
- **OAuth:** Supabase → Authentication → Providers дээр Google / Facebook client ID, secret.
- **AI үнэлгээ:** `ANTHROPIC_API_KEY`.
- **Төлбөр:** QPay merchant эрх (`QPAY_*`) + webhook public URL.
- **Имэйл баталгаажуулалт:** Supabase → Auth дээр SMTP (эсвэл dev-д унтраах).

> Эдгээргүйгээр апп ажиллана — холбогдох товч/үйлдэл эвтэйхэн "тохируулаагүй" мессеж өгнө.

## Туршилтын хэрэглэгч (dev seed)
- `buyer@nemi.mn` / `Nemi1234!` — худалдан авагч
- `agent@nemi.mn` / `Nemi1234!` — агент
- `office@nemi.mn` / `Nemi1234!` — оффисын админ (Голден Хаус)

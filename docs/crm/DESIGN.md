# PMC CRM — Нэми платформ дахь бүрэн техник дизайн (PMC-CRM-TOR-001)

> **АНХААР (plan mode):** Зорилтот зам `C:\Users\amara\.claude\plans\crm-design.md` байсан ч энэ сешн plan mode-тэй тул зөвшөөрөгдсөн цорын ганц файл болох энэ замд бичив. Агуулга нь эцсийн дизайн мөн — гүйцэтгэлийн шатанд файлыг зорилтот зам руу шууд хуулж болно.

**Орчин:** Next.js 16 (App Router) + Supabase Postgres/RLS/Storage, оффисын панель `app/(office)/office/(panel)/crm/*` + агентын панелийн толь. UI монгол, идентификатор англи. Nemi конвенц (миграцийн house style = `20260611000100_tasks.sql`, action/query хэв маяг = `lib/actions/tasks.ts` / `lib/queries-tasks.ts`, UI kit = `components/ui/*`, constants = `lib/constants.ts` загвар) бүрэн мөрдөгдөнө.

---

## 0. Суурь архитектурын шийдвэрүүд (яагаад)

| # | Шийдвэр | Үндэслэл |
|---|---|---|
| D1 | **Бүх CRM хүснэгт `crm_` угтвартай, ТУСДАА байна; объектын сан = шинэ `crm_properties`, одоогийн `listings`-ийг ӨРГӨТГӨХГҮЙ** | `listings` нь нийтийн сайтын хүснэгт: `listings_select` policy нь `status='active'`-ийг ХЭНД Ч харуулна; статусын машин (active/draft/review/sold) нь ToR-ын Draft→Active→Reserved→Sold/Rented/Withdrawn-тай зөрчилдөнө; өмчлөгч-contact, ашиглалтын статус, МУТСТ баримтын хязгаарлалт, immutable дугаарлалт зэрэг CRM шаардлагыг нийтийн хүснэгтэд нэмбэл нууцлал алдагдана. Оронд нь `crm_properties.listing_id → listings(id)` nullable холбоос: «сайтад нийтлэх» үйлдэл нь listings мөр үүсгэж/шинэчилж синк хийнэ (ToR-ын «вэбсайтад листинг нийтлэх» INT-цэг Нэми дотроо шийдэгдэнэ). |
| D2 | **Даалгавар = одоогийн `tasks` модулийг дахин ашиглана** + `crm_task_links` polymorphic холбоос | Tasks модуль (Kanban/Table/Calendar, RLS, мэдэгдэл) бэлэн. Автомат даалгавар (Д-01…Д-30) нь `tasks`-д admin client-ээр insert + `crm_task_links(task_id, entity_type, entity_id, rule_code)`-оор CRM объекттой холбогдоно. Tasks schema-д өөрчлөлт ОРОХГҮЙ. |
| D3 | **Мэдэгдэл = одоогийн `notifications` + realtime NotificationBell** дахин ашиглана | Producers admin client-ээр insert хийдэг одоогийн идиом хэвээр. CRM талд `crm_notification_matrix` (тохиргоо), `crm_notification_prefs`, илгээлтийн лог нэмэгдэнэ. SMS/и-мэйл суваг — INT- заглушка (§12). |
| D4 | **Тохиргоо = өгөгдөл.** Урсгал/шат/гейт/жин/босго/SLA/хувь бүгд config хүснэгтэд, хувилбартай (`valid_from`), кодод тоон утга ХОРИОТОЙ | ToR зарчим 8, 0.7. Тооцоо бүр ашигласан хувилбарын ID-гаа хадгална → детерминистик дахин тооцоо. |
| D5 | **Multi-tenancy:** бүх `crm_` хүснэгт `office_id not null` + RLS суурь нөхцөл `office_id = crm_office_id()`; салбар (Төв/Яармаг-Нисэх) = `crm_branches` хүснэгт | Нэми олон оффистой платформ; PMC = нэг office. Салбар нь оффис ДОТОРХ ойлголт тул branches тусдаа. |
| D6 | **Статусын машин DB түвшинд**: төлөвтэй объект бүрд шилжилтийн lookup (`crm_stage_transitions` / хатуу CHECK+trigger) + trigger guard; заагаагүй шилжилт exception; шилжилт бүр `crm_audit_log`-т | ToR 0.2. UI шалгалт = давхар хамгаалалт, DB = эцсийн үнэн. |
| D7 | **МУТСТ хязгаарлагдмал бүс = тусдаа хүснэгтүүд + хатуу RLS** (`crm_contact_aml`, `crm_aml_cases`, `crm_aml_alerts`) — зөвхөн `aml_officer` дүр; бусдад denormalized `kyc_public_status` талбар л харагдана; дохио үүсгэгч агент INSERT эрхтэй, SELECT эрхгүй | ToR зарчим 7, §7.6 (tipping-off хориглол). Системийн админд ч арилжааны/МУТСТ өгөгдөлд давуу эрх ҮГҮЙ. |
| D8 | **Cron = Vercel Cron → `app/api/cron/crm-*` route + admin client** (pg_cron-д түшиглэхгүй); синхрон enforcement = DB trigger | Гейт/түгжээ/immutability шиг «хориглох» логик trigger-ээр; хугацаанд суурилсан (сарын үүсгэлт, SLA, сануулга) — cron route. CRON_SECRET header-ээр хамгаална. |
| D9 | **Soft delete / архив:** ямар ч CRM хүснэгтэд hard delete policy байхгүй (админаас бусад); FK бүгд RESTRICT (холбоостой устгал DB-ээс боломжгүй); төлөв «archived» | ToR зарчим 10. `on delete cascade` зөвхөн жинхэнэ дэд мөрөнд (мөр-задаргаа). |
| D10 | **Баримт = шинэ PRIVATE bucket `crm-docs`** + `crm_documents` мета + M:N холбоос; signed URL-ээр үзүүлж, хязгаарлагдмал ангиллын үзэлт бүр аудитад | Одоогийн `listings` bucket public тул CRM баримтад тохирохгүй. |
| D11 | **PDF (нэхэмжлэх, өмчлөгчийн тайлан, тооцооны хуудас) = v1-д print-оптимизацитай HTML хуудас** (`/office/crm/.../print`) — сервер талын PDF lib оруулахгүй; и-мэйл илгээлт INT- заглушка | Хамаарал багасгана; ToR «PDF татах» шаардлагыг хөтчийн print-to-PDF-ээр UAT-д хангана. Resend-ээр и-мэйл илгээх нь дараагийн шат. |

---

## 1. Дүрийн загвар

### 1.1 Буулгалт

Nemi-ийн `user_role` (buyer/agent/office_admin/admin) ХЭВЭЭР — панелийн хандалтыг шийднэ. ToR-ын 10 дүр = шинэ `crm_role` enum + `crm_staff` хүснэгт (profiles өргөтгөхгүй — оффис бүр өөрийн CRM бүтэцтэй байж болох тул tenant-scoped):

```sql
create type crm_role as enum (
  'agent',            -- Агент
  'team_lead',        -- Багийн ахлагч
  'sales_director',   -- Борлуулалтын захирал
  'ops_qc',           -- Үйл ажиллагаа/ЧМТ-ийн зохицуулагч
  'marketing',        -- Маркетингийн мэргэжилтэн
  'property_manager', -- ҮХХ менежментийн мэргэжилтэн
  'finance',          -- Санхүү (Нягтлан бодогч)
  'aml_officer',      -- МУТСТ-ийн хяналт тавих ажилтан
  'ceo',              -- Ерөнхий захирал
  'sysadmin'          -- Системийн админ (CRM тохиргоо; арилжааны өгөгдөлд давуу эрхгүй)
);
```

- Панель руу нэвтрэх урьдчилсан нөхцөл: агент дүртэй хүн `user_role='agent'` (агент панель + оффис панелийн CRM-ийн агентын хэсэг), удирдах дүрүүд `office_admin` (оффис панель). `admin` (платформ) CRM-д tenant-ийн хувьд оролцохгүй ч platform-админ эрх нь хэвээр.
- **⭐ Эрхийн тэлэлтийн ХААЛТ (шийдвэрлэгдсэн — хойшлуулахгүй, U1-д):** CRM-ийн удирдах дүрүүд `user_role='office_admin'` болмогц одоогийн `offices_write`, agents/listings удирдлага зэрэг оффис панелийн CRM-ээс ГАДУУРХ бичих эрхийг автоматаар авах нь ToR-ын «Системийн админ арилжааны мэдээлэлд давуу эрхгүй», «Маркетинг хязгаарлагдмал» зарчимтай зөрчилддөг тул foundation миграцид (000100) дараах хаалт орно: (а) `crm_staff.panel_admin boolean not null default false` — «жинхэнэ» оффис админыг тэмдэглэнэ; (б) definer helper `public.crm_is_panel_admin() returns boolean` — `crm_staff` мөргүй office_admin (CRM нэвтрээгүй оффис — хуучин зан төлөв) → true, мөртэй бол `panel_admin` утга; (в) оффис панелийн CRM-ээс гадуурх бичих policy-уудыг (`offices_update`, agents/listings/office-settings бичилтүүд) `and public.crm_is_panel_admin()` нөхцөлөөр нарийсгах ALTER POLICY-ууд мөн 000100-д; (г) оффис панелийн CRM-ээс гадуурх хуудсуудад layout guard — panel_admin биш CRM ажилтанд зөвхөн `/office/crm/**` харагдана (redirect). Ингэснээр finance/marketing/aml_officer гэх мэт дүрүүд оффисын бусад өгөгдөлд бичих эрхгүй.
- Нэг хүн олон дүртэй байж болно (Ерөнхий захирал + Системийн админ г.м.) → `roles crm_role[]`.
- CRM хуудсууд `crm_staff` мөргүй хэрэглэгчийг «CRM-д бүртгэгдээгүй» гэж хаана (layout guard + RLS).

```sql
create table public.crm_branches (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  code       text not null,          -- 'central' | 'yarmag' | ... (шинэ салбар нэмэгдэнэ)
  name       text not null,          -- «Төв», «Яармаг-Нисэх»
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, code)
);

create table public.crm_teams (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  branch_id  uuid not null references public.crm_branches(id) on delete restrict,
  name       text not null,
  lead_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.crm_staff (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete restrict,
  profile_id  uuid not null references public.profiles(id) on delete restrict,
  branch_id   uuid references public.crm_branches(id),
  team_id     uuid references public.crm_teams(id),
  roles       crm_role[] not null default '{agent}',
  is_active   boolean not null default true,
  offboarding boolean not null default false,  -- P-10 гарах төлөв
  created_at  timestamptz not null default now(),
  unique (office_id, profile_id)
);
create index crm_staff_profile_idx on public.crm_staff (profile_id);
create index crm_staff_office_idx  on public.crm_staff (office_id, is_active);
```

Гарах ажилтан (P-10): `offboarding=true` болмогц Д-11 урсгал; `is_active=false` болгохыг хүлээлцэх дуусаагүй бол trigger хориглоно (нээлттэй эзэмшилтэй бичлэгийн тоог шалгана).

### 1.2 Эрхийн товч матриц (ACC-) — ✅ эх ToR §7.1-тэй тулгагдсан (U1, 2026-09-05)

Тэмдэглэгээ (ToR §7.1-ийн дагуу): Х харах, ХТ хязгаарлагдмал талбар харах, Ү үүсгэх, З засах, Э экспорт, Ш дахин хуваарилах, Б бүрэн, — үгүй. Дагавар: ө өөрийн, б багийн, к компанийн, т тохиргоот дэд багц (менежменттэй багц г.м.).

| Объект | agent | team_lead | sales_director | ops_qc | marketing | property_manager | finance | aml_officer | ceo | sysadmin |
|---|---|---|---|---|---|---|---|---|---|---|
| Харилцагч | ХҮЗ-ө | ХЗ-б, Ш | Х-к, Ш, Э | Х-к, Э | ХТ-к | ХҮЗ-т | Х-к | Х-к | Х-к | — |
| Борлуулалтын сэжим | ХҮЗ-ө | ХЗ-б, Ш | Х-к, Ш, Э | Х-к | ХТ-к | ХҮ-ө | — | Х-к | Х-к | — |
| Хэрэгцээ/өмчлөгчийн профайл | ХҮЗ-ө | Х-б | Х-к | Х-к | — | ХҮЗ-т | — | Х-к | Х-к | — |
| Объект (листинг) | ХҮЗ-ө, Х-к | ХЗ-б | ХЗ-к, Э | Х-к | Х-к | ХҮЗ-т | Х-к | Х-к | Х-к | — |
| Тохируулга (match) | ХҮЗ-ө | Х-б | Х-к | Х-к | — | ХҮЗ-т | — | — | Х-к | — |
| Үйл ажиллагааны бүртгэл | ХҮЗ-ө | Х-б | Х-к | Х-к, Э | — | ХҮЗ-т | — | Х-к | Х-к | — |
| Хэлцлийн боломж | ХҮЗ-ө | ХЗ-б, Ш | ХЗ-к, Ш, Э | Х-к | — | Х-т | Х-к | Х-к | Х-к | — |
| Хэлцэл | ХҮ-ө | Х-б | ХЗ-к | Х-к | — | Х-т | ХЗ-к | ХЗ-к (гейт/hold) | Х-к | — |
| Түрээсийн гэрээ | Х-ө | Х-б | Х-к | Х-к | — | ХҮЗ-т | ХЗ-к | Х-к | Х-к | — |
| Менежментийн гэрээ | Х-ө | — | Х-к | — | — | ХҮЗ-т | Х-к | — | Х-к | — |
| Нэхэмжлэх/төлбөр/барьцаа | ХТ-ө | — | Х-к | Х-к | — | ХҮЗ-т | Б-к | Х-к | Х-к | — |
| Засварын хүсэлт/сарын бүртгэл | ХҮ-ө | Х-б | Х-к | Х-к | — | ХҮЗ-т | Х-к | — | Х-к | — |
| Өмчлөгчийн тайлан | — | — | Х-к | Х-к | — | ХҮЗ-т | ХЗ-к | — | Х-к | — |
| Шимтгэлийн тооцоо | Х-ө | Х-б | ХЗ-к | Х-к | — | Х-ө | ХЗ-к, Э | Х-к | Х-к | — |
| МУТСТ кейс | — (дохио INSERT) | — | — | — | — | — | — | Б-к | Х-к | — |
| Хэрэглэгч (crm_staff) | Х-ө | Х-б | ХЗ-к | Х-к | Х-к | Х-к | Х-к | Х-к | Х-к | Б-к |
| Тохиргоо (урсгал/шат/дүрэм/параметр) | — | — | Х-к | ХЗ-к | — | — | — | — | Х-к | Б-к |
| Аудит лог | — | — | Х-т | Х-к | — | — | Х-т | Х-т (AML бүрэн) | Х-к | Х-к, Э |

> **Тулгалтын дүн (U1, ToR §7 мөр 6384–6893):** дайджестээс сэргээсэн хуучин матрицад дараах зөрүүнүүд илэрч ToR-ын дагуу засагдав. Хожмын нэгжүүд RLS policy бичихдээ ЭНЭ матрицыг мөрдөнө:
> 1. **sales_director** — харилцагч/сэжим/профайлд ЗАСАХ эрхгүй (Х-к, Ш, Э л); засах эрх нь зөвхөн листинг, боломж, хэлцэл, шимтгэл, crm_staff дээр (ACC-06).
> 2. **ops_qc** — бизнес агуулга засахгүй (ACC-07); цорын ганц үл хамаарах нь merge/архив. Шимтгэл, засвар, хэлцэлд зөвхөн харах; тохиргоонд ХЗ-к (ACC-17 — sysadmin бэлтгэж ops_qc баталгаажуулна). Хуучин матрицын «● хянах» → шимтгэлийн Reviewed шат нь sales_director-ын З эрхээр (ops_qc биш) хийгдэнэ.
> 3. **finance** — сэжимд хандалтгүй (—); объект/харилцагчид Х-к; **тохиргоонд хандалтгүй** (хуучин «санхүүгийн тохиргоо ●» ХАСАГДАВ — crm_settings бичих нь sysadmin+ops_qc; ⚠️ U7-ийн `crm_commission_config_versions` insert policy-г мөн sysadmin+ops_qc болгоно, finance биш).
> 4. **aml_officer** — хэлцэлд ХЗ-к (гейт/hold талбар), шимтгэл/сэжим/боломжид Х-к (унших).
> 5. **ceo** — МУТСТ кейсийг ХАРНА (Х-к, ACC-12; SEC-09 — AML аудит лог мөн ceo-д) — D7-ийн «зөвхөн aml_officer» заалт «aml_officer бичих + ceo унших» болж нарийсав; U5 policy-д тусгана. Бүртгэлийн агуулгыг шууд засахгүй (ACC-13).
> 6. **property_manager** — боломж/хэлцэлд Х-т (харах л — хуучин ◐ бичих ХАСАГДАВ); сэжимд ХҮ-ө (өөрийн үүсгэх/харах); түрээс/засвар/сарын бүртгэл/тайлан/нэхэмжлэхэд ХҮЗ-т.
> 7. **agent** — түрээсийн гэрээнд Х-ө (харах л, ACC-10 — санхүүгийн баталгаажуулалтын талбар засахыг систем хориглоно); хэлцэлд ХҮ-ө (үүсгэх+харах, статусын урсгал guard-аар); нэхэмжлэхэд ХТ-ө.
> 8. **marketing** — объектод Х-к (нээлттэй), харилцагч/сэжимд ХТ-к (§3.4 view); бусад бүх объектод —.
> 9. **sysadmin** — бизнес объект бүрд — (ACC-14); crm_staff, тохиргоо Б-к; аудит Х-к, Э.
> 10. **crm_staff** — sales_director ХЗ-к (update policy-д sysadmin + sales_director); агент өөрийн мөрөө, team_lead багийнхаа мөрийг л харна (select policy үүгээр нарийссан — U1-д хэрэгжив).

---

## 2. DB schema — DDL төсөл

Миграцийн файлууд (house style: монгол толгой тайлбар → enum → table (id uuid pk default gen_random_uuid(), created_at) → index → trigger fn (security definer) → RLS helper → enable RLS → policy `<table>_<verb>`):

| Файл | Агуулга |
|---|---|
| `20260901000100_crm_foundation.sql` | **extensions (`create extension if not exists pg_trgm with schema extensions;` + btree_gist мөн адил)**, enum-ууд, branches/teams/staff (+panel_admin, §1.1 policy хаалтын ALTER-ууд), lookups, settings, calendar, sequences, zone_directory, pipelines/stages/transitions/gates, audit_log, duty_shifts/assignment_state (§2.2а), **automation_rules, rule_runs, notification_matrix, notification_prefs (U2+ нэгжүүд runRule/notify-д хэрэглэдэг тул эндээ)**, суурь RLS helper |
| `20260901000200_crm_contacts.sql` | contacts, phones/emails, tags, aml (contact), merges, leads, ownership_history, saved_views |
| `20260901000300_crm_properties.sql` | **zone_directory-г properties-ээс ӨМНӨ** (000100-д орсонгүй бол), properties, price_history, property_roles, listing_agreements, vacancy, meters |
| `20260901000400_crm_pipeline.sql` | need/owner profiles, matches, **opportunities → stage_history → activities → offers → task_links (activities нь opportunities-руу FK-тэй тул ЭНЭ дарааллаар)** |
| `20260901000500_crm_transactions.sql` | transactions + дэд, aml_cases/holds/alerts, documents; **төгсгөлд нь ALTER: `crm_transactions.aml_case_id` FK (cases-ийн дараа)** |
| `20260901000600_crm_rentals.sql` | leases, invoices, payments, deposits, maintenance, monthly_records, owner_statements, inspections; **төгсгөлд нь ALTER: `crm_transactions.lease_id`, `crm_properties.active_lease_id`, `crm_properties.management_agreement_id`, `crm_need_profiles.fulfilled_txn_id` FK-ууд** |
| `20260901000700_crm_commissions.sql` | commission_* бүлэг |
| `20260901000800_crm_automation.sql` | nps/referrals/complaints, handover_acts, txn_corrections, integrity views, **ALTER: `crm_maintenance_requests.complaint_id` FK**; Д-дүрмүүдийн seed/өргөтгөл (automation хүснэгтүүд өөрсдөө 000100-д) |
| `20260901000900_crm_reports.sql` | KPI view-үүд (security_invoker) |

Нэг файл доторх DDL дараалал: FK-ийн зорилтот хүснэгт үргэлж түрүүлж үүснэ; circular FK бүр дээрх хүснэгтэд заасан миграцид ALTER-ээр орно (өөр газар «alter-ээр» гэж тарааж үлдээхгүй).

### 2.1 Enum-ууд (Postgres enum — хаалттай жагсаалт; «админ өргөтгөнө» ангилал → `crm_lookups`)

```sql
create type crm_contact_kind      as enum ('person','company');
create type crm_contact_type      as enum ('buyer','seller','tenant','landlord','investor','applicant'); -- multi → массив
create type crm_lifecycle         as enum ('new','active','recycled','inactive','archived');       -- F-110
create type crm_lead_grade        as enum ('a','b','c','d');                                       -- A/B/C/D
create type crm_consent_status    as enum ('granted','not_asked','declined');                      -- F-114
create type crm_profile_status    as enum ('active','paused','fulfilled','lost');                  -- F-155
create type crm_service_kind      as enum ('sale','standard_rental','managed_rental');
create type crm_property_status   as enum ('draft','active','reserved','sold','rented','withdrawn');-- F-202
create type crm_occupancy_status  as enum ('vacant','occupied','make_ready','notice_given');       -- F-565
create type crm_property_role     as enum ('sourcing','photo','contract');                         -- F-206
create type crm_activity_channel  as enum ('call','chat','email','meeting','showing','task');      -- F-300
create type crm_activity_outcome  as enum ('open','advanced','lost','won');
create type crm_match_response    as enum ('interested','maybe','not_fit','no_response');          -- F-256
create type crm_opp_state         as enum ('open','won','lost');
create type crm_txn_type          as enum ('sale','standard_rental','managed_rental','international_sale','replacement'); -- F-400
create type crm_txn_status        as enum ('draft','contract','payment','closed','cancelled');     -- F-420
create type crm_kyc_status        as enum ('pending','verified','edd','suspended');                -- нийтэд харагдах 4 төлөв
create type crm_aml_risk          as enum ('low','medium','high','prohibited');
create type crm_aml_case_status   as enum ('open','investigating','str_sent','closed');            -- F-421
create type crm_gate_code         as enum ('g0','g1','g2','g3','g4','g5','g6');
create type crm_lease_status      as enum ('draft','active','renewed','terminated','expired');     -- F-501
create type crm_invoice_type      as enum ('mgmt_fee','brokerage_fee','extra_service');            -- F-516
create type crm_invoice_status    as enum ('planned','sent','partially_paid','paid','cancelled');  -- F-519
create type crm_payment_kind      as enum ('income','control');                                    -- F-526
create type crm_maintenance_status as enum ('new','pending_approval','assigned','in_progress','closed','rejected'); -- F-547
create type crm_urgency           as enum ('urgent','normal','planned');
create type crm_commission_status as enum ('calculated','reviewed','approved','paid','partially_paid','hold','cancelled'); -- F-460
create type crm_commission_role   as enum ('sourcing','listing','photo','contract','selling','seller_side','buyer_side','intl_lead_gen','deal_manager','pm_team'); -- F-451
create type crm_party_role        as enum ('seller','buyer','lessor','lessee');
create type crm_expense_bearer    as enum ('tenant','landlord','pmc');                             -- F-505
create type crm_inspection_kind   as enum ('move_in','move_out','periodic');
create type crm_doc_category      as enum ('contract','payment_proof','ownership','identity','photo','act','aml','other'); -- F-701 (aml = хязгаарлагдмал)
```

«Админ өргөтгөнө» лавлахууд (эх сурвалж, эсэргүүцлийн төрөл, засварын ангилал, алдсан шалтгаан, шошго, зорилго г.м.):

```sql
create table public.crm_lookups (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  kind       text not null,   -- 'lead_source'|'lost_reason'|'objection'|'maintenance_category'|'tag'|'goal'|'blocker'|'decision_maker'|'condition'|...
  code       text not null,
  label      text not null,
  requires_note boolean not null default false, -- «Бусад» сонговол тайлбар заавал (F-104)
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, kind, code)
);
```

### 2.2 Тохиргоо — хувилбартай параметр, хуанли, дугаарлалт

```sql
-- Хувилбартай параметр (жин, босго, SLA, хоног, хувь…). Зөвхөн урагш үйлчилнэ (0.7, F-453).
create table public.crm_settings (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  key        text not null,           -- 'lead_score_weights'|'lead_grade_thresholds'|'match_weights'|'match_thresholds'|'aml_weights'|'sla_first_contact_min'|'arrears_ladder'|'renewal_days'|'photo_min_count'|'recontact_days'|'aml_threshold_mnt'|...
  value      jsonb not null,
  valid_from timestamptz not null default now(),
  valid_to   timestamptz,             -- null = одоогийн хүчинтэй
  created_by uuid not null references public.profiles(id),
  note       text,
  created_at timestamptz not null default now()
);
create index crm_settings_key_idx on public.crm_settings (office_id, key, valid_from desc);

-- Тухайн мөчид хүчинтэй утга.
create or replace function public.crm_setting_at(p_office uuid, p_key text, p_at timestamptz default now())
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.crm_settings
  where office_id = p_office and key = p_key
    and valid_from <= p_at and (valid_to is null or valid_to > p_at)
  order by valid_from desc limit 1;
$$;

-- Ажлын өдрийн хуанли (F-604): МУТСТ 5 өдөр, SLA, чимээгүй цаг бүгд эндээс.
create table public.crm_calendar_days (
  office_id uuid not null references public.offices(id) on delete restrict,
  day       date not null,
  is_workday boolean not null,
  note      text,
  primary key (office_id, day)
);
create or replace function public.crm_add_business_days(p_office uuid, p_from date, p_days int)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_from; n int := 0;
begin
  while n < p_days loop
    d := d + 1;
    if coalesce((select is_workday from public.crm_calendar_days where office_id = p_office and day = d),
                extract(isodow from d) < 6) then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Автомат дугаарлалт (F-401, F-518, Client/Property ID): race-гүй.
create table public.crm_sequences (
  office_id uuid not null references public.offices(id) on delete restrict,
  kind      text not null,   -- 'contact'|'property'|'txn_sale'|'txn_standard_rental'|...|'invoice'|'lease'
  prefix    text not null,
  next_no   bigint not null default 1,
  pad       int not null default 5,
  primary key (office_id, kind)
);
create or replace function public.crm_next_number(p_office uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update public.crm_sequences set next_no = next_no + 1
   where office_id = p_office and kind = p_kind
   returning prefix, next_no - 1 as no, pad into r;
  if r is null then raise exception 'crm_sequences: % тохируулагдаагүй', p_kind; end if;
  return r.prefix || lpad(r.no::text, r.pad, '0');
end $$;
```

> ⚠️ **Definer RPC-ийн аюулгүй байдлын ЗААВАЛ дүрэм (бүх `security definer` функцэд үйлчилнэ):** public schema-ийн функц PostgREST-ээр RPC болж ил гардаг тул (1) `p_office` параметр авдаг функц бүр дотроо `if p_office is distinct from public.crm_office_id() then raise exception 'CRM: оффисын эрхгүй'; end if;` шалгана — эсвэл параметрыг халж office_id-г `crm_office_id()`-ээс дотооддоо авна (шинэ функцэд энэ нь илүү); (2) бүх definer функцэд `revoke execute ... from anon, public;` + `grant execute ... to authenticated;`; (3) зөвхөн trigger/service-role-оос дуудагдах функцэд (`crm_next_number` г.м.) authenticated-аас ч execute-ийг хураана; (4) дүрд хамааралтай RPC (`crm_reassign_lead`, `crm_log_doc_view` г.м.) дотроо `has_crm_role(...)`-оо шалгана. `crm_setting_at`-ийг мөр бүрчлэн дуудах policy/trigger-т `p_office` шалгалт заавал.

### 2.2а Сэжим хуваарилалтын тохиргоо (F-126, Д-01)

4 горим + ажлын бус цагийн дараалал — бүгд тохиргоо/төлөвөөр:

```sql
-- crm_settings key='lead_assignment' jsonb schema:
-- { mode: 'duty_shift'|'round_robin'|'rule_based'|'load_capped',
--   load_cap: number,                 -- ачааллын дээд босго (нээлттэй идэвхтэй сэжимийн тоо)
--   rules: [{when: {source|branch|grade}, assign_to_team|assign_to_role}],  -- rule_based нөхцөлүүд
--   after_hours: 'queue' }            -- ажлын бус цагт дараалалд (FIFO), дараагийн ажлын цагт хуваарилна

create table public.crm_duty_shifts (          -- жижүүрийн ээлжийн хуваарь
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  branch_id uuid references public.crm_branches(id),
  profile_id uuid not null references public.profiles(id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index crm_duty_shifts_idx on public.crm_duty_shifts (office_id, starts_at, ends_at);

create table public.crm_assignment_state (     -- round-robin cursor + дараалал
  office_id uuid not null references public.offices(id) on delete restrict,
  scope text not null default 'default',       -- branch/team тус бүрд тусдаа cursor байж болно
  last_assigned_profile_id uuid references public.profiles(id),
  queue jsonb not null default '[]',           -- ажлын бус цагийн FIFO (lead_id жагсаалт)
  updated_at timestamptz not null default now(),
  primary key (office_id, scope)
);
```

Логик: `lib/crm/assign.ts` — цэвэр функц `assignLead({mode, candidates, dutyNow, cursor, loads, rule, lead}) => {ownerId | queued}` (unit тесттэй, U2). `createLead` action → runRule(Д-01) → assignLead; ажлын бус цагт queue-д, `crm-sla` cron дараагийн ажлын цагт хуваарилна.

### 2.3 Урсгал, шат, гейт (бүгд өгөгдөл — PL-1…PL-6 seed-ээр орно)

```sql
create table public.crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  code       text not null,            -- 'PL-1'…'PL-6'
  name       text not null,
  restricted boolean not null default false, -- PL-6: зөвхөн 5 дүр (RLS)
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, code)
);

create table public.crm_stages (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete restrict,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete restrict,
  code        text not null,           -- 'new','qualified','contract',…
  name        text not null,
  sort_order  int not null,
  probability numeric(5,2) not null default 0,   -- F-353 жинлэсэн төсөөлөл
  gate_code   crm_gate_code,           -- энэ шатанд ОРОХЫН өмнө шалгагдах гейт (F-354)
  is_terminal boolean not null default false,
  terminal_state crm_opp_state,        -- won/lost терминал шатанд
  created_at  timestamptz not null default now(),
  unique (pipeline_id, code)
);

-- Зөвшөөрөгдсөн шилжилтүүд (0.2): урагш зөвхөн дараалсан; буцаалт шалтгаантай; алгасалт зөвхөн sales_director.
create table public.crm_stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  pipeline_id   uuid not null references public.crm_pipelines(id) on delete restrict,
  from_stage_id uuid not null references public.crm_stages(id) on delete restrict,
  to_stage_id   uuid not null references public.crm_stages(id) on delete restrict,
  kind          text not null default 'forward',  -- 'forward'|'backward'|'skip'
  allowed_roles crm_role[] not null default '{agent,team_lead,sales_director}',
  requires_reason boolean not null default false,
  unique (from_stage_id, to_stage_id)
);

-- Гейтийн шаардлагууд — өгөгдөл (G0–G6, F-354/F-416). checker_kind нь кодод хэрэгжсэн цөөн примитив.
create table public.crm_gate_requirements (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  gate_code  crm_gate_code not null,
  pipeline_id uuid references public.crm_pipelines(id),  -- null = бүх урсгалд
  checker_kind text not null, -- 'need_profile_complete'|'owner_set'|'next_step_set'|'kyc_verified'|'docs_complete'|'role_evidence'|'payment_proof'|'handover_done'|'listing_agreement'|'offer_recorded'|'aml_not_held'|'post_sale_tasks'
  params     jsonb not null default '{}',
  is_active  boolean not null default true
);
```

Гейт шалгагч: `lib/crm/gates.ts` — цэвэр функц `checkGate(reqs, snapshot) => { ok, missing: string[] }` (unit тесттэй) + SQL талд `crm_check_gate(p_opportunity uuid, p_gate crm_gate_code) returns text[]` (дутуу шаардлагын жагсаалт буцаана; хоосон = тэнцсэн) — trigger дотор дуудагдана. **ЗААВАЛ `security definer set search_path = public`** — 'kyc_verified'/'aml_not_held' checker-ууд `crm_contact_aml`/`crm_aml_holds`-оос уншдаг (SELECT зөвхөн aml_officer) тул агентын эрхээр дуудагдвал мөр олдохгүй, гейт ЧИМЭЭГҮЙ тэнцэх аюултай; definer болгосноор AML-хамааралт шалгалт бүх дуудагчид үнэн ажиллана (функц дотор p_opportunity-ийн office = `crm_office_id()` шалгана, §2.2 дүрэм).

### 2.4 Аудит лог + immutable хамгаалалт

```sql
create table public.crm_audit_log (
  id         bigint generated always as identity primary key,
  office_id  uuid not null,
  actor_id   uuid,                       -- null = систем/cron
  entity     text not null,              -- хүснэгтийн нэр
  entity_id  uuid not null,
  action     text not null,              -- 'insert'|'update'|'status'|'merge'|'export'|'view_restricted'|...
  field      text,
  old_value  jsonb,
  new_value  jsonb,
  reason     text,
  created_at timestamptz not null default now()
);
create index crm_audit_entity_idx on public.crm_audit_log (entity, entity_id, created_at);
create index crm_audit_office_idx on public.crm_audit_log (office_id, created_at desc);
-- RLS: select — ops_qc, sysadmin, ceo (AML entity-г зөвхөн aml_officer); insert — trigger/definer functions; update/delete policy ОГТ БАЙХГҮЙ (устгагдахгүй).

-- Immutable талбар хамгаалагч (Client ID, дугаарууд, created_at/by, бүртгэсэн огноо — F-106, F-401, F-417):
-- Хамгаалах баганы нэрс TG_ARGV-ээр дамжина (number/created_by байхгүй хүснэгтэд ч аюулгүй):
create or replace function public.crm_protect_immutable()
returns trigger language plpgsql as $$
declare col text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if n->col is distinct from o->col then
      raise exception 'CRM: өөрчлөх хориотой талбар (%)', col;
    end if;
  end loop;
  return new;
end $$;
-- Залгалт: create trigger ... execute function crm_protect_immutable('number','created_at','created_by');
--   (number-гүй хүснэгтэд зөвхөн 'created_at','created_by' гэх мэт тохирох багануудаа дамжуулна).
-- crm_transactions-д нэмж: status='closed' үед бүх талбарын өөрчлөлт хориотой
--   (зөвхөн crm_txn_corrections тусгай урсгалаар — F-417).
```

**House style-ийн нэмэлт нийтлэг дүрмүүд (бүх crm миграцид):**
- **`updated_at` автомат:** нэг `public.crm_set_updated_at()` BEFORE UPDATE trigger функц (`new.updated_at := now()`) foundation-д тодорхойлж, `updated_at` баганатай ХҮСНЭГТ БҮРД залгана — гараар оноохыг action-уудад найдахгүй.
- **Realtime publication — ГАЖИЛТ:** house style-ийн 6-р алхмаас (`alter publication supabase_realtime add table ...`) санаатай гажна: **crm_* хүснэгтийг supabase_realtime-д НЭМЭХГҮЙ** (ялангуяа `crm_contact_aml`/`crm_aml_*`). In-app мэдэгдэл одоогийн `notifications` урсгалаар л явна.
- **Tenant хоорондын FK нийцэл:** гол config хүснэгтүүдэд (`crm_lookups`, `crm_branches`, `crm_teams`, `crm_pipelines`, `crm_stages`) `unique (id, office_id)` нэмж, тэдгээрийг заадаг хүүхэд мөрүүдээс `foreign key (office_id, source_id) references crm_lookups (office_id, id)` маягийн **composite FK** ашиглана — өөр оффисын лавлах/салбар/шат руу заасан insert DB түвшинд унана. Бусад (арилжааны) хүснэгт хоорондын FK-д RLS + action-ы `.eq("office_id", ...)` давхар scoping хангалттай.

### 2.5 Харилцагч, сэжим (M1)

```sql
create table public.crm_contacts (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  number        text not null,                          -- Client ID, crm_next_number('contact'), immutable
  kind          crm_contact_kind not null default 'person',
  last_name     text, first_name text, org_name text,
  display_name  text not null,
  contact_types crm_contact_type[] not null default '{}', -- олон дүр (зарчим 2)
  source_id     uuid references public.crm_lookups(id),   -- эх сурвалж (заавал — app+CHECK)
  source_detail text,                                     -- аян/санал болгогч/листингийн дугаар
  branch_id     uuid references public.crm_branches(id),
  lifecycle     crm_lifecycle not null default 'new',     -- F-110 (шилжилт trigger-ээр)
  consent       crm_consent_status not null default 'not_asked',
  consent_at    timestamptz, consent_channel text,        -- F-114, F-654
  kyc_public_status crm_kyc_status not null default 'pending', -- denormalized; зөвхөн AML trigger бичнэ
  is_repeat     boolean not null default false,           -- F-754 (≥2 хаагдсан хэлцэл)
  merged_into_id uuid references public.crm_contacts(id), -- merge-ийн дараах soft archive
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_contacts_person_name check (kind <> 'person' or first_name is not null),
  constraint crm_contacts_org_name    check (kind <> 'company' or org_name is not null)
);
create index crm_contacts_office_idx    on public.crm_contacts (office_id, lifecycle);
create index crm_contacts_name_trgm_idx on public.crm_contacts using gin (display_name gin_trgm_ops); -- fuzzy (pg_trgm)

-- Олон утас/и-мэйл, нормалчлагдсан давхардлын индекс (F-102, F-107)
create table public.crm_contact_phones (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  raw        text not null,
  normalized text not null,            -- lib/crm/normalize.ts + SQL crm_normalize_phone()
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_phones_norm_idx on public.crm_contact_phones (office_id, normalized);
create table public.crm_contact_emails (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  email text not null,                 -- lowercase (trigger)
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_emails_idx on public.crm_contact_emails (office_id, email);
create index crm_phones_contact_idx on public.crm_contact_phones (contact_id);
create index crm_emails_contact_idx on public.crm_contact_emails (contact_id);

-- Сегментийн шошго — олон утга (F-118/120/122): junction хүснэгт. crm_lookups kind='tag' мөрүүд эх.
create table public.crm_contact_tags (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  lookup_id  uuid not null references public.crm_lookups(id) on delete restrict,
  office_id  uuid not null references public.offices(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (contact_id, lookup_id)
);
create index crm_contact_tags_lookup_idx on public.crm_contact_tags (office_id, lookup_id);
-- Хэрэглээ: ContactsPageShell/LeadsPageShell-ийн шошгоор шүүлт (F-120) энэ хүснэгтээр join;
-- багц үйлдэл addTags/removeTags (F-122) — §6.2 crm-contacts; marketing view-ийн segment багана эндээс уншина (§3.4).
-- Сэжимийн шошго нь харилцагчийнх (lead → contact_id) — тусдаа junction шаардлагагүй.

-- МУТСТ 12 талбар — ХЯЗГААРЛАГДМАЛ БҮС (F-115–117). RLS: зөвхөн aml_officer.
create table public.crm_contact_aml (
  contact_id uuid primary key references public.crm_contacts(id) on delete restrict,
  office_id  uuid not null references public.offices(id) on delete restrict,
  kyc_status crm_kyc_status not null default 'pending',
  risk       crm_aml_risk,
  risk_score numeric(5,2),             -- жин 30/25/20/15/10 — crm_settings 'aml_weights'
  pep_status text,                     -- 'no'|'possible'|'confirmed'
  sanctions_checked_at timestamptz, sanctions_result text,
  ubo_verified text,                   -- 'yes'|'no'|'na'
  funds_source text, funds_evidence_doc_id uuid,
  payment_method text, third_party_payer boolean, third_party_note text,
  red_flags text[],
  officer_decision text,               -- 'proceed'|'edd'|'suspend'|'reject'
  reporting_status text,               -- 'threshold'|'str'|'none' (хамгийн хязгаарлагдмал)
  next_review_at date,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
-- trigger: kyc_status өөрчлөгдөхөд crm_contacts.kyc_public_status-ыг синк (security definer).

-- Merge түүх (F-108/109) — устгагдахгүй
create table public.crm_contact_merges (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  primary_id uuid not null references public.crm_contacts(id),
  merged_id  uuid not null references public.crm_contacts(id),
  secondary_source jsonb,              -- 2 дахь ирэлтийн эх сурвалж/огноо (P-01 алхам 3)
  field_choices jsonb not null,
  decided_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Сэжим (F-100–128). Алтан дүрэм энд сахиулагдана.
create table public.crm_leads (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  contact_id    uuid not null references public.crm_contacts(id) on delete restrict,
  branch_id     uuid references public.crm_branches(id),
  owner_id      uuid references public.profiles(id),
  source_id     uuid references public.crm_lookups(id),
  campaign_code text,
  channel_ref   text,                       -- сувгийн танигч (давхардлын тулгалтад)
  status        crm_lifecycle not null default 'new',  -- new|active|recycled|inactive|archived
  grade         crm_lead_grade,
  grade_override_reason text,               -- F-113 гар өөрчлөлтөд шалтгаан
  score         numeric(5,2), score_breakdown jsonb,   -- F-112 задаргаа
  last_contact_at timestamptz,
  next_step     text,
  next_step_task_id uuid references public.tasks(id),
  next_step_date date,
  first_contact_due_at timestamptz,         -- SLA тоолол (ажлын цагийн дараалалтай)
  unprotected   boolean not null default false, -- F-127 «хамгаалалтгүй бүртгэл»
  inactivity_days int not null default 0,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ⭐ АЛТАН ДҮРЭМ (зарчим 5, F-125): идэвхтэй сэжим 5 бүрдэлгүй хадгалагдахгүй
  constraint crm_leads_golden_rule check (
    status <> 'active'
    or (owner_id is not null and grade is not null
        and last_contact_at is not null and next_step is not null and next_step_date is not null)
  )
);
create index crm_leads_owner_idx  on public.crm_leads (office_id, owner_id, status);
create index crm_leads_contact_idx on public.crm_leads (contact_id);   -- crm_can_view_contact() мөр бүрчлэн асуудаг тул ЗААВАЛ
create index crm_leads_next_idx   on public.crm_leads (office_id, next_step_date) where status = 'active';
create index crm_leads_grade_idx  on public.crm_leads (office_id, grade, status);

-- Эзэмшлийн түүх (зарчим 6, P-10) — эзэмшигч солигдох бүрд trigger бичнэ
create table public.crm_ownership_history (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  entity text not null,                -- 'lead'|'contact'|'property'|'opportunity'|'lease'
  entity_id uuid not null,
  old_owner_id uuid references public.profiles(id),
  new_owner_id uuid references public.profiles(id),
  reason_code text not null,           -- 'sla_breach'|'inactivity'|'client_request'|'zoning'|'offboarding'|'initial'
  note text,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_ownership_entity_idx on public.crm_ownership_history (entity, entity_id, created_at);

create table public.crm_saved_views (   -- F-121 хувийн хадгалсан харагдац
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page text not null, name text not null, params jsonb not null,
  created_at timestamptz not null default now()
);
```

Trigger-үүд (contacts/leads):
- `crm_lead_owner_change` — owner_id UPDATE бүрд ownership_history мөр (reason_code-гүй бол exception; шалтгаан `set_config('crm.reason', …)`-оор дамжина, эс бөгөөс action-ууд RPC `crm_reassign_lead(lead_id, new_owner, reason)` дуудна — сонголт: **RPC арга** — энгийн, аудиттай).
- `crm_lead_lifecycle_guard` — F-110/4.1.6 шилжилтийн хүснэгтээс гадуурх status өөрчлөлтөд exception; шилжилт audit_log-т.
- `crm_contact_grade_bump` — activity insert үед lead.last_contact_at шинэчилнэ (bump_task_last_activity загвар).
- Утас insert/update-д `crm_normalize_phone()` + давхардал шалгах нь **app давхаргад** (анхааруулга үзүүлэх интерактив тул); DB талд normalized индекс.

### 2.6 Объектын сан (M3)

```sql
create table public.crm_properties (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  number        text not null,                              -- Property ID, immutable
  name          text not null,
  address       jsonb not null,                             -- {district, khoroo, complex, building, unit}
  branch_id     uuid references public.crm_branches(id),    -- бүсийн лавлахаас автомат (F-207)
  branch_override_reason text,
  service_kind  crm_service_kind not null,
  property_type text not null,                              -- constants: apartment|house|office|retail|land|other
  zone_id       uuid references public.crm_zone_directory(id),
  price         numeric(14,2), rent_price numeric(14,2),
  area_m2       numeric(10,2), rooms int,
  status        crm_property_status not null default 'draft',
  occupancy     crm_occupancy_status,                       -- зөвхөн менежменттэйд (F-210/565)
  vacancy_started_on date,                                  -- F-566
  owner_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  active_lease_id uuid,                                     -- FK дараа (circular) — alter-ээр
  management_agreement_id uuid,                             -- alter-ээр
  payment_day   int check (payment_day between 1 and 31),
  features      text[] not null default '{}',
  match_tags    jsonb,                                      -- F-209: {location,type,price,goal,special}
  key_location  text, key_holder_id uuid references public.profiles(id), -- F-215 (өөрчлөлт audit-д)
  listing_id    uuid references public.listings(id),        -- нийтийн сайтын синк (D1)
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (office_id, number)
);
create index crm_properties_status_idx on public.crm_properties (office_id, status);
create index crm_properties_owner_idx  on public.crm_properties (owner_contact_id);
create index crm_properties_zone_idx   on public.crm_properties (zone_id);

create table public.crm_zone_directory (   -- F-207 бүсийн лавлах (аудиттай, зөвхөн эрх бүхий)
                                           -- DDL нь 000100 foundation-д (properties-ийн zone_id FK-ээс ӨМНӨ үүссэн байх ёстой — §2 дарааллын дүрэм)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  district text not null, khoroo text, complex text,
  branch_id uuid not null references public.crm_branches(id),
  decided_by uuid references public.profiles(id), decided_at timestamptz, rationale text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.crm_property_price_history ( -- F-208
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  field text not null,               -- 'price'|'rent_price'
  old_value numeric(14,2), new_value numeric(14,2),
  reason text, changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.crm_property_roles (  -- F-206: 3 роль; эх сурвалжийн роль хамгаалагдана
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  role crm_property_role not null,
  agent_profile_id uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique (property_id, role)
);
-- trigger: role='sourcing' мөрийн agent_profile_id өөрчлөлт — зөвхөн sales_director/ops_qc + шалтгаан (RPC), audit.

create table public.crm_listing_agreements ( -- F-205
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  number text not null, signed_on date not null, expires_on date not null,
  special_terms text,
  created_at timestamptz not null default now()
);
create index crm_listing_agr_exp_idx on public.crm_listing_agreements (office_id, expires_on);

create table public.crm_vacancy_periods (    -- F-566/567
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  started_on date not null, ended_on date,
  created_at timestamptz not null default now()
);

create table public.crm_meters (             -- F-214/580
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  meter_type text not null, serial text,
  created_at timestamptz not null default now()
);
create table public.crm_meter_readings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  meter_id uuid not null references public.crm_meters(id) on delete cascade,
  reading numeric(12,2) not null, read_on date not null,
  photo_doc_id uuid, inspection_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

- **Статусын машин (F-202):** `crm_property_status_guard` trigger — 4.3.2-ын шилжилтийн хүснэгт hardcode биш `crm_settings key='property_status_transitions'` (эрхтэй дүр + нөхцөлийн kind) уншина; идэвхжүүлэлтийн босго (заавал талбар + зургийн доод тоо `photo_min_count` + идэвхтэй listing agreement + match_tags) — `crm_property_activation_check()`; дутууг exception мессежээр жагсаана (F-203).
- Зураг: `crm_documents` (category='photo') + `is_cover`, `sort_order` талбар document_links дээр (F-204/704).
- Бүс автомат: insert-д zone_directory lookup → branch_id (F-207); гар өөрчлөлтөд `branch_override_reason` заавал (CHECK: branch_id ≠ zone-ийн branch бол reason not null — app давхаргад, DB-д trigger).
- Д-30: property insert trigger — бүртгэсэн агентын branch ≠ property branch бол cron-оор биш trigger дотор `pg_notify` бус: **cron `crm-sla` route нь `crm_rule_runs`-д таск үүсгэнэ** — үгүй, энгийнээр: server action `createProperty` дотор шууд tasks insert (хамтран ажиллах даалгавар) + rule_run лог. (Автомат даалгаврын НЭГ ЗАМ: action/cron доторх `runRule()` helper, §7).

### 2.7 Профайл, тохируулга (M2)

```sql
create table public.crm_need_profiles (      -- F-150–152 (худалдан авагч/түрээслэгч/хөрөнгө оруулагч/олон улс)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  profile_type text not null,                -- buyer|tenant|investor|intl_buyer
  goal_id uuid references public.crm_lookups(id),
  locations jsonb not null,                  -- сонирхсон бүсүүд
  property_types text[] not null,
  budget_min numeric(14,2), budget_target numeric(14,2), budget_max numeric(14,2) not null,
  financing text not null,                   -- cash|loan|mixed|not_ready
  rooms_min int, area_min numeric(10,2),
  conditions text[],
  timeline text not null,                    -- '0_30'|'1_3m'|'3_12m'|'12m_plus'
  move_in_date date,                         -- түрээслэгчид заавал (app validation)
  must_haves jsonb not null default '[]',    -- 3–5 заавал шаардлага
  nice_to_haves jsonb not null default '[]',
  deal_breakers jsonb not null default '[]', -- F-158 таслах шүүлтүүр
  decision_maker text, blocker text,
  status crm_profile_status not null default 'active',
  paused_until date, lost_reason_id uuid references public.crm_lookups(id),
  fulfilled_txn_id uuid,                     -- F-156: Хангагдсанд хэлцлийн холбоос заавал (trigger)
  completeness_pct numeric(5,2),             -- F-159
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_need_budget check (budget_min is null or budget_min <= budget_max)  -- доод>дээд хориотой
);
create index crm_need_contact_idx on public.crm_need_profiles (contact_id, status);

create table public.crm_owner_profiles (     -- F-153
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  goal text not null,                        -- sell|rent_out|manage
  asking_price numeric(14,2) not null, terms text,
  urgency text, urgency_note text,
  decision_authority text not null,          -- sole|co_owner|poa
  listing_state text not null default 'none',-- none|negotiating|agreed
  status crm_profile_status not null default 'active',
  paused_until date, lost_reason_id uuid references public.crm_lookups(id),
  fulfilled_txn_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Материаллаг талбарын өөрчлөлтийн түүх (F-157) — crm_audit_log-т trigger-ээр (fields: budget, locations, must_haves, deal_breakers, timeline, asking_price).

create table public.crm_matches (            -- F-250–261
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  need_profile_id uuid not null references public.crm_need_profiles(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  direction text not null default 'profile_to_property', -- | 'property_to_profile' (урвуу F-254)
  score numeric(5,2) not null, breakdown jsonb not null, -- шалгуур бүрийн задаргаа (F-251)
  strength text not null,                    -- strong|possible|weak (босго тохиргоогоор)
  deal_breaker_hit boolean not null default false,       -- F-252: true бол санал болголтод орохгүй
  manual_override_reason text,               -- сул/таслагдсаныг гараар санал болгоход заавал
  weights_setting_id uuid references public.crm_settings(id), -- ямар хувилбараар тооцсон
  suggested_at timestamptz, suggested_by uuid references public.profiles(id),
  response crm_match_response, response_reason text, responded_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (need_profile_id, property_id, computed_at)
);
create index crm_matches_profile_idx on public.crm_matches (need_profile_id, score desc);
create index crm_matches_property_idx on public.crm_matches (property_id, score desc);
```

Оноожуулалт: `lib/crm/matching.ts` — цэвэр `scoreMatch(profile, property, weights) => {score, breakdown, dealBreakerHit}` (жин 25/25/20/10/15/5 нь `crm_settings key='match_weights'`-ээс). Дахин тооцох триггерүүд (F-255) — server action-ууд өөрчлөлтийн дараа `recomputeMatchesFor(profileId|propertyId)` дуудна; их хэмжээний тооцоо cron `crm-matching`-д (queue = `crm_rule_runs` pending мөрүүд).

### 2.8 Үйл ажиллагаа, боломж (M4, M5)

```sql
create table public.crm_activities (         -- F-300–312
                                             -- ⚠️ 000400 файлд crm_opportunities-ийн ДАРАА бичигдэнэ (opportunity_id FK — §2 дарааллын дүрэм);
                                             -- энд агуулгын үүднээс түрүүлж үзүүлэв.
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  opportunity_id uuid references public.crm_opportunities(id),
  lead_id uuid references public.crm_leads(id),
  channel crm_activity_channel not null,
  purpose text not null,
  summary text not null,
  attitude text, new_info text, objection_id uuid references public.crm_lookups(id),
  outcome crm_activity_outcome not null default 'open',
  next_step text, next_step_date date,       -- идэвхтэй сэжимд заавал (app+trigger)
  occurred_at timestamptz not null,          -- болсон огноо
  backdated boolean not null default false,  -- F-307: occurred_at < бүртгэсэн өдөр бол trigger тавина
  feedback_category text,                    -- үзлэгийн 24ц санал (F-310)
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()  -- бүртгэсэн огноо, immutable
);
create index crm_activities_contact_idx on public.crm_activities (contact_id, occurred_at desc);
create index crm_activities_opp_idx     on public.crm_activities (opportunity_id, occurred_at desc);
create index crm_activities_lead_idx    on public.crm_activities (lead_id);
create index crm_activities_owner_idx   on public.crm_activities (office_id, owner_id, occurred_at desc);

create table public.crm_opportunities (      -- F-350–362
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete restrict,
  stage_id uuid not null references public.crm_stages(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  need_profile_id uuid references public.crm_need_profiles(id),
  owner_id uuid not null references public.profiles(id),
  branch_id uuid references public.crm_branches(id),
  amount numeric(14,2), currency text not null default 'MNT',
  expected_close_on date,                    -- F-359
  state crm_opp_state not null default 'open',
  lost_reason_id uuid references public.crm_lookups(id), lost_note text, -- F-356
  aml_hold boolean not null default false,   -- denormalized (trigger AML-ээс)
  stage_entered_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_opp_lost_reason check (state <> 'lost' or lost_reason_id is not null)
);
create index crm_opp_stage_idx on public.crm_opportunities (office_id, pipeline_id, stage_id) where state = 'open';
create index crm_opp_owner_idx on public.crm_opportunities (office_id, owner_id, state);
create index crm_opp_contact_idx on public.crm_opportunities (contact_id);  -- crm_can_view_contact()-д ЗААВАЛ

create table public.crm_stage_history (      -- F-357
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  from_stage_id uuid references public.crm_stages(id),
  to_stage_id uuid not null references public.crm_stages(id),
  reason text, moved_by uuid references public.profiles(id),
  entered_at timestamptz not null default now(),
  left_at timestamptz
);
create index crm_stage_history_opp_idx on public.crm_stage_history (opportunity_id, entered_at);

create table public.crm_offers (             -- P-02 §2.4 санал/хэлэлцээр
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  direction text not null,                   -- 'offer'|'counter'
  amount numeric(14,2) not null, terms jsonb,
  valid_until date, relayed_at timestamptz,  -- дамжуулсан огноо систем хадгална
  position text, obstacle text, next_step text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.crm_task_links (         -- D2: tasks ↔ CRM объект
  task_id uuid not null references public.tasks(id) on delete cascade,
  entity text not null, entity_id uuid not null,
  rule_code text,                            -- 'D-01'…'D-30' автомат бол
  primary key (task_id, entity, entity_id)
);
create index crm_task_links_entity_idx on public.crm_task_links (entity, entity_id);
```

**Шатны шилжилтийн guard (гол механизм):** `crm_opportunity_stage_guard` BEFORE UPDATE OF stage_id:
1. `crm_stage_transitions`-д (old.stage → new.stage) мөр байгаа эсэх; байхгүй бол exception «Шилжилт зөвшөөрөгдөөгүй».
2. Дуудагчийн crm_role ⊆ allowed_roles ('skip' зөвхөн sales_director; 'backward' requires_reason → `crm.reason` GUC/RPC).
3. Зорилтот шатны `gate_code` байвал `crm_check_gate(opp, gate)` — дутуу жагсаалт exception мессежид (F-354).
4. `aml_hold=true` ба зорилтот шат нь гэрээ/хаалт чиглэл (`crm_stages.code in (…) ` биш — stage flag `is_closing_direction boolean` нэмнэ) бол exception (Д-12, F-360).
5. stage_history close/insert + `stage_entered_at` шинэчилнэ; audit_log.

Канбан drag-drop мөн адил server action → ижил trigger (F-352 «ижил босго»).

### 2.9 Хэлцэл, МУТСТ (M6, M9)

```sql
create table public.crm_transactions (       -- F-400–421
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,                      -- төрлийн угтвартай (crm_next_number('txn_'||type)), immutable
  type crm_txn_type not null,
  status crm_txn_status not null default 'draft',
  opportunity_id uuid not null references public.crm_opportunities(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  amount numeric(14,2) not null,
  currency text not null default 'MNT',
  fx_rate numeric(14,6) not null default 1,
  fx_rate_source text not null default 'auto',   -- 'auto'|'manual' (manual → шалтгаан + audit заавал)
  amount_mnt numeric(14,2) generated always as (amount * fx_rate) stored,  -- F-419, Д-25 босго үүн дээр
  opened_on date not null default current_date,
  contracted_on date, closed_on date,
  lease_id uuid,                             -- alter-ээр (circular)
  aml_case_id uuid,                          -- alter-ээр
  original_transaction_id uuid references public.crm_transactions(id), -- Replacement (F-413)
  file_completeness_pct numeric(5,2) not null default 0,               -- F-409 (тооцоолол trigger/action)
  cancellation_reason text, cancelled_at timestamptz, cancelled_by uuid references public.profiles(id),
  zero_fee_note text,                        -- F-414 «Хөлс 0₮, урамшуулал 0» автомат тэмдэглэл
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_txn_replacement check (type <> 'replacement' or original_transaction_id is not null)
);
-- Боломж→Хэлцэл 1:1, гэхдээ цуцлагдсан хэлцлийн дараа ижил боломж дээр ШИНЭ хэлцэл үүсгэж болно:
create unique index crm_txn_opp_active_uq on public.crm_transactions (opportunity_id) where status <> 'cancelled';
create index crm_txn_status_idx on public.crm_transactions (office_id, status, type);

create table public.crm_transaction_parties (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  role crm_party_role not null,
  unique (transaction_id, contact_id, role)
);
create table public.crm_transaction_agent_roles (  -- F-402/451 үүргийн бүртгэл = урамшууллын нотолгооны эх
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  agent_profile_id uuid not null references public.profiles(id),
  role crm_commission_role not null,
  split_pct numeric(5,2),                    -- F-458 хамтарсан үүргийн хуваарилалт (хаалтын ӨМНӨ)
  unique (transaction_id, agent_profile_id, role)
);
create table public.crm_transaction_contracts (    -- F-403
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  contract_type text not null, number text not null,
  signed_on date, valid_from date, valid_to date,
  doc_id uuid,                               -- гарын үсэгтэй хавсралт
  created_at timestamptz not null default now()
);
create table public.crm_payment_schedule_lines (   -- F-405/406
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  due_on date not null, amount numeric(14,2) not null,
  kind text not null, note text,
  paid_amount numeric(14,2) not null default 0,    -- payments тулгалтаас trigger шинэчилнэ
  created_at timestamptz not null default now()
);
create table public.crm_handover_items (           -- F-407 (checklist template-ээс clone)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  label text not null, done boolean not null default false,
  done_on date, responsible_id uuid references public.profiles(id),
  sort_order int not null default 0
);
create table public.crm_transaction_approvals (    -- F-410–412 Transaction Approval
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  rationale text not null,
  fee_change text not null,                  -- 'discount'|'waiver'|'special'
  approved_amount numeric(14,2),
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  doc_id uuid,
  created_at timestamptz not null default now()
);
create table public.crm_checklist_templates (      -- F-407/F-400 төрөл бүрийн шалгах хуудас (тохиргоо)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  scope text not null,                       -- 'handover_sale'|'handover_rental'|'replacement_evidence'|'closing'|'post_sale'|'required_docs_<type>'
  items jsonb not null,                      -- [{label, required, doc_category?}]
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

**Хэлцлийн төлөвийн guard** (`crm_transaction_status_guard` BEFORE UPDATE OF status) — F-420 хүснэгтээр:
- draft→contract: parties(худалдагч/авагч эсвэл түрээслэгч/түрээслүүлэгч) + agent_roles + G4 (`crm_check_gate`) + AML hold ≠ true.
- contract→payment: гэрээний бүртгэл ≥1 (doc-той) + payment_schedule ≥1.
- payment→closed: file_completeness_pct=100 + G5 + AML hold ≠ true + Санхүүгийн орлого баталгаажилт (income payment verified байгаа) + post-sale даалгавар үүссэн (Д-09-ийн урьдач — action үүсгэнэ).
- →cancelled: reason заавал; commission rollback (F-462/463) job үүсгэнэ.
- closed төлөвт орсны дараа: `crm_protect_closed_txn` trigger бүх UPDATE-ыг хориглоно (залруулга зөвхөн `crm_txn_corrections` хүснэгтээр — эрх бүхий, аудиттай).
- F-411: стандарт хөлснөөс зөрсөн commission суурь/нэхэмжлэхийн дүн — approval мөргүй бол хадгалагдахгүй (invoice/commission insert trigger дотор шалгана: `expected = policy rate`, зөрвөл `crm_transaction_approvals` шаардана).
- **F-419 ₮ дүйцэл АВТОМАТ:** `crm_settings key='fx_rates'` — өдөр бүрийн ханшийн хүснэгт `{date: {USD: 3450, ...}}` (sysadmin/finance гараар эсвэл скриптээр шинэчилнэ, хувилбартай). Transaction/payment insert/update үед currency ≠ MNT бол action тухайн өдрийн ханшийг эндээс автомат бөглөнө (`fx_rate_source='auto'`); ханш олдохгүй бол хадгалалт алдаа буцаана («Өнөөдрийн ханш тохируулагдаагүй»). Гар override → `fx_rate_source='manual'` + шалтгаан заавал + audit_log мөр. Ингэснээр Д-25-ын 20 сая ₮ босгын amount_mnt тооцоо мартагдсан/буруу ханшнаас хамгаалагдана.

```sql
-- МУТСТ хязгаарлагдмал бүс (M9)
create table public.crm_aml_cases (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  transaction_id uuid references public.crm_transactions(id),
  status crm_aml_case_status not null default 'open',
  gate_checks jsonb not null default '{}',       -- §7.3-ын 12 талбарын снапшот гейт бүрд
  str_due_at timestamptz,                        -- Д-26: 24 цагийн тоолуур
  threshold_due_on date,                         -- Д-25: ажлын 5 өдөр (crm_add_business_days)
  decision text, decision_rationale text,
  officer_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.crm_aml_holds (              -- §7.5 Hold — 5 үйлдлийн түгжээ
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  placed_by uuid not null references public.profiles(id),
  placed_at timestamptz not null default now(),
  rationale text not null,
  released_by uuid references public.profiles(id), released_at timestamptz, release_rationale text
);
create index crm_aml_holds_txn_idx on public.crm_aml_holds (transaction_id) where released_at is null;
-- trigger: hold insert/release → crm_transactions/opportunities.aml_hold синк + audit.
create table public.crm_aml_alerts (             -- §7.6 дотоод дохиоллын маягт (Маягт 1)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid references public.crm_contacts(id),
  transaction_id uuid references public.crm_transactions(id),
  payment_id uuid,
  alert_kind text not null,                      -- 'manual'|'threshold' (Д-25 автомат)
  detected_at timestamptz not null default now(),
  reported_by uuid not null references public.profiles(id),
  category text, observed text, amount_mnt numeric(14,2), payment_method text,
  parties jsonb, urgent boolean not null default false,
  case_id uuid references public.crm_aml_cases(id),
  created_at timestamptz not null default now()
);
-- RLS: insert — бүх staff (өөрийн office); select/update — ЗӨВХӨН aml_officer. Үүсгэгч агентад явц харагдахгүй.
```

AML hold-ийн 5 түгжээ (§7.5) DB guard-ууд: (1) stage guard (дээр); (2) `crm_transaction_contracts` insert; (3) `crm_payments` (kind='income') insert + `crm_invoices` status→sent; (4) `crm_commission_records` insert/status; (5) handover баталгаажуулалт — бүгд `crm_txn_on_hold(txn_id)` helper шалгана.

> ⚠️ **Хөндлөн-хүснэгт бичдэг trigger функц БҮР `security definer set search_path = public`** (дуудагчийн RLS-ээс үл хамааран бичилт амжина): invoice status авто-шилжилт + schedule_line.paid_amount (payments trigger), **Д-25 alert+case үүсгэлт** (finance/агентын payment insert үед `crm_aml_alerts`/`crm_aml_cases`-д бичих ёстой — тэдгээрийн insert policy дуудагчид хаалттай), hold↔aml_hold денормал синк, kyc синк, ownership_history, stage_history, `crm_audit_log` бичилтүүд, lifecycle шилжилтийн лог. Зөвхөн NEW/OLD шалгаад exception шиддэг guard-ууд (`crm_protect_immutable`, статус guard-уудын шалгалтын хэсэг г.м.) definer шаардахгүй — invoker хэвээр.

### 2.10 Түрээсийн менежмент (M8)

```sql
-- btree_gist, pg_trgm хоёул 000100 foundation-д `with schema extensions`-тэй үүссэн (Supabase конвенц) — энд давтахгүй.

create table public.crm_management_agreements (  -- F-510–514 (өмчлөгчтэй)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  owner_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  start_on date not null, end_on date,
  fee_pct numeric(5,2) not null,                 -- гэрээ тус бүрийн хувь (журмын жишиг default-ыг settings-ээс санал болгоно)
  reporting_frequency text not null default 'monthly',
  inspection_rights text, inspection_frequency text,
  notice_days int not null default 30,
  repair_approval_limit numeric(14,2) not null,  -- F-513 → F-548
  status text not null default 'active',         -- draft|active|terminated
  renewal_reminder_days int,                     -- F-512 (Lease-ээс тусдаа)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (office_id, number)
);
create table public.crm_management_agreement_properties ( -- 1 гэрээ — N объект (F-511)
  agreement_id uuid not null references public.crm_management_agreements(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  terms jsonb,
  primary key (agreement_id, property_id)
);

create table public.crm_leases (                 -- F-500–509
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  tenant_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  landlord_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  transaction_id uuid references public.crm_transactions(id),
  start_on date not null, end_on date not null,
  monthly_rent numeric(14,2) not null,
  payment_day int not null check (payment_day between 1 and 31),
  grace_days int not null default 0,
  deposit_amount numeric(14,2) not null,
  deposit_holder crm_expense_bearer,             -- landlord|pmc
  deposit_received_on date, deposit_returned_on date, deposit_returned_amount numeric(14,2),
  is_managed boolean not null default false,
  management_agreement_id uuid references public.crm_management_agreements(id),
  duration_tier text,                            -- F-502: '12m_plus'|'6_11m'|'1_5m' (trigger тооцно, settings 'rental_fee_tiers')
  indexation jsonb,                              -- F-508
  status crm_lease_status not null default 'draft',
  previous_lease_id uuid references public.crm_leases(id), -- сунгалтын гинж (F-504)
  termination_reason text, termination_docs jsonb,
  signed_doc_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_lease_dates check (start_on < end_on),
  -- ⭐ Нэг объект дээр нэг мөчид НЭГ идэвхтэй гэрээ (зарчим/§2.2.3).
  -- '[)' хагас нээлттэй муж: сунгалтын шинэ гэрээ хуучны end_on өдрөөс эхэлж болно (давхцал биш):
  constraint crm_leases_one_active exclude using gist (
    property_id with =,
    daterange(start_on, end_on, '[)') with &&
  ) where (status = 'active')
);
create index crm_leases_property_idx on public.crm_leases (property_id, status);
create index crm_leases_tenant_idx   on public.crm_leases (tenant_contact_id);
create index crm_leases_landlord_idx on public.crm_leases (landlord_contact_id);
create index crm_leases_end_idx on public.crm_leases (office_id, end_on) where status = 'active';
-- renewLease бичилтийн дараалал (constraint immediate тул): ЭХЛЭЭД хуучин мөрийг status='renewed',
-- ДАРАА НЬ шинэ active мөр insert — §6.2 crm-leases action-д хатуу заасан.

create table public.crm_lease_expense_lines (    -- F-505
  lease_id uuid not null references public.crm_leases(id) on delete cascade,
  expense_type text not null,                    -- electricity|water|heating|hoa|internet|other
  bearer crm_expense_bearer not null,
  primary key (lease_id, expense_type)
);

create table public.crm_invoices (               -- F-515–524
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  type crm_invoice_type not null,
  lease_id uuid references public.crm_leases(id),
  transaction_id uuid references public.crm_transactions(id),
  recipient_contact_id uuid not null references public.crm_contacts(id),
  period_month date,                             -- сарын нэхэмжлэхэд (сар бүр НЭГ: unique доор)
  issued_on date not null default current_date,
  due_on date not null,
  amount numeric(14,2) not null,
  status crm_invoice_status not null default 'planned',
  approval_doc_id uuid,                          -- F-523 нэмэлт үйлчилгээнд бичгэн зөвшөөрөл заавал
  corrected_invoice_id uuid references public.crm_invoices(id), -- F-522 залруулгын гинж
  cancel_reason text, cancelled_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (office_id, number),
  unique (lease_id, type, period_month)          -- Д-13: сар бүр нэг л сарын нэхэмжлэх
);
create index crm_invoices_due_idx on public.crm_invoices (office_id, status, due_on);
-- trigger crm_invoice_guard: (а) type='extra_service' → approval_doc_id заавал; (б) status='paid' мөрийг
--   cancelled болгох UPDATE хориотой (F-522); (в) status зөвхөн F-519 хүснэгтийн шилжилтээр;
--   (г) sent руу шилжихэд AML hold шалгана.

create table public.crm_payments (               -- F-525–534
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  kind crm_payment_kind not null,                -- income | control (зөвхөн income шимтгэлийн суурь)
  invoice_id uuid references public.crm_invoices(id),
  schedule_line_id uuid references public.crm_payment_schedule_lines(id),
  transaction_id uuid references public.crm_transactions(id),
  lease_id uuid references public.crm_leases(id),
  paid_on date not null, amount numeric(14,2) not null,
  currency text not null default 'MNT', fx_rate numeric(14,6) not null default 1,
  amount_mnt numeric(14,2) generated always as (amount * fx_rate) stored,
  method text not null,                          -- bank|cash|foreign|virtual|other
  doc_id uuid,
  finance_verified_by uuid references public.profiles(id), finance_verified_at timestamptz, -- F-527
  correction_of_id uuid references public.crm_payments(id), refund_note text,               -- F-530
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_payment_link check (invoice_id is not null or schedule_line_id is not null or transaction_id is not null)
);
create index crm_payments_invoice_idx  on public.crm_payments (invoice_id);
create index crm_payments_schedule_idx on public.crm_payments (schedule_line_id);
create index crm_payments_txn_idx      on public.crm_payments (transaction_id);
create index crm_payments_lease_idx    on public.crm_payments (lease_id);
-- trigger-ууд: (1) invoice үлдэгдэл тооцож status автомат (partially_paid/paid — F-519/528);
-- (2) schedule_line.paid_amount шинэчлэх (F-406); (3) Д-25: method in (cash,foreign,virtual)
--     ба amount_mnt >= setting('aml_threshold_mnt') → crm_aml_alerts(kind='threshold') + case tимер;
-- (4) AML hold үед kind='income' insert хориотой; (5) update/delete зөвхөн finance (RLS).

create table public.crm_deposit_deductions (     -- F-541–544
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  lease_id uuid not null references public.crm_leases(id) on delete restrict,
  category text not null,                        -- damage|unpaid_rent|utility_debt
  amount numeric(14,2) not null,
  rationale text not null,
  evidence_inspection_item_id uuid not null,     -- F-542: гарах үзлэгийн мөрийн нотолгоо ЗААВАЛ (FK доор)
  approved_by uuid references public.profiles(id), approved_at timestamptz, -- F-543 агент дангаар шийдэхгүй
  created_at timestamptz not null default now()
);

create table public.crm_vendors (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  name text not null, phone text, specialty text, is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.crm_maintenance_requests (   -- F-545–554
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  source text not null,                          -- tenant|inspection|owner|pm_team
  category_id uuid references public.crm_lookups(id),
  urgency crm_urgency not null default 'normal',
  description text not null,
  status crm_maintenance_status not null default 'new',
  owner_approval_needed boolean not null default false, -- дүн > agreement.repair_approval_limit → trigger
  owner_approved_at timestamptz, owner_approval_doc_id uuid,
  emergency_bypass boolean not null default false,      -- F-549 (дараа нөхөн баталгаажна)
  vendor_id uuid references public.crm_vendors(id),
  assigned_to uuid references public.profiles(id),
  estimate_amount numeric(14,2), actual_amount numeric(14,2),
  cost_bearer crm_expense_bearer,
  sla_respond_by timestamptz, sla_resolve_by timestamptz, -- settings 'maintenance_sla'
  completed_on date, completion_doc_id uuid,              -- F-553 нотолгоогүй хаалт хориотой (trigger)
  complaint_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_maint_status_idx on public.crm_maintenance_requests (office_id, status, urgency);

create table public.crm_monthly_records (        -- F-555–559 (журмын 9.2 маягт)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agreement_id uuid not null references public.crm_management_agreements(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  month date not null,                           -- сарын 1-ний огноо
  data jsonb not null default '{}',              -- маягтын 17 талбар (autofill талбарууд cron бөглөнө)
  completeness_pct numeric(5,2) not null default 0,
  net_income numeric(14,2),
  commission_hold boolean not null default false,-- F-559 → F-461
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, property_id, month)      -- сар бүрд НЭГ бүртгэл
);

create table public.crm_owner_statements (       -- F-560–564
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agreement_id uuid not null references public.crm_management_agreements(id) on delete restrict,
  owner_contact_id uuid not null references public.crm_contacts(id),
  period_start date not null, period_end date not null,
  income numeric(14,2) not null default 0,
  expenses numeric(14,2) not null default 0,
  mgmt_fee numeric(14,2) not null default 0,
  net_payout numeric(14,2) generated always as (income - expenses - mgmt_fee) stored, -- F-561
  detail jsonb not null default '{}',
  sent_at timestamptz, acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, period_start)
);

create table public.crm_inspections (            -- F-575–579
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  kind crm_inspection_kind not null,
  inspected_on date not null,
  confirmed_by_tenant boolean not null default false,
  confirmed_by_staff uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.crm_inspection_items (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  inspection_id uuid not null references public.crm_inspections(id) on delete cascade,
  room text, item text not null,
  condition text not null, note text, photo_doc_id uuid,
  matched_item_id uuid references public.crm_inspection_items(id), -- move-out ↔ move-in зэрэгцүүлэлт (F-576)
  discrepancy boolean not null default false
);
alter table public.crm_deposit_deductions
  add constraint crm_deduction_evidence_fk foreign key (evidence_inspection_item_id)
  references public.crm_inspection_items(id);

create table public.crm_arrears_escalations (    -- F-535–539 хоцролтын шатлал
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  invoice_id uuid not null references public.crm_invoices(id) on delete restrict,
  lease_id uuid not null references public.crm_leases(id) on delete restrict,
  step int not null,                             -- 1..5 (settings 'arrears_ladder': босго+хариуцагч дүр)
  assigned_role crm_role not null,
  task_id uuid references public.tasks(id),
  escalated_at timestamptz not null default now(),
  unique (invoice_id, step)
);
```

Proration (F-585): `lib/crm/proration.ts` — `prorate(monthlyAmount, periodStart, periodEnd, month) => amount` цэвэр функц; сарын нэхэмжлэх үүсгэлт, менежментийн гэрээний эцсийн тооцоо (F-514), дундуур цуцлалт бүгд үүнийг хэрэглэнэ (unit тест).

### 2.11 Шимтгэл (M7)

```sql
create table public.crm_commission_config_versions ( -- F-452/453: 5 журмын бүтэц versioned
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  policy_code text not null,                 -- 'PMC-SAL-POL-001'|'PMC-SAL-BR-POL-001'|'PMC-INT-SAL-POL-001'|'PMC-RENT-POL-001'|'PMC-PM-POL-001'
  payload jsonb not null,                    -- үүрэг/хувь/босго/оператор(>|>=)/stacking/дээд хязгаар/шатлал
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_comm_cfg_idx on public.crm_commission_config_versions (office_id, policy_code, valid_from desc);

create table public.crm_commission_records (   -- F-450–474
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  source_type text not null,                   -- 'transaction'|'lease_monthly'
  transaction_id uuid references public.crm_transactions(id),
  lease_id uuid references public.crm_leases(id),
  monthly_record_id uuid references public.crm_monthly_records(id),
  recipient_type text not null default 'agent',-- agent|team|company
  recipient_profile_id uuid references public.profiles(id),
  role crm_commission_role not null,
  applied_rate_pct numeric(7,4) not null,
  base_amount numeric(14,2) not null,          -- F-455 татварын дараах, Санхүү баталгаажуулсан цэвэр орлого
  amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,-- F-464 хэсэгчилсэн
  status crm_commission_status not null default 'calculated',
  hold_reason text,
  config_version_id uuid not null references public.crm_commission_config_versions(id),
  evidence jsonb not null default '{}',        -- F-451 нотолгооны снапшот {kind: ref_id/ok}
  created_at timestamptz not null default now(),
  constraint crm_comm_source check (
    (source_type = 'transaction' and transaction_id is not null)
    or (source_type = 'lease_monthly' and lease_id is not null and monthly_record_id is not null))
);
create index crm_comm_recipient_idx on public.crm_commission_records (office_id, recipient_profile_id, status);
create index crm_comm_txn_idx on public.crm_commission_records (transaction_id);
create index crm_comm_lease_idx on public.crm_commission_records (lease_id);
create index crm_comm_monthly_idx on public.crm_commission_records (monthly_record_id);

create table public.crm_commission_status_history (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  record_id uuid not null references public.crm_commission_records(id) on delete cascade,
  from_status crm_commission_status, to_status crm_commission_status not null,
  decided_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create table public.crm_commission_clawbacks (   -- F-462/463 (автоматаар хэрэгжихгүй)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  record_id uuid not null references public.crm_commission_records(id) on delete restrict,
  amount numeric(14,2) not null,               -- сөрөг гүйлгээ
  reason_category text not null,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.crm_commission_disputes (    -- F-474
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  content text not null, evidence jsonb, decision text, rationale text,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
```

**Тооцооллын хөдөлгүүр** — `lib/crm/commission.ts` цэвэр функцүүд (unit тестийн гол бай):
- `classifyLeaseDuration(start, end, tiers)` → '12m_plus'|'6_11m'|'1_5m' (F-502/465).
- `calcCommission({policy, roles, baseAmount, price, flags}) => rows[]` — босгын оператор (>|>=), stacking, co-brokerage туг үед стандарт selling хаах (F-468), олон улсын 3 хувилбар давхардуулахгүй (F-467), нийлбэр cap шалгаж хэтэрвэл `{locked: true}` (F-459), replacement → 0 (F-414).
- `calcMonthlyPmCommission(netIncome, ratio)` (F-466).
**Урсгалын guard** (`crm_commission_status_guard`): calculated→reviewed (file_completeness=100 + splits бүртгэгдсэн + sales_director/ops_qc), reviewed→approved (ceo), approved→paid/partially_paid (finance), →hold (F-461 нөхцөл: monthly record дутуу, handover дутуу, нотолгоо дутуу, ноцтой гомдол —系 автомат тавьж, гараар суллана), шат алгасахыг хориглоно; түүх + audit. **Үүсэх нөхцөл (F-454):** transaction closed AND income payment finance_verified → action `generateCommissions(txnId)` (cron давхар сканнердана — гээгдэл хамгаалалт).

### 2.12 Баримт, автоматжуулалт, мэдэгдэл, дараах үйлчилгээ (M10, F-700–799)

```sql
create table public.crm_documents (              -- F-700–709; Storage: private bucket 'crm-docs'
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  category crm_doc_category not null,            -- ангилал = хандалтын эрхийн үндэс (F-701/706)
  title text not null,
  storage_path text not null,                    -- crm-docs/{office_id}/{uuid}
  mime text, size_bytes bigint,
  version int not null default 1,
  parent_document_id uuid references public.crm_documents(id), -- F-702 хувилбар гинж
  retention_until date,                          -- F-707: aml → үүсгэхэд +5 жил (тохиргоо)
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.crm_document_links (         -- нэг файл — олон объект (M:N)
  document_id uuid not null references public.crm_documents(id) on delete cascade,
  entity text not null, entity_id uuid not null,
  is_cover boolean not null default false, sort_order int not null default 0,
  primary key (document_id, entity, entity_id)
);
create index crm_doc_links_entity_idx on public.crm_document_links (entity, entity_id);
-- trigger crm_document_delete_guard: retention_until > today бол DELETE exception (F-707).
-- Хязгаарлагдмал (aml/ownership/identity) баримтын үзэлт: queries-crm-docs.getSignedUrl() бүрд
--   crm_audit_log(action='view_restricted') мөр (F-709) — RPC 'crm_log_doc_view'.
-- F-703 upload policy: crm_settings key='doc_upload_policy' = {категори тус бүрд: allowed_mime[], max_bytes}.
--   uploadDocument action (crm-docs.ts) бүр энэ тохиргоогоор MIME whitelist + өргөтгөл ↔ MIME тулгалт +
--   хэмжээний шалгалт хийж, зөрвөл монгол алдаа буцаана; signed URL-ууд Content-Disposition: attachment-тай.
--   Хортой агуулгын гүн скан (антивирус) = 2.0 — v1-д whitelist хамгаалалтыг ил баримтжуулав.

create table public.crm_automation_rules (       -- F-600–603 (Д-дүрмүүд өгөгдөл болно); DDL нь 000100 foundation-д (U2+ нэгжүүд runRule-д хэрэглэдэг тул — §10)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  code text not null,                            -- 'D-01'…'D-30' + шинэ дүрэм
  name text not null,
  trigger_kind text not null,                    -- 'event:<entity>.<change>' | 'cron:daily' | 'cron:monthly'
  condition jsonb not null default '{}',
  actions jsonb not null,                        -- [{kind:'create_task'|'notify'|'set_field'|'transition'|'create_record'|'block', params}]
  is_active boolean not null default true,
  dry_run boolean not null default false,        -- F-601 туршилтын горим
  created_at timestamptz not null default now(),
  unique (office_id, code)
);
create table public.crm_rule_runs (              -- F-602 гүйцэтгэлийн лог + async ажлын queue
  id bigint generated always as identity primary key,
  office_id uuid not null,
  rule_code text not null,
  entity text, entity_id uuid,
  status text not null default 'ok',             -- 'ok'|'error'|'skipped'|'dry_run'|'pending'
  result jsonb, error text,
  ran_at timestamptz not null default now()
);
create index crm_rule_runs_idx on public.crm_rule_runs (office_id, rule_code, ran_at desc);

create table public.crm_notification_matrix (    -- F-651 (эхний багц seed)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  event_code text not null,                      -- 'lead_assigned'|'next_step_overdue'|'arrears_step'|...
  recipient_roles crm_role[] not null,
  channels text[] not null default '{app}',      -- app|push|email|sms (email/sms = INT- заглушка)
  mandatory boolean not null default false,      -- F-652: хаах боломжгүй ангилал
  quiet_hours_exempt boolean not null default false,
  escalation jsonb,                              -- F-655 гинж
  unique (office_id, event_code)
);
create table public.crm_notification_prefs (     -- F-652
  profile_id uuid not null references public.profiles(id) on delete cascade,
  office_id uuid not null,
  event_code text not null,
  channels text[] not null,
  primary key (profile_id, event_code)
);
-- mandatory event-ийг pref-ээр хаахыг app давхарга + BEFORE INSERT/UPDATE trigger шалгана
-- (Postgres CHECK өөр хүснэгт рүү хандаж чадахгүй тул trigger: crm_notification_matrix.mandatory=true
--  event-ийн channels-ыг хоослох оролдлогод exception).
-- Илгээлтийн лог (F-656) = notifications хүснэгт (in-app) + crm_rule_runs (гадаад сувгийн оролдлого).

create table public.crm_nps_surveys (            -- F-751
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  sent_at timestamptz, score int check (score between 0 and 10), comment text, answered_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.crm_referrals (              -- F-752/753 хоёр чиглэлийн холбоос
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  referrer_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.crm_complaints (             -- гомдол (NPS доогуур, гар)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  source text not null,                          -- 'nps'|'manual'|'maintenance'
  severity text not null default 'normal',       -- 'normal'|'serious' (serious → commission hold нөхцөл)
  description text not null,
  status text not null default 'open',           -- open|in_progress|resolved
  resolved_at timestamptz, resolution text,
  created_at timestamptz not null default now()
);

create table public.crm_handover_acts (          -- P-10 гарах ажилтны хүлээлцэх
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  staff_id uuid not null references public.crm_staff(id) on delete restrict,
  items jsonb not null,                          -- шилжүүлсэн бичлэгүүдийн жагсаалт
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  clients_notified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.crm_txn_corrections (        -- F-417 хаагдсан хэлцлийн залруулгын тусгай урсгал
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  changes jsonb not null, rationale text not null,
  approved_by uuid not null references public.profiles(id),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
```

**Нийт: 80 хүснэгт** (config/foundation 21 — үүнд duty_shifts, assignment_state, automation_rules, rule_runs, notification matrix/prefs; contacts/leads 9 — үүнд contact_tags; properties 7, profiles/match 3, activities/pipeline 5, txn/aml 11, rentals 14, commission 5, docs/post-sale 5) + 9 view. `types/database.ts`: U1 нь foundation хүснэгт/enum-ын entry + нэгж тус бүрийн **append-only бүсийн тэмдэглэгээ** (`// === U2: crm-contacts-leads ===` гэх мэт) үүсгэнэ; **нэгж бүр ӨӨРИЙН миграцийн хүснэгтүүдийн entry-г өөрийн бүсдээ өөрөө нэмнэ** (багана өөрчлөгдвөл эзэмшигч нэгж нь өөрөө засна — нэг нэгж бүхлийг нь урьдчилж бичихгүй). SUPABASE_DB_URL олдвол `supabase gen types typescript`-ээр үүсгэж гар бичилтээс бүрэн татгалзана (илүү найдвартай зам).

---

## 3. RLS төлөвлөгөө

### 3.1 Helper функцууд (security definer, `stable`, `set search_path = public` — recursion-оос сэргийлж profiles/crm_staff-ийг зөвхөн эндээс асууна)

**Байршил/хэлний дүрэм:** зөвхөн foundation хүснэгтүүдийг (profiles, crm_staff, teams, pipelines) дурддаг helper-үүд 000100-д `language sql`-ээр. Хожмын миграцийн хүснэгтүүдийг дурддаг helper-үүд (`crm_can_view_contact` — leads/opportunities/leases; `crm_txn_on_hold` — aml_holds) default `check_function_bodies=on` үед CREATE мөчид parse хийгдэж унадаг тул **`language plpgsql`-ээр бичиж** (бие нь үүсгэх үед resolve хийгдэхгүй) АШИГЛАГДАХ миграцидаа тодорхойлно: `crm_can_view_contact` → 000200 (leases хэсгийг exists-оор асуухад 000600-аас өмнө хүснэгт байхгүй ч policy зөвхөн ажиллах үед үнэлэгдэнэ гэдэгт найдахгүй — leases шалгалтыг `to_regclass('public.crm_leases') is not null` guard-тай эсвэл функцийг 000600-д `create or replace`-ээр өргөтгөнө), `crm_txn_on_hold` → 000500. Бүх helper-т §2.2-ын definer RPC дүрэм (grant/revoke) мөн үйлчилнэ.

```sql
create or replace function public.crm_office_id() returns uuid …            -- my_task_office_id() загвар (profiles → agents fallback)
create or replace function public.crm_my_staff_id() returns uuid …          -- crm_staff.id (idэвхтэй мөр)
create or replace function public.crm_my_roles() returns crm_role[] …       -- staff.roles; мөргүй бол '{}'
create or replace function public.has_crm_role(variadic r crm_role[]) returns boolean …  -- roles && r
create or replace function public.crm_is_manager() returns boolean …        -- sales_director|ops_qc|ceo
create or replace function public.crm_my_team() returns uuid …
create or replace function public.crm_same_office(o uuid) returns boolean … -- o = crm_office_id()
create or replace function public.crm_is_team_of(p_profile uuid) returns boolean … -- тухайн profile миний багийнх (team_lead-д)
create or replace function public.crm_can_view_contact(c uuid) returns boolean …
  -- эзэмшигч (lead/opportunity/lease-ээр) OR баг (team_lead) OR manager OR property_manager (менежменттэй холбоотой) OR finance/aml (унших)
create or replace function public.crm_can_view_pl6(p_pipeline uuid) returns boolean …
  -- pipelines.restricted=false OR has_crm_role('team_lead','sales_director','ops_qc','ceo','sysadmin')
create or replace function public.crm_txn_on_hold(t uuid) returns boolean … -- идэвхтэй aml_hold байгаа эсэх
```

### 3.2 Policy-ийн ерөнхий хэв (хүснэгт бүрд `<table>_<verb>` нэрээр)

Бүх policy-ийн УРЬДЧИЛСАН нөхцөл: `crm_same_office(office_id)` — өөр оффисын мөр ХЭЗЭЭ Ч харагдахгүй (multi-tenancy). Дараа нь дүрийн нөхцөл:

| Хүснэгт(үүд) | select | insert | update | delete |
|---|---|---|---|---|
| crm_branches/teams/lookups/settings/calendar/pipelines/stages/transitions/gate_requirements/notification_matrix/checklist_templates/automation_rules/sequences | office-ийн бүх staff ○ | sysadmin (settings-ийн financial key → finance ч болно) | sysadmin | policy ҮГҮЙ (архив flag) |
| crm_staff | staff бүгд ○ | sysadmin | sysadmin (offboarding guard trigger) | үгүй |
| crm_contacts | `crm_can_view_contact(id)`; marketing → тусдаа view (3.4) | staff бүгд (created_by=auth.uid()) | эзэмшигч/баг/manager; lifecycle trigger-ээр хамгаалагдана | үгүй |
| crm_contact_phones/emails/tags | contact-ийн эрх дагана | адил | адил | эзэмшигч (мөр солих/шошго хасах) |
| **crm_contact_aml** | **зөвхөн `has_crm_role('aml_officer')`** | aml_officer | aml_officer | үгүй |
| crm_contact_merges | ops_qc, aml_officer | **зөвхөн ops_qc** (F-109) | үгүй | үгүй |
| crm_leads | эзэмшигч OR баг(team_lead) OR manager OR (marketing ○) | staff | эзэмшигч/team_lead/manager; owner_id солих — зөвхөн RPC `crm_reassign_lead` (definer, эрх шалгана) | үгүй |
| crm_need/owner_profiles | contact-ийн эрх дагана | эзэмшигч | эзэмшигч/manager | үгүй |
| crm_properties | staff бүгд ○ (дундын сан — ToR «зөвшөөрөгдсөн дундын объектын сан»); бичих: роль agent+ | staff | property_roles-тэй агент / property_manager / manager | үгүй |
| crm_property_roles | staff ○ | листингийн агент/manager | sourcing мөр — зөвхөн RPC (sales_director/ops_qc) | үгүй |
| crm_matches | profile/property-ийн эрх дагана | service (definer fn) + staff | санал/хариу талбар — эзэмшигч | үгүй |
| crm_activities | contact-ийн эрх дагана | staff (owner_id=auth.uid()) | зохиогч 24 цагт (settings), дараа нь ops_qc | үгүй |
| crm_opportunities | эзэмшигч/баг/manager + `crm_can_view_pl6(pipeline_id)` AND (finance/aml ○) | staff (PL-6 → 5 дүр) | эзэмшигч/team_lead/manager; stage_id — trigger guard | үгүй |
| crm_transactions + дэд | opportunity-ийн эрх дагана; finance ●, aml ○ | эзэмшигч/manager | status guard + closed immutable | үгүй |
| **crm_aml_cases / crm_aml_holds** | **aml_officer** | aml_officer | aml_officer | үгүй |
| **crm_aml_alerts** | **aml_officer** | **staff бүгд INSERT (select-гүй!)** | aml_officer | үгүй |
| crm_leases/expense_lines | эзэмшигч агент/property_manager/manager/finance ○ | property_manager, agent | property_manager; status guard | үгүй |
| crm_invoices | мөн адил + finance ● | property_manager/finance | finance/property_manager (guard) | үгүй |
| crm_payments | адил | property_manager/finance (Д-25 trigger) | **зөвхөн finance** (F-534) | **зөвхөн finance** (аудиттай, залруулгаар) |
| crm_deposit_deductions | адил | property_manager | approved_by — зөвхөн manager/finance (F-543) | үгүй |
| crm_maintenance_requests/vendors | staff ○ (assigned ●) | staff | property_manager/assigned/manager | үгүй |
| crm_monthly_records/owner_statements | property_manager/manager/finance | cron (service role) + property_manager | property_manager (completeness trigger) | үгүй |
| crm_inspections/items | lease-ийн эрх дагана | property_manager/agent | адил | үгүй |
| **crm_commission_records** | **recipient_profile_id=auth.uid() OR finance/sales_director/ops_qc/ceo** (F-471) | service/definer fn | status — guard + дүрийн шат | үгүй |
| crm_commission_config_versions | finance/sales_director/ceo/ops_qc ○ | **finance + sysadmin** | valid_to хаах л зөвшөөрнө | үгүй |
| crm_documents/links | category-ээр: aml → aml_officer; ownership/identity → эрх бүхий; photo/бусад → холбоотой объектын эрх | staff | uploaded_by/manager | retention trigger хориглоно |
| crm_audit_log | 1.2 матрицаар (AML мөрүүд aml_officer-т л) | (definer fn-ууд бичнэ) | үгүй | үгүй |
| crm_saved_views/notification_prefs | өөрийн мөр ● | өөрөө | өөрөө | өөрөө |
| crm_nps/referrals/complaints | contact эрх дагана + marketing ○ (nps) | staff/cron | эзэмшигч/ops_qc | үгүй |

**Гүйцэтгэл:** policy дотор мөр-үл-хамаарах helper дуудлага бүрийг `(select public.crm_office_id())` хэлбэрээр subquery-д боож initplan кэш ашиглуулна (мөр бүрд дахин дуудагдахаас сэргийлнэ). `crm_can_view_contact()`-ийн exists асуулгуудад шаардлагатай индексүүд (leads/opportunities contact_id, leases tenant/landlord_contact_id) §2-т нэмэгдсэн.

### 3.3 МУТСТ хатуу тусгаарлалт (D7 механизм)

1. `crm_contact_aml`, `crm_aml_cases`, `crm_aml_holds`, `crm_aml_alerts`, `crm_documents(category='aml')` — SELECT зөвхөн aml_officer. sysadmin/admin-д ч policy нээгдэхгүй (platform admin service-role-оор л онцгой байдалд).
2. Бусад дүрд — `crm_contacts.kyc_public_status` (4 утга: Хүлээгдэж буй/Баталгаажсан/EDD/Түр зогсоосон) + `crm_opportunities.aml_hold`/`crm_transactions` дээрх hold туг — хоёул denormalized, security definer trigger синклэнэ.
3. Дохио үүсгэгч: `crm_aml_alerts_insert` policy (staff бүгд), SELECT policy-д ороогүй тул үүсгэсэн мөрөө ч харахгүй (tipping-off). UI-д «Дохио илгээгдлээ» гэсэн баталгаа л үзүүлнэ.
4. Хязгаарлагдмал баримтын үзэлт бүр `crm_log_doc_view()` RPC-ээр audit_log-т (F-709); AML audit мөрийг aml_officer-оос бусад нь харахгүй (audit policy-д entity шүүлт).
5. **AML кейс/дохионы дэлгэцийн хандалт БҮР аудитад (ToR §7.6.5):** `queries-crm-aml.getAmlCase/getAmlCases` шууд select биш definer RPC (`crm_get_aml_case(s)`) дуудна — RPC дотроо aml_officer эрх шалгаад мөр буцаахын өмнө `crm_audit_log(action='view_aml_case')` бичнэ (doc view-тэй ижил хэв).
6. МУТСТ баримт: `retention_until = created_at + interval '5 years'` (тохиргоогоор); delete guard trigger.

### 3.4 Талбарын түвшний нууцлал — view/column арга

- **Marketing-ийн хязгаарлагдмал харагдац:** `crm_v_contacts_marketing` — definer view (RLS алгасдаг!) тул **view-ийн биед өөрт нь шүүлт ЗААВАЛ суулгана:** `where office_id = public.crm_office_id() and public.has_crm_role('marketing','sysadmin')` (helpers нь өөрсдөө definer тул view дотор ажиллана) — эс бөгөөс нэвтэрсэн ДУРЫН хэрэглэгч (нийтийн сайтын buyer, өөр оффисынх ч) PostgREST-ээр бүх tenant-ийн масктай харилцагчийн өгөгдлийг уншина. Мөн `revoke select on crm_v_contacts_marketing from anon, public; grant select to authenticated;`. Баганууд: зөвхөн segment (crm_contact_tags-аас нэгтгэсэн), source, consent, grade, масктай утас-имэйл `left(normalized,4)||'****'`. Marketing дүрд crm_contacts дээр select policy өгөхгүй, зөвхөн энэ view-ээр. §8.1-ийн security_invoker view-үүд underlying RLS-ээ дагадаг тул энэ эрсдэлгүй — зөвхөн энэ definer view онцгой анхаарал шаардана.
- **Гейт төлөвийн нийтийн харагдац:** kyc_public_status багана (дээр).
- **Шимтгэлийн задаргаа:** агент crm_commission_records-оос өөрийн мөрөө бүрэн харна (F-471 хангагдана); бусдын дүн RLS-ээр хаалттай.
- Экспорт (F-123): бүх экспорт server action-аар (`exportContacts()` г.м.) — action дотор дүр шалгаад audit_log(action='export') бичээд CSV буцаана; шууд client-side query-гээр экспорт хийх зам байхгүй.

---

## 4. Route зураглал

### 4.1 Оффис панель — `app/(office)/office/(panel)/crm/`

```
crm/
├─ layout.tsx                 — CRM guard (crm_staff мөр шалгах) + <CrmNav/> хоёрдогч цэс
├─ page.tsx                   — R-06 Удирдлагын нэгдсэн самбар (+Даваа/Баасны хурлын горим ?view=monday|friday)
├─ leads/page.tsx             — P-01: жагсаалт/шүүлт/saved view/багц үйлдэл; Д-01 хуваарилалт
├─ leads/[id]/page.tsx        — сэжимийн карт: алтан дүрмийн блок, ангилал/оноо, timeline, давхардал
├─ contacts/page.tsx          — мастер сан, глобал хайлт, merge сонголт
├─ contacts/[id]/page.tsx     — 360° карт: профайлууд, боломж, хэлцэл, түрээс, баримт, гейт төлөв
├─ contacts/merge/page.tsx    — F-108 merge дэлгэц (?a=&b=) — зөвхөн ops_qc
├─ properties/page.tsx        — объектын сан (шүүлт F-219)
├─ properties/[id]/page.tsx   — объектын карт: роли, гэрээ, үнийн түүх, тохируулга, түрээсийн түүх, зураг
├─ pipeline/page.tsx          — Канбан ?pl=PL-1…PL-6 (PL-6 нь эрхтэйд л таб харагдана)
├─ deals/[id]/page.tsx        — боломжийн карт: шат+гейт checklist, санал/хэлэлцээр, activity
├─ transactions/page.tsx      — хэлцлийн жагсаалт (шүүлт+экспорт F-418)
├─ transactions/[id]/page.tsx — хавтас: талууд, үүрэг, гэрээ, төлбөрийн хуваарь, handover, бүрэн байдлын %, approvals
├─ commissions/page.tsx       — тооцооны жагсаалт (төлөвөөр), хянах/батлах/олгох үйлдэл (дүрээр)
├─ commissions/[id]/page.tsx  — задаргаа, нотолгоо, түүх; /print — тооцооны хуудас (F-472)
├─ rentals/page.tsx           — R-08 багцын самбар: гэрээнүүд, дуусах хугацаа, дүүргэлт
├─ rentals/leases/[id]/page.tsx     — гэрээний карт: гинж, нэхэмжлэх, барьцаа, үзлэг, хоцролт
├─ rentals/invoices/page.tsx        — нэхэмжлэх + насжилт (F-524); [id]/print
├─ rentals/maintenance/page.tsx     — засварын самбар (SLA-тай); [id]
├─ rentals/monthly/page.tsx         — R-07: сарын менежментийн бүртгэлүүд (?month=)
├─ rentals/statements/page.tsx      — өмчлөгчийн тайлан; [id]/print
├─ aml/page.tsx               — R-13 (зөвхөн aml_officer; layout-д давхар guard): кейс, дохио, hold, тоолуур
├─ aml/[id]/page.tsx          — кейсийн хавтас
├─ reports/page.tsx           — R-01…R-14 виджет цуглуулга (?r= сонголт)
└─ settings/
   ├─ page.tsx                — тохиргооны индекс
   ├─ pipelines/page.tsx      — урсгал/шат/шилжилт/магадлал/гейт
   ├─ scoring/page.tsx        — сэжим + тохируулгын жин, босго (versioned)
   ├─ commissions/page.tsx    — 5 журмын хувилбарууд
   ├─ zones/page.tsx          — бүсийн лавлах, салбар, баг
   ├─ rules/page.tsx          — Д-дүрмүүд (идэвх/dry-run), SLA, хуанли
   ├─ notifications/page.tsx  — матриц, загвар
   └─ lookups/page.tsx        — лавлах жагсаалтууд, checklist template
```

- Хуудас бүр `<div className="p-8">` wrapper (оффис конвенц), `searchParams: Promise<…>` await хийнэ (Next 16). **[id] хуудсуудын `params` мөн `Promise<{ id: string }>` — await хийнэ** (repo загвар: `tasks/[id]/page.tsx`); нэгж бүр Next 16 хэв маягийг `node_modules/next/dist/docs/`-оос тулгана.
- Guard: `crm/layout.tsx` — `crm_staff` идэвхтэй мөргүй бол redirect `/office`; aml/ ба settings/ хуудсууд өөрийн дүрийн шалгалтыг серверт давхар хийнэ.
- Оффис панелийн одоогийн layout guard (`office_admin|admin`) ХЭВЭЭР тул CRM-ийн удирдах дүрүүд office_admin байх ёстой (1.1) — гэхдээ §1.1-ийн эрхийн тэлэлтийн хаалтаар: `panel_admin=false` CRM ажилтанд CRM-ээс гадуурх оффис хуудсууд layout guard-аар хаагдаж (redirect `/office/crm`), бичих policy-ууд нь `crm_is_panel_admin()`-ээр DB түвшинд нарийссан. Агент дүртэй хүмүүс CRM-ээ агент панелиас хэрэглэнэ:

### 4.2 Агент панель — `app/(agent)/agent/(panel)/crm/`

Tasks модулийн basePath загвараар ижил shell-үүд dual-mount:

```
agent/crm/page.tsx            — R-01 Агентын өдрийн самбар: өнөөдрийн даалгавар, хэтэрсэн алхам,
                                 шинэ оноогдсон сэжим, үзлэгийн 24ц санал, өөрийн KPI
agent/crm/leads/…             — өөрийн сэжим (RLS өөрөө хязгаарлана) + [id]
agent/crm/pipeline/…          — өөрийн боломжийн канбан
agent/crm/contacts/[id]/…     — эрхийн хүрээний карт
agent/crm/properties/…        — дундын сан (унших) + өөрийн листинг
agent/crm/commissions/page.tsx — зөвхөн өөрийн тооцоо (F-471)
```

Агент хуудсууд `components/dashboard/DashboardNav.tsx`-ийн хэв маягаар `mx-auto max-w-7xl px-4 py-6` wrapper.

### 4.3 Sidebar өөрчлөлт

`components/office/OfficeSidebar.tsx` items массивт НЭГ л мөр нэмнэ (CRM доторх навигаци CrmNav-д):

```ts
{ href: "/office/crm", label: "CRM", icon: Briefcase },   // "Даалгавар"-ын дараа
```

`components/crm/CrmNav.tsx` — хоёрдогч хэвтээ цэс: Самбар · Сэжим · Харилцагч · Объект · Урсгал · Хэлцэл · Шимтгэл · Түрээс · AML(эрхтэйд) · Тайлан · Тохиргоо(эрхтэйд); дүрээр шүүгдэнэ (server-оос roles prop).

### 4.4 Cron route-ууд (D8)

```
app/api/cron/crm-monthly/route.ts   — сар бүр 1-нд: Д-13/Д-14 (нэхэмжлэх+сарын бүртгэл, proration F-585,
                                       сул сард алгасах), өмчлөгчийн тайлангийн даалгавар (Д-22)
app/api/cron/crm-daily/route.ts     — өдөр бүр: Д-15/16 (сануулга, хоцролтын шатлал),
                                       Д-17/18 (60/30 сунгалт), Д-21 (бүртгэл дутуу), Д-23 (барьцаа),
                                       Д-27 refresh, Д-28/29 (эргэн холбогдолт), F-105/125 integrity,
                                       F-655 escalation, идэвхгүйн тоолуур/эргэлт (P-10), NPS илгээлт (F-751),
                                       listing agreement сануулга (F-205), менежментийн гэрээний сунгалт (F-512)
app/api/cron/crm-matching/route.ts  — 10 мин тутам: pending дахин тооцоолол (F-259)
app/api/cron/crm-sla/route.ts       — 5–10 мин тутам: Д-02/03/04 (сэжимийн эхний холболт/дахин оролдлого/эскалаци),
                                       Д-20 (засварын sla_respond_by/sla_resolve_by хэтрэлт → мэдэгдэл + ҮА-ЧМТ шилжүүлэлт),
                                       Д-26 (СГТ 24ц тоолуур дөхөлт/хэтрэлтийн эскалаци)
```

Бүгд `Authorization: Bearer ${CRON_SECRET}` шалгаад `createAdminClient()`-ээр ажиллана; үр дүн бүр `crm_rule_runs`-д; алдаа sysadmin-д notification (F-602). vercel.json-д цагийн хуваарь.

- **Vercel төлөвлөгөө:** минут/цагийн давтамжтай cron нь Vercel **Pro** шаарддаг (Hobby: өдөрт 1 удаа, цөөн тоо). Дизайн Pro-г урьдач нөхцөл гэж үзнэ; Hobby fallback — GitHub Actions/Upstash QStash зэрэг гадаад scheduler-ээс ижил route-уудыг `CRON_SECRET`-тэй дуудах (route-ууд өөрчлөгдөхгүй), matching-ийг нэмэлтээр хэрэглэгчийн үйлдлийн дараах recompute-д тулгуулах.
- **Cron-оос үүсэх даалгаврын `tasks.created_by`:** `tasks.created_by` NOT NULL (profiles FK) тул систем-profile байхгүй нөхцөлд конвенц: **created_by = даалгаврын хариуцагч (responsible_id)**, хариуцагч тодорхойгүй бол оффисын идэвхтэй office_admin-ы profile. Автомат гэдгийг `crm_task_links.rule_code` ялгана.

---

## 5. Компонент архитектур (components/crm/*)

TasksPageShell загвар: нэг client shell = URL state + харагдац + үйлдлүүд; серверээс rows/options prop-оор; мутаци бүр server action → `useTransition` + `router.refresh()`; цэвэр туслахууд `utils.ts`-д.

| Файл | Үүрэг |
|---|---|
| `CrmNav.tsx` | Хоёрдогч цэс (дүрээр шүүгдсэн) |
| `LeadsPageShell.tsx` | Жагсаалт/шүүлт/saved views/багц үйлдэл; basePath prop (office/agent) |
| `LeadDetailShell.tsx` | Алтан дүрмийн блок (NextStepGuard), оноо задаргаа, ангилал, эзэмшил түүх |
| `LeadFormModal.tsx` | Үүсгэх/засах — давхардлын live анхааруулга (DuplicateHint) |
| `ContactsPageShell.tsx`, `ContactDetailShell.tsx` | 360° карт табууд (профайл/боломж/хэлцэл/түрээс/баримт/түүх) |
| `ContactMergeShell.tsx` | Талбар тус бүрийн сонголттой merge (F-108) |
| `NeedProfileForm.tsx`, `OwnerProfileForm.tsx` | Профайлын маягтууд (deal breaker бүтэцтэй оролт) |
| `PropertiesPageShell.tsx`, `PropertyDetailShell.tsx` | Сан + карт; идэвхжүүлэлтийн checklist (ActivationChecklist) |
| `MatchList.tsx`, `MatchResponseButtons.tsx` | Тохируулгын жагсаалт, 4 хариу, таслагдсан блок |
| `PipelineBoardShell.tsx` | Канбан: багана = crm_stages; drag → `moveOpportunityStage` action; гейт алдааг GateErrorDialog-оор жагсаана |
| `OpportunityDetailShell.tsx` | Шатны stepper + GateChecklist, offers, activities |
| `ActivityComposer.tsx`, `ActivityTimeline.tsx` | Бүртгэл (дараагийн алхам заавал), гурвалсан холбоос |
| `TransactionsPageShell.tsx`, `TransactionDetailShell.tsx` | Хавтас: CompletenessBar, PartyEditor, AgentRoleEditor (split), ScheduleTable, HandoverChecklist, ApprovalPanel |
| `CommissionsPageShell.tsx`, `CommissionDetailShell.tsx` | Төлөвийн урсгалын үйлдэл дүрээр; EvidencePanel |
| `RentalsPageShell.tsx`, `LeaseDetailShell.tsx` | Багц; гинжин холбоос харагдац (LeaseChain), барьцаа/суутгал |
| `InvoicesPageShell.tsx`, `InvoicePrint.tsx` | Насжилтын бүлэглэл; print CSS |
| `MaintenancePageShell.tsx` | SLA badge, зөвшөөрлийн урсгал, яаралтай bypass |
| `MonthlyRecordsShell.tsx`, `MonthlyRecordForm.tsx` | 17 талбарын маягт (autofill readonly хэсэгтэй), completeness |
| `OwnerStatementsShell.tsx`, `StatementPrint.tsx` | Тайлан + илгээлт бүртгэл |
| `InspectionShell.tsx` | Move-in/out зэрэгцүүлсэн харьцуулалт (2 багана, зөрүү highlight) |
| `AmlCaseShell.tsx`, `AmlAlertButton.tsx` | Кейс самбар (officer); дохио илгээх товч (бүх дүрд, илгээснийхээ дараа юу ч харуулахгүй) |
| `CrmDashboard/*.tsx` | Widget-ууд: KpiTile, FunnelChart, ForecastCard, OverdueList, ArrearsAging, OccupancyCard, GoldenRuleViolations |
| `AgentDayboard.tsx` | R-01 |
| `settings/*Shell.tsx` | PipelineSettings, ScoringSettings, CommissionConfigSettings, ZoneSettings, RuleSettings, NotificationSettings, LookupSettings |
| `utils.ts` | цэвэр туслахууд (format, бүлэглэл, шатны өнгө г.м.) |

UI kit-ээс Badge/Button/Card/Input/Field/Modal/Avatar ашиглана; шинээр хэрэгтэй бол `components/ui/`-д tabs.tsx, select.tsx, drawer.tsx нэмэх нь U1-д (нийтлэг, жижиг, Radix-гүй гар хийц — UserMenu-ийн dropdown хэв).

- `components/crm/utils.ts` — **U1 (crm-foundation) эзэмшинэ, эхнээс нь үүсгэнэ**; дараагийн нэгжүүд зөвхөн import хийнэ (өргөтгөл хэрэгтэй бол нэгжийн өөрийн `utils-<domain>.ts` файлд).
- **График/диаграм (FunnelChart, ForecastCard г.м.): бүгд гар бичмэл SVG/CSS (Tailwind semantic token өнгөөр) — гадны chart library (recharts г.м.) ХОРИОТОЙ** (repo-д chart dependency байхгүй; шинэ dependency зөвхөн zod).

---

## 6. Дата давхарга

### 6.1 Queries (`lib/queries-crm-*.ts` — энгийн async fn, RLS = эрхийн давхарга, select string module const, `toRow()` normalizer, `as unknown as T`)

| Файл | Гол функцүүд (signature) |
|---|---|
| `queries-crm-core.ts` | `getCrmStaffContext(): Promise<{staffId, roles: CrmRole[], branchId, teamId} \| null>`; `getBranches()`, `getLookups(kind)`, `getSettingValue<T>(key)`, `getPipelinesWithStages()` |
| `queries-crm-leads.ts` | `getLeads(filters: LeadFilters): Promise<LeadRow[]>`; `getLead(id): Promise<LeadDetail \| null>`; `findDuplicates(phone, email, name): Promise<DuplicateHit[]>`; `getGoldenRuleViolations()` |
| `queries-crm-contacts.ts` | `getContacts(filters)`, `getContact360(id): Promise<Contact360 \| null>` (профайл+боломж+хэлцэл+түрээс+activity эмбед), `globalSearch(q): Promise<SearchHit[]>` |
| `queries-crm-properties.ts` | `getProperties(filters)`, `getProperty(id)`, `getPriceHistory(id)`, `getZoneFor(address): Promise<{branchId, zoneId} \| null>` |
| `queries-crm-matching.ts` | `getMatchesForProfile(profileId)`, `getMatchesForProperty(propertyId)`, `getMatchHistory(contactId)` |
| `queries-crm-pipeline.ts` | `getBoard(pipelineCode): Promise<BoardColumn[]>`, `getOpportunity(id)`, `getStageHistory(id)`, `getForecast(pipelineCode)` |
| `queries-crm-transactions.ts` | `getTransactions(filters)`, `getTransaction(id): Promise<TxnDetail>` (талууд/үүрэг/гэрээ/хуваарь/handover/approvals эмбед), `getCompleteness(id)` |
| `queries-crm-commissions.ts` | `getCommissions(filters)` (RLS агентад өөрийнхийг л), `getCommission(id)`, `getCommissionSheet(id)` |
| `queries-crm-rentals.ts` | `getLeases(filters)`, `getLease(id)` (гинж+нэхэмжлэх+барьцаа+үзлэг), `getInvoices(filters)`, `getAging()`, `getMaintenance(filters)`, `getMonthlyRecords(month)`, `getOwnerStatements(filters)` |
| `queries-crm-aml.ts` | `getAmlCases(filters)`, `getAmlCase(id)` — шууд select БИШ, definer RPC (`crm_get_aml_case(s)`) дуудна: RPC дотроо aml_officer эрх шалгаад үзэлт бүрд `crm_audit_log(action='view_aml_case')` бичнэ (§3.3-5, ToR §7.6.5); `getContactAml(contactId)` — aml_officer-т л мөр буцаана (RLS) |
| `queries-crm-reports.ts` | view-дээс уншина: `getDashboard(scope: 'exec'\|'agent'\|'pm'\|'monday'\|'friday')`, `getKpiMonthly(month)`, `getLeadFunnel(range)`, `getSourceAttribution(range)` |

### 6.2 Actions (`lib/actions/crm-*.ts`, бүгд `"use server"`; буцаалт `{ ok / id?, error? }`; монгол алдааны текст; `revalidateCrmPaths()` helper; мэдэгдэл admin client try/catch; давхар scoping `.eq("office_id", ctx.officeId)`)

> ⚠️ **RETURNING+RLS конвенц (CRM action бүрд):** house идиом `.select("id")` нь бичсэн мөр SELECT policy-д харагдахгүй үед унадаг (өмнө нь `20260611000200_tasks_rls_returning_fix.sql`-д тохиолдсон). Тиймээс: (а) **`submitAmlAlert` — insert-д `.select()` ОГТ ЗАЛГАХГҮЙ** (crm_aml_alerts-д staff-ийн SELECT policy зориуд байхгүй — `.select()` залгавал алдаа буцаж tipping-off UX эвдэрнэ; default minimal returning хангалттай); (б) **owner/visibility өөрчилдөг update бүр** (`reassignLead`, `bulkAssign`, merge, offboarding шилжүүлэлт) — амжилтыг `.select()`-ээр биш `{ count: 'exact' }`-аар шалгана (owner солигдмогц мөр дуудагчийн харааноос гарч болно); (в) бусад insert-д `.select("id")` хэвээр зөв (үүсгэгч нь өөрийн мөрөө хардаг policy-тэй үед л).

| Файл | Гол функцүүд |
|---|---|
| `crm-leads.ts` | `createLead(input)` (давхардлын шалгалт + G0), `updateLead`, `setLeadGrade(id, grade, reason?)`, `logFirstContact`, `reassignLead(id, newOwner, reasonCode, note)` → RPC, `recycleLead`, `bulkAssign(ids, owner)` (team_lead+), `mergeContacts(primaryId, mergedId, choices)` (ops_qc) |
| `crm-contacts.ts` | `createContact`, `updateContact`, `setConsent`, `addPhone/addEmail`, `addTags(contactIds, lookupIds)` / `removeTags(contactIds, lookupIds)` (F-122 багц шошго — crm_contact_tags), `exportContacts(filters)` (аудиттай) |
| `crm-profiles.ts` | `createNeedProfile`, `updateNeedProfile` (материаллаг өөрчлөлт audit), `setProfileStatus(id, status, reason?)`, `createOwnerProfile`, … |
| `crm-properties.ts` | `createProperty` (бүс автомат + Д-30 даалгавар), `updateProperty` (үнэ өөрчлөлт → price_history), `setPropertyStatus(id, status, reason?)` (идэвхжүүлэлтийн шалгалт DB-д), `assignPropertyRole`, `createListingAgreement`, `publishToSite(propertyId)` (listings синк D1) |
| `crm-matching.ts` | `recomputeMatchesForProfile(id)`, `recomputeMatchesForProperty(id)`, `suggestMatch(matchId, overrideReason?)`, `recordMatchResponse(matchId, response, reason?)` (сонирхсон → үзлэгийн даалгавар + Matched шат) |
| `crm-activities.ts` | `logActivity(input)` (идэвхтэй сэжимд next step заавал; үзлэг бол Д-05 даалгавар), `completeNextStep(leadId)` |
| `crm-opportunities.ts` | `createOpportunity`, `moveStage(id, toStageId, reason?)` (guard-ын exception-ыг задалж дутуу жагсаалт буцаана), `transferPipeline(oppId, toPipelineCode, reason)` (F-361: хуучин урсгалын stage_history-г хааж, шинэ урсгалын эхний тохирох шатанд тавьж audit бичнэ — PL-4↔PL-3, PL-1/PL-3 салаанд), `closeLost(id, reasonId, note)`, `recordOffer(input)` (Д-06: runRule-ээр эргэн холбогдох сануулгын даалгавар + мэдэгдэл) |
| `crm-transactions.ts` | `createTransaction(opportunityId, type)` (дугаар авто), `setTxnStatus`, `addParty`, `setAgentRoles(txnId, roles[])` (split нийлбэр шалгалт), `addContract`, `addScheduleLine`, `toggleHandoverItem`, `requestApproval`, `approveTxnApproval`, `cancelTransaction`, `applyCorrection(txnId, changes, rationale)` |
| `crm-commissions.ts` | `generateCommissions(txnId)`, `generateMonthlyPmCommissions(month)`, `setCommissionStatus(id, to, note?)`, `holdCommission(id, reason)`, `releaseHold(id)`, `recordClawback`, `recordPayout(id, amount)` |
| `crm-leases.ts` | `createLease` (exclusion зөрчлийг ойлгомжтой алдаа болгоно), `activateLease` (signed doc шаардана), `renewLease(id, newTerms)` (гинж + Д-24), `terminateLease(id, reason, docs)` (Д-23 даалгаврууд), `giveNotice(id)` (Д-19), `recordDeposit*` |
| `crm-invoices.ts` | `createExtraServiceInvoice` (approval doc заавал), `createBrokerageInvoice(leaseId \| txnId)` (F-516б: энгийн түрээсийн нэг удаагийн зуучлалын хөлс — дүнг `classifyLeaseDuration` + settings `'rental_fee_tiers'`-ээс автомат санал болгоно, стандартаас зөрвөл F-411 approval шаардлага хэвээр; PL-3 Гэрээ шатны runRule-ээс өдөөгдөнө), `sendInvoice(id)`, `recordPayment(input)` (kind, Д-25 автомат DB-д; fx автомат §2.9), `verifyPayment(id)` (finance; менежменттэйд F-466 PM тооцоо runRule-ээр), `cancelInvoice(id, reason)`, `createCorrectionInvoice(id)` |
| `crm-maintenance.ts` | `createRequest`, `approveByOwner(id, docId)`, `assignVendor`, `startWork`, `closeRequest(id, completionDocId)`, `rejectRequest` |
| `crm-monthly.ts` | `saveMonthlyRecord(id, data)` (completeness тооцоод F-559 hold дамжуулна), `buildOwnerStatement(agreementId, period)`, `markStatementSent(id)` |
| `crm-aml.ts` | `submitAmlAlert(input)` (бүх дүр), `upsertContactAml(contactId, fields)` (officer), `setCaseStatus`, `placeHold(txnId, rationale)`, `releaseHold(holdId, rationale)`, `recordGateCheck(caseId, gate, snapshot)` |
| `crm-settings.ts` | `saveSetting(key, value, note)` (шинэ хувилбар мөр — update биш insert), `saveCommissionConfig(policyCode, payload)`, `savePipeline/Stage/Transition`, `saveZone`, `saveLookup`, `saveRule`, `saveNotificationMatrix`, `saveCalendar` |
| `crm-post-sale.ts` | `sendNps(txnId)`, `recordNpsAnswer`, `createReferral(referrerContactId, leadInput)`, `createComplaint`, `resolveComplaint` |
| `crm-staff.ts` | `upsertStaff`, `startOffboarding(staffId)` (Д-11 багцын жагсаалт + handover act), `approveHandover(actId)`, `deactivateStaff(staffId)` (дуусаагүй бол алдаа) |

### 6.3 Цэвэр логик (`lib/crm/*.ts` — unit тестийн бай, DB-гүй)

`normalize.ts` (утас/имэйл), `scoring.ts` (сэжимийн 100 оноо + ангилал), `assign.ts` (Д-01/F-126 хуваарилалт — §2.2а), `matching.ts` (тохируулгын оноо + deal breaker), `gates.ts` (checkGate), `commission.ts` (calcCommission, classifyLeaseDuration, calcMonthlyPmCommission), `proration.ts`, `calendar.ts` (addBusinessDays TS хувилбар — UI урьдчилсан харуулалтад), `arrears.ts` (шатлалын алхам тодорхойлох), `rules.ts`/`notify.ts` (U1 — §7).

**Validation (Zod v4 `.strict()`, монгол мессеж; ⚠️ zod-ыг package.json deps-д U1 нэмнэ) — репогийн домэйн-файл конвенцоор (listing.ts, task.ts) нэгж тус бүрийн файлд хуваана, нэг том crm.ts БАЙХГҮЙ:** U2 → `lib/validation/crm-contacts.ts`, `crm-leads.ts`; U3 → `crm-properties.ts`; U4 → `crm-pipeline.ts`; U5 → `crm-transactions.ts`, `crm-aml.ts`; U6 → `crm-rentals.ts`; U7 → `crm-commissions.ts`; U8 → `crm-automation.ts`. Нэгж бүр өөрийн файлаа эзэмшиж, өөр нэгжийн validation файлд гар хүрэхгүй.

---

## 7. Автоматжуулалт ба мэдэгдэл — хуваарь

| Механизм | Дүрмүүд | Тайлбар |
|---|---|---|
| **DB trigger (синхрон хориг/үүсгэл)** | Алтан дүрэм (CHECK), статус машинууд, гейт (Д-08, Д-10, Д-12), immutable/closed txn, F-411/459/522/542/707 хатуу шалгалт, Д-25 босго илрүүлэлт, invoice status автомат (F-519/528), эзэмшлийн түүх, kyc синк, hold cascade | Хориглох логик — зөвхөн DB-д итгэнэ |
| **Server action доторх runRule()** | Д-01 (хуваарилалт+даалгавар — `assignLead()` §2.2а), Д-05 (үзлэгийн 24ц), **Д-06 (`recordOffer` дотор: үнийн санал үүсмэгц эргэн холбогдох сануулгын даалгавар + мэдэгдэл)**, Д-07 (урвуу тохируулга эхлүүлэх), Д-09 (post-sale багц), Д-11 (offboarding багц), Д-19, Д-24, Д-30, F-466 (`verifyPayment`/`saveMonthlyRecord` дотор PM тооцоо өдөөх), F-577 (зөрүү → суутгал+засвар) | Хэрэглэгчийн үйлдлийн шууд үр дагавар; `crm_rule_runs` лог + notifications |
| **Cron `crm-sla` (5–10 мин тутам, §4.4)** | Д-02/03/04 (эхний холболтын 15 мин SLA, 24ц дахин оролдлого, 48ц эскалаци — ажлын цагийн хуанлитай), **Д-20 (crm_maintenance_requests.sla_respond_by/sla_resolve_by хэтэрсэн мөр → мэдэгдэл + ҮА-ЧМТ-д шилжүүлэлтийн даалгавар)**, Д-26 (СГТ 24ц тоолуур дөхөхөд эскалацийн мэдэгдэл) | Минутын нарийвчлалтай SLA-ууд өдрийн cron-д багтахгүй тул тусдаа route |
| **Cron routes (D8, §4.4)** | Д-13/14 (+proration), Д-15/16, Д-17/18, Д-21/22/23, Д-27, Д-28/29, F-105/125 integrity, F-205, F-466 (өмнөх сарын бүрэн + орлого баталгаажсан monthly_records-оос PM тооцооны гээгдэл скан — crm-monthly), F-512, F-655 escalation, NPS, идэвхгүйн эргэлт, F-454 гээгдэл скан | Бүх босго/хоног `crm_settings`-ээс уншина; өдрийн давтамж хангалттай дүрмүүд л энд |
| **Мэдэгдэл** | `lib/crm/notify.ts` → `notifyCrm(eventCode, recipients, payload)`: matrix + prefs + mandatory + чимээгүй цаг (дараагийн ажлын цагт нэгтгэх — cron даваа) + dedupe (F-658: `notifications`-д type+link давхардлыг 24ц дотор алгасна) шийдээд `notifications` insert (admin client, link дүрээр /office/crm/... эсвэл /agent/crm/...) | SMS/и-мэйл суваг: matrix-д тэмдэглэгдэнэ гэхдээ илгээлт INT- заглушка — rule_runs-д 'skipped:no_integration' |

Дүрэм бүр `crm_automation_rules` мөртэй (code, is_active, dry_run): runRule()/cron эхэлж мөрийг шалгаад идэвхгүй бол алгасна, dry_run бол зөвхөн лог. Ингэснээр «дүрэм кодгүй унтраах/туршилтын горим» (F-601) хангагдана; шинэ дүрэм = generic 'cron:daily' + condition jsonb interpreter (v1-д date-offset/status нөхцөлийн жижиг DSL).

---

## 8. Самбар / KPI

### 8.1 SQL view-үүд (`20260901000900_crm_reports.sql`, бүгд `with (security_invoker = on)` — RLS дуудагчийн эрхээр)

| View | Агуулга | Эх |
|---|---|---|
| `crm_v_agent_today` | өнөөдрийн даалгавар, хэтэрсэн next step, шинэ сэжим, 24ц санал хүлээж буй үзлэг (agent бүрээр) | leads, tasks+links, activities |
| `crm_v_lead_funnel` | шат бүрийн тоо/хөрвөлт, эх сурвалжийн хамаарал, SLA биелэлт | leads, stage_history, rule_runs |
| `crm_v_pipeline_forecast` | Σ(amount × stage.probability) урсгал/агент/сар; 30/60/90 цонх | opportunities, stages |
| `crm_v_golden_rule_violations` | 5 бүрдэл дутуу идэвхтэй сэжим (F-125 самбарт) | leads (+integrity cron flag) |
| `crm_v_arrears_aging` | нэхэмжлэхийн насжилт 1–3/4–7/8+ бүлэг, шатлалын төлөв (R-09) | invoices, payments, escalations |
| `crm_v_occupancy` | дүүргэлт %, сул хоног, түрээслүүлэх дундаж хоног (R-08) | properties, vacancy_periods, leases |
| `crm_v_monthly_compliance` | сарын бүртгэлийн бөглөлт % (R-07, F-558), тайлангийн хугацаа (F-564) | monthly_records, owner_statements |
| `crm_v_commission_summary` | төлөв бүрийн дүн, hold шалтгаан, олголтын хүлээлт | commission_records |
| `crm_v_kpi_monthly` | R-14 нэгтгэл: хаалт, орлого (verified income), NPS, реферал, давтан %, шилжүүлэлт 100% KPI | олон эх |

### 8.2 Хуудас ↔ виджет

| Хуудас | Виджетүүд (эх view) |
|---|---|
| `/office/crm` (R-06) | KpiTile×4 (kpi_monthly), FunnelChart (lead_funnel), ForecastCard (forecast), GoldenRuleViolations, ArrearsAging товч, OccupancyCard товч |
| `?view=monday` (R-02/03) | агент бүрийн 7 хоногийн амлалт/гүйцэтгэл (forecast + activities count) |
| `?view=friday` (R-04) | долоо хоногийн хаалт, SLA, зөрчил |
| `/agent/crm` (R-01) | AgentDayboard (agent_today), өөрийн funnel/forecast, өөрийн commission summary |
| `/office/crm/rentals` (R-08) | OccupancyCard, дуусах гэрээ 60/30, ArrearsAging |
| `/office/crm/rentals/monthly` (R-07) | monthly_compliance |
| `/office/crm/aml` (R-13) | кейс тоолуур (5 өдөр/24ц дөхөж буй), hold жагсаалт — зөвхөн officer |
| `/office/crm/reports` | R-05 (агентын 100 оноо — kpi_monthly задаргаа), R-10 (тайлагнал-олголт), R-11 (маркетинг — source attribution), R-12 (салбар хоорондын KPI) |

Бүх тоо ЗӨВХӨН view-ээс — гар оруулсан дүн харагдах зам байхгүй (зарчим 9). Болсон/бүртгэсэн огноо: activities.occurred_at ↔ created_at хоёул хадгалагдаж, KPI нь тохиргоогоор аль нь ч дээр тооцогдоно (backdated ялгаатай — F-307).

---

## 9. lib/constants-crm.ts бүтэц

`lib/constants.ts` хэв маягаар — массив `as const` + type + `Record<T, {label, tone}>`; DB enum-тай ЯГ таарна; z.enum/searchParam/select 3 хэрэглээнд нэг эх:

```ts
export const CRM_ROLES = ["agent","team_lead","sales_director","ops_qc","marketing","property_manager","finance","aml_officer","ceo","sysadmin"] as const;
export type CrmRole = (typeof CRM_ROLES)[number];
export const CRM_ROLE_LABEL: Record<CrmRole, string> = { agent: "Агент", team_lead: "Багийн ахлагч",
  sales_director: "Борлуулалтын захирал", ops_qc: "Үйл ажиллагаа/ЧМТ", marketing: "Маркетинг",
  property_manager: "ҮХХ менежмент", finance: "Санхүү", aml_officer: "МУТСТ ажилтан", ceo: "Ерөнхий захирал", sysadmin: "Системийн админ" };

export const LEAD_GRADES = ["a","b","c","d"] as const;                      // + LEAD_GRADE_LABEL {label:"A — Халуун", tone:"rose"} …
export const CRM_LIFECYCLES = [...];       // Шинэ/Идэвхтэй/Эргэлтэд/Идэвхгүй/Архив (neutral/green/amber/neutral/neutral)
export const CONSENT_STATUSES = [...];     // Авсан/Аваагүй/Татгалзсан
export const KYC_STATUSES = [...];         // Хүлээгдэж буй(neutral)/Баталгаажсан(green)/EDD(amber)/Түр зогсоосон(rose)
export const PROPERTY_STATUSES = [...];    // Ноорог/Идэвхтэй/Захиалгатай/Зарагдсан/Түрээслэгдсэн/Татагдсан
export const OCCUPANCY_STATUSES = [...];   // Сул/Түрээслэгдсэн/Бэлтгэл/Гарах мэдэгдэлтэй
export const PROPERTY_ROLES = [...];       // Эх сурвалжийн/Зураг авалтын/Гэрээний агент
export const ACTIVITY_CHANNELS = [...];    // Залгалт/Чат/И-мэйл/Уулзалт/Үзлэг/Даалгавар
export const ACTIVITY_OUTCOMES = [...];    // Нээлттэй/Ахисан/Алдсан/Амжилттай
export const MATCH_RESPONSES = [...];      // Сонирхсон/Магадгүй/Тохироогүй/Хариу өгөөгүй
export const MATCH_STRENGTHS = [...];      // Хүчтэй(green)/Боломжит(blue)/Сул(neutral)
export const TXN_TYPES = [...];            // Худалдах/Энгийн түрээс/Менежменттэй түрээс/Олон улсын/Дахин түрээслүүлэх
export const TXN_STATUSES = [...];         // Ноорог/Гэрээ/Төлбөр/Хаагдсан/Цуцлагдсан
export const GATES = ["g0"..."g6"];        // + GATE_LABEL (G0 Сэжим … G6 Хэлцлийн дараах)
export const LEASE_STATUSES = [...];       // Ноорог/Идэвхтэй/Сунгагдсан/Цуцлагдсан/Дууссан
export const INVOICE_TYPES/STATUSES = [...];// Төлөвлөсөн/Илгээсэн/Хэсэгчлэн/Төлөгдсөн/Хүчингүй
export const PAYMENT_KINDS = [...];        // Орлогын/Хяналтын
export const MAINTENANCE_STATUSES/URGENCIES = [...];
export const COMMISSION_STATUSES = [...];  // Тооцоолсон/Хянасан/Баталгаажсан/Олгосон/Хэсэгчлэн олгосон/Түдгэлзүүлсэн/Цуцалсан
export const COMMISSION_ROLES = [...];     // 10 үүргийн монгол нэр (F-451)
export const CONTACT_KINDS = [...];        // Хувь хүн/Байгууллага (crm_contact_kind)
export const SERVICE_KINDS = [...];        // Худалдах/Энгийн түрээс/Менежменттэй түрээс (crm_service_kind — properties шүүлт/badge)
export const OPP_STATES = [...];           // Нээлттэй/Амжилттай/Алдсан (crm_opp_state)
export const PARTY_ROLES, EXPENSE_BEARERS, INSPECTION_KINDS, DOC_CATEGORIES, CONTACT_TYPES, PROFILE_STATUSES,
  AML_CASE_STATUSES, AML_RISKS, ESCALATION_STEPS = [...];
export const CRM_EVENT_CODES = [...];      // мэдэгдлийн event_code жагсаалт + label
```

Мөн `PL_CODES = ["PL-1"…"PL-6"]` + тайлбар label (тохиргооны seed-тэй таарна — DB дахь pipelines нь эх үнэн, constants нь зөвхөн label/fallback).

---

## 10. Хэрэгжүүлэлтийн нэгжүүд (ToR Шат 1 = U1–U4 гол CRM, Шат 2 = U5–U7 хэлцэл/түрээс/шимтгэл, Шат 3 = U8–U9 автоматжуулалт/тайлан/өнгөлгөө)

Файлын эзэмшил ДАВХЦАХГҮЙ; дундын файлууд (lib/constants-crm.ts, OfficeSidebar.tsx, crm/layout.tsx, CrmNav.tsx, components/crm/utils.ts, vercel.json) — U1-д Л харьяалагдана. `types/database.ts` — U1 суурь + нэгж бүр өөрийн append-only бүсдээ өөрийн хүснэгтүүдийн entry нэмнэ (§2 төгсгөлийн дүрэм). Нэгж бүр өөрийн migration/queries/actions/validation/components/routes/tests файлаа эзэмшинэ. **Санаатай handoff хоёр файлд Л зөвшөөрөгдөнө** (доор ил зарласан): `app/(office)/office/(panel)/crm/page.tsx` ба `app/(agent)/agent/(panel)/crm/page.tsx` — U1/U4 бие даасан (U9-ийн код import ХИЙХГҮЙ) хувилбарыг үүсгэж, U9 бүрэн дахин бичнэ.

| Key | Гарчиг | Үүсгэх/засах файлууд | Хамаарал |
|---|---|---|---|
| `crm-foundation` | Суурь: schema-ийн тулгуур, дүр, тохиргоо, навигаци, автоматжуулалтын суурь | **Эхний алхам: эх ToR-ын §6–§10-ийг уншиж ACC-/SEC-/NF-/INT-/MIG- кодуудыг энэ дизайнтай тулгах баталгаажуулалт — зөрүү илэрвэл §1.2 матриц/RLS policy/view-үүдийг засварлана (§13-1).** `supabase/migrations/20260901000100_crm_foundation.sql` (extensions, automation_rules/rule_runs/notification matrix/prefs, duty_shifts/assignment_state, §1.1 panel_admin хаалтын ALTER POLICY-ууд орно); `types/database.ts` (foundation entry + нэгж бүрийн append-only бүсийн тэмдэглэгээ); `lib/constants-crm.ts`; `lib/crm/normalize.ts`, `lib/crm/calendar.ts`, `lib/crm/gates.ts`, **`lib/crm/rules.ts` (runRule + condition interpreter), `lib/crm/notify.ts`** (U2+ бүгд хэрэглэдэг тул энд — §7); `lib/queries-crm-core.ts`; `lib/actions/crm-settings.ts`, `lib/actions/crm-staff.ts`; `components/office/OfficeSidebar.tsx` (1 мөр); `components/crm/CrmNav.tsx`, **`components/crm/utils.ts`**; `components/ui/tabs.tsx`, `components/ui/select.tsx`, `components/ui/drawer.tsx`; `app/(office)/office/(panel)/crm/layout.tsx`, `crm/page.tsx` (бие даасан «Тун удахгүй» placeholder — projects хуудасны загвар, CrmDashboard import ҮГҮЙ; **U9 бүрэн дахин бичнэ — санаатай handoff**), `crm/settings/**`; `scripts/seed-crm.mjs` (PL-1…6, шат, гейт, Д-дүрэм, матриц, sequences, settings анхны утга); `vercel.json`; `package.json` (zod dep); tests: `lib/crm/__tests__/normalize.test.ts`, `calendar.test.ts`, `gates.test.ts`, `rules.test.ts` | — |
| `crm-contacts-leads` | Харилцагч, сэжим, давхардал/merge, оноо, эзэмшил, хуваарилалт | `supabase/migrations/20260901000200_crm_contacts.sql` (+contact_tags, crm_can_view_contact helper); `lib/crm/scoring.ts`, `lib/crm/assign.ts` (F-126/Д-01); `lib/validation/crm-contacts.ts`, `crm-leads.ts`; `lib/queries-crm-leads.ts`, `lib/queries-crm-contacts.ts`; `lib/actions/crm-leads.ts`, `crm-contacts.ts`, `crm-profiles.ts`; `components/crm/Leads*`, `Contact*`, `NeedProfileForm.tsx`, `OwnerProfileForm.tsx`, `DuplicateHint.tsx`, `NextStepGuard.tsx`; routes: `crm/leads/**`, `crm/contacts/**`; `app/(agent)/agent/(panel)/crm/leads/**`, `agent/crm/contacts/**`; tests: `scoring.test.ts`, `assign.test.ts`, validation tests | crm-foundation |
| `crm-properties-matching` | Объектын сан, бүс, роли, тохируулгын хөдөлгүүр | `…000300_crm_properties.sql`; `lib/crm/matching.ts`; `lib/validation/crm-properties.ts`; `lib/queries-crm-properties.ts`, `queries-crm-matching.ts`; `lib/actions/crm-properties.ts`, `crm-matching.ts`; `components/crm/Propert*`, `Match*`, `ActivationChecklist.tsx`; routes: `crm/properties/**`; `agent/crm/properties/**`; `app/api/cron/crm-matching/route.ts`; tests: `matching.test.ts` | crm-foundation, crm-contacts-leads |
| `crm-pipeline-activities` | Урсгал/боломж/шат guard/гейт UI, үйл ажиллагаа | `…000400_crm_pipeline.sql` (дараалал: profiles/matches → opportunities → stage_history → activities → offers → task_links + stage guard); `lib/validation/crm-pipeline.ts`; `lib/queries-crm-pipeline.ts`; `lib/actions/crm-opportunities.ts`, `crm-activities.ts`; `components/crm/PipelineBoardShell.tsx`, `OpportunityDetailShell.tsx`, `GateChecklist.tsx`, `GateErrorDialog.tsx`, `Activity*`; routes: `crm/pipeline/**`, `crm/deals/**`; `agent/crm/pipeline/**`; `agent/crm/page.tsx` (бие даасан өдрийн хүрээ — өнөөдрийн даалгавар/сэжим U4-ийн ӨӨРИЙН query-ээр, U9-ийн код import ХИЙХГҮЙ; **U9 AgentDayboard-оор бүрэн дахин бичнэ — санаатай handoff**) | crm-properties-matching |
| `crm-transactions-aml` | Хэлцэл, хавтас, зөвшөөрөл, МУТСТ бүс | `…000500_crm_transactions.sql` (+crm_txn_on_hold helper, aml_case_id ALTER); `lib/validation/crm-transactions.ts`, `crm-aml.ts`; `lib/queries-crm-transactions.ts`, `queries-crm-aml.ts` (getAmlCase/getAmlCases — definer RPC-ээр, §3.3-5), `queries-crm-docs.ts`; `lib/actions/crm-transactions.ts`, `crm-aml.ts`, `crm-docs.ts`; `components/crm/Transaction*`, `Aml*`, `CompletenessBar.tsx`, `EntityDocs.tsx`, `AuditTrail.tsx`; routes: `crm/transactions/**`, `crm/aml/**`; storage bucket миграци (crm-docs + policies) | crm-pipeline-activities |
| `crm-rentals` | Түрээсийн бүрэн мөчлөг: lease/invoice/payment/засвар/сарын бүртгэл/тайлан/үзлэг | `…000600_crm_rentals.sql` (+circular FK ALTER-ууд §2); `lib/crm/proration.ts`, `lib/crm/arrears.ts`; `lib/validation/crm-rentals.ts`; `lib/queries-crm-rentals.ts`; `lib/actions/crm-leases.ts`, `crm-invoices.ts` (+createBrokerageInvoice), `crm-maintenance.ts`, `crm-monthly.ts`; `components/crm/Rentals*`, `Lease*`, `Invoice*`, `Maintenance*`, `Monthly*`, `OwnerStatement*`, `Inspection*`; routes: `crm/rentals/**`; `app/api/cron/crm-monthly/route.ts` (Д-13/14 + F-466 PM тооцооны скан); tests: `proration.test.ts`, `arrears.test.ts` | crm-transactions-aml |
| `crm-commissions` | Шимтгэлийн хөдөлгүүр, урсгал, тооцооны хуудас | `…000700_crm_commissions.sql`; `lib/crm/commission.ts`; `lib/validation/crm-commissions.ts`; `lib/queries-crm-commissions.ts`; `lib/actions/crm-commissions.ts`; `components/crm/Commission*`, `EvidencePanel.tsx`; routes: `crm/commissions/**`; `agent/crm/commissions/**`; tests: `commission.test.ts` (5 журмын жишээ тооцоо) | crm-rentals |
| `crm-automation-notify` | Д-дүрмийн бүрэн хэрэгжилт (seed/өргөтгөл), мэдэгдэл, post-sale, offboarding | `…000800_crm_automation.sql` (nps/referrals/complaints/handover_acts/txn_corrections/integrity views + Д-дүрмийн seed; rules/notify суурь U1-д — энд зөвхөн өргөтгөл); `lib/validation/crm-automation.ts`; `lib/actions/crm-post-sale.ts`; `app/api/cron/crm-daily/route.ts`, **`app/api/cron/crm-sla/route.ts` (Д-02/03/04, Д-20, Д-26 — §4.4)**; `components/crm/Nps*`, `Referral*`, `Complaint*`, `HandoverActShell.tsx`; tests: cron/дүрмийн integration тестүүд | crm-commissions |
| `crm-reports-uat` | KPI view, самбарууд, тайлан, UAT/seed демо | `…000900_crm_reports.sql`; `lib/queries-crm-reports.ts`; `components/crm/CrmDashboard/**`, `AgentDayboard.tsx`; `crm/page.tsx` (**U1-ийн placeholder-ыг бүрэн дахин бичнэ — санаатай handoff, §10 преамбул**), `agent/crm/page.tsx` (**U4-ийн бие даасан хүрээг AgentDayboard-оор бүрэн дахин бичнэ — санаатай handoff**), `crm/reports/**`; `scripts/seed-crm-demo.mjs`; `docs/crm/uat-scenarios.md`; e2e: `e2e/crm-*.spec.ts` | crm-automation-notify |

> Дараалал шугаман (хамаарал гинжин) тул зэрэгцээ ажиллуулах бол: (foundation) → (contacts-leads ∥ …дараа нь properties) гэх мэтээр гинжийг мөрдөнө; migration timestamp дараалал зөрчихгүй.

---

## 11. Тестийн төлөвлөгөө

### 11.1 Unit (vitest, цэвэр логик — DB-гүй)

| Файл | Гол кейсүүд |
|---|---|
| `normalize.test.ts` | `99112233`/`9911-2233`/`+976 99112233` → нэг утга; олон улсын дугаар; и-мэйл lowercase |
| `scoring.test.ts` | 100 онооны задаргаа; босго 80/60/40 → A/B/C/D; тохиргооны өөр жинд өөр үр дүн; босго өөрчлөлт хуучин оноог өөрчлөхгүй (шинэ input-д л) |
| `matching.test.ts` | 25/25/20/10/15/5 жин; 90 оноотой ч deal breaker → strong биш, санал болгохгүй; зэргэлдээ бүсийн хэсэгчилсэн %; босго 80/65 |
| `gates.test.ts` | G1 профайл дутуу → missing жагсаалт; G4 kyc≠verified → fail; hold → fail |
| `commission.test.ts` | 5 журмын жишээ: босгын > vs >= оператор; олон үүргийн stacking on/off; co-brokerage туг → selling хаагдана; олон улсын 3 хувилбар давхардуулбал алдаа; нийлбэр cap хэтрэлт → locked; replacement → 0₮; хэсэгчилсэн орлогод пропорц; хугацааны шатлал (12+/6–11/1–5 сар, зааг дээрх өдрүүд) |
| `proration.test.ts` | Сарын дундуур эхлэх/дуусах; 28/29/30/31 хоногтой сар; дундуур цуцлалт |
| `arrears.test.ts` | grace+босго → зөв шат; давтагдсан хоцролт → шат алгасаж дээшилнэ; шат бүрийн хариуцагч дүр |
| `calendar.test.ts` | Ажлын 5 өдөр амралт/баяр алгасна; ажлын бус цагийн SLA эхлэл |
| `rules.test.ts` | condition interpreter; dry_run үйлдэл хийхгүй лог бичнэ |
| `validation` тестүүд | Алтан дүрэм: идэвхтэй + огноогүй → error (дутуу талбарын жагсаалттай); budget_min>max; Closed Lost шалтгаангүй → error |

### 11.2 UAT browser сценариуд (Playwright + гар UAT — `docs/crm/uat-scenarios.md`)

1. **Алтан дүрэм:** идэвхтэй сэжимийг next_step_date-гүй хадгалах → хориглоно, дутуу жагсаалт харагдана.
2. **Давхардал/merge:** ижил утастай 2 сэжим → анхааруулга; ops_qc merge → бүх холбоос шилжсэн, түүх үлдсэн; агент merge хийж чадахгүй.
3. **Гейт:** профайл дутуу боломжийг Qualified руу чирэх → GateErrorDialog; бөглөөд дахин → амжилттай, stage_history бичигдсэн.
4. **МУТСТ:** агент AML таб огт харахгүй; дохио илгээгээд явцыг харахгүй; officer hold тавихад Гэрээ шат + income payment + шимтгэл 3-уул түгжигдэнэ; 20 сая ₮ бэлэн төлбөрт автомат дохио + 5 ажлын өдрийн тоолуур.
5. **Листинг идэвхжүүлэлт:** зураг дутуу → Идэвхтэй болохгүй; идэвхжимэгц урвуу тохируулгын жагсаалт үүссэн.
6. **Түрээсийн мөчлөг:** гэрээ идэвхжүүлэх → дараагийн cron-д нэхэмжлэх+сарын бүртгэл үүснэ; сул объектод үүсэхгүй; exclusion: давхацсан идэвхтэй гэрээ үүсгэхийг оролдох → алдаа.
7. **Хоцролт:** төлөгдөөгүй нэхэмжлэхийн шатлал 1→4 зөв дүр даалгавартай.
8. **Барьцаа:** нотолгоогүй суутгал хадгалагдахгүй; агент баталж чадахгүй (finance/manager л).
9. **Шимтгэл:** txn closed + verified income → Calculated; хавтас <100% үед Reviewed болохгүй; шат алгасалт хориглогдоно; агент зөвхөн өөрийн тооцоо харна.
10. **Тохиргоо:** шимтгэлийн хувь шинэчлэх → хуучин хэлцлийн тооцоо өөрчлөгдөхгүй, шинэд шинэ хувилбар.
11. **Offboarding:** гарах төлөвт орсон агентын багцын жагсаалт; хүлээлцэх дуусаагүй идэвхгүй болгох → хориглоно.
12. **PL-6:** жирийн агентад Recruitment таб/мөр харагдахгүй.
13. **Multi-tenancy:** 2 өөр оффисын хэрэглэгчид бие биеийн CRM өгөгдлийг ямар ч query-ээр харахгүй.

---

## 12. Scope-оос гадуур (INT-, MIG-) — заглушка ба гар зам

| Гадуур зүйл | Шалтгаан | Заглушка / гар зам |
|---|---|---|
| Facebook/Instagram lead intake (INT) | Гадаад OAuth/webhook, ToR-д ч интеграцийн цэг гэж заасан | `createLead`-ийн source='facebook' + campaign_code гараар; ирээдүйд `app/api/webhooks/crm-leads/route.ts` нэг endpoint (schema-нь бэлэн — lead insert хийдэг) |
| SMS түгээлт (INT) | Оператор гэрээ/төлбөр шаардлагатай | notification matrix-д sms суваг тэмдэглэгдэнэ, илгээлт 'skipped' логтой; сануулгыг дотоод даалгавар орлоно (F-654-ийн consent шалгалт хэдийнэ хэрэгжинэ) |
| И-мэйл илгээлт (тайлан, нэхэмжлэх) | Resend байгаа ч загвар/зөвшөөрлийн тохиргоо тусдаа ажил | v1: print хуудаснаас PDF татаад гараар илгээж `markStatementSent()` дарж бүртгэнэ; sent_at гараар |
| Банкны хуулгын импорт (INT, F-529) | Файл формат банк бүрд өөр | `recordPayment` гараар; UI-д «Хуулга импорт — Тун удахгүй» товч |
| НББ, Е-баримт, цалингийн экспорт (INT) | Гадаад системийн API байхгүй | Шимтгэлийн Баталгаажсан жагсаалтын CSV экспорт (аудиттай) = цалинд гараар дамжуулах зам; е-баримт — payment doc хавсралтаар |
| СМА-ийн СГТ маягт экспорт (F-607/611) | Батлагдсан маягтын бүтэц ToR-оос гадуур ирнэ | AML кейсээс бүх талбарын JSON/print export; илгээснийг officer гараар тэмдэглэнэ (огноо+лавлагаа талбар бэлэн) |
| Календарийн 2 чиглэлийн sync (F-305) | Google/Outlook OAuth | Activity/showing нь дотоод calendar view-д; гадаад sync 2.0 |
| Цахим гарын үсэг | ToR өөрөө 2.0 гэж заасан | signed_doc_id-д скан PDF хавсаргана |
| MIG- (хуучин өгөгдлийн миграци) | Эх өгөгдлийн формат тодорхойгүй; ToR-д тусдаа ажил | `scripts/seed-crm.mjs` (тохиргоо) + `seed-crm-demo.mjs` (UAT демо); бодит миграцид CSV → staging шалгалт → insert хийх тусдаа скриптийг эх өгөгдөл ирэхэд бичнэ; бүх entity гараар бүртгэх UI зам бүрэн |
| Мобайл апп | ToR: «бүрэн зохицсон вэб» хангалттай | Бүх CRM хуудас responsive; ActivityComposer/meter reading зэрэг гол маягтууд утасны өргөнд шалгагдана (UAT) |

---

## 13. Нээлттэй асуултууд

1. **ToR §6–§10 бүрэн тулгалт:** ToR §6–§10-ийн (R- самбарын дэлгэрэнгүй, ACC-, SEC-, NF-, INT-, MIG- кодууд) дайджест бүрэн байгаагүй тул §1.2 матриц болон холбогдох хэсгүүд §5-ын урьдчилсан тойм + тархсан заалтаас сэргээгдсэн — **U1-ийн албан ёсны эхний алхам болгож** эх ToR-той тулгах баталгаажуулалт §10-д орсон; зөрүү илэрвэл RLS матриц/view-үүд засварлагдана.
2. **SUPABASE_DB_URL байхгүй** — миграцийг энэ орчноос хэрэглэх боломжгүй; хэрэглэгч db-url өгөх эсвэл dashboard-оор ажиллуулна (архитектурын лавлагааны §12).
3. ~~office_admin олон хүн~~ — **шийдвэрлэгдсэн (§1.1):** `crm_staff.panel_admin` + `crm_is_panel_admin()` хаалт U1-ийн foundation миграцид орж, CRM-ийн удирдах дүрүүд оффис панелийн CRM-ээс гадуурх бичих эрхгүй болно. Хойшлогдоогүй.
4. ~~PL-5 fx гараар~~ — **шийдвэрлэгдсэн (§2.9):** `crm_settings 'fx_rates'` өдрийн ханшийн хүснэгтээс автомат бөглөнө, гар override шалтгаан+audit-тай. Ханшийн API интеграци (Монголбанк) — 2.0 INT- асуулт хэвээр.
5. **Чимээгүй цаг/push:** одоогийн notifications-д push байхгүй (in-app + realtime л) — F-650-ийн push суваг вэб push нэмэх эсэх.
6. **security_invoker view** Supabase-ийн Postgres хувилбар дээр дэмжигдэх нь баталгаатай (PG15+) — деплойн үед шалгах.
7. **Vercel Pro:** минутын давтамжтай cron (crm-matching, crm-sla) Vercel Pro шаарддаг (§4.4) — төлөвлөгөө Pro биш бол гадаад scheduler fallback-ыг U8-д идэвхжүүлнэ.

---

## Шүүмжийн протокол

Эцсийн хяналтын давалтад шүүмжийн 43 асуудлыг (3 давхардсан хос — нийт 40 ялгаатай) дизайнтай нэг бүрчлэн тулгав. **Бүгд үндэслэлтэй гэж үнэлэгдэж дизайнд тусгагдсан; татгалзсан асуудал байхгүй.**

### Critical — шийдэгдсэн (3)

| Асуудал | Тусгасан газар |
|---|---|
| `crm_v_contacts_marketing` definer view RLS алгасаж бүх tenant-ийн өгөгдөл алдагдах | §3.4: view-ийн биед `where office_id = crm_office_id() and has_crm_role('marketing','sysadmin')` заавал + `revoke from anon, public` / `grant to authenticated`; security_invoker view-үүд (§8.1) эрсдэлгүй гэдгийг ялгаж тэмдэглэв |
| Definer RPC-ууд (`crm_setting_at`, `crm_next_number` г.м.) p_office-оор дурын оффис руу хандах | §2.2 «Definer RPC-ийн аюулгүй байдлын ЗААВАЛ дүрэм»: p_office ↔ `crm_office_id()` шалгалт эсвэл параметр халах, grant/revoke бүрдэл, trigger/service-only функцэд authenticated-аас execute хураах, дүрд хамааралтай RPC дотроо has_crm_role шалгах — бүх definer функцэд үйлчлэх нийтлэг дүрэм болгов |
| `crm/page.tsx` U1/U9 хоёр нэгжид давхар эзэмшигдэх («нэг файл = нэг нэгж» зөрчил) | §10 преамбул + U1/U9 мөрүүд: U1 нь CrmDashboard import-гүй бие даасан placeholder үүсгэж, U9 бүрэн дахин бичих нь **ил зарласан санаатай handoff** гэж цорын ганц зөвшөөрөгдсөн хэлбэрээр тодорхойлогдов (agent/crm/page.tsx-ийн хамт) |

### Major — шийдэгдсэн (17, давхардал тооцолгүй 15)

| Асуудал | Тусгасан газар |
|---|---|
| Д-06/Д-20 ямар ч механизмд оноогдоогүй | §7: Д-06 → `recordOffer` доторх runRule (мөн §6.2 crm-opportunities); Д-20 → `crm-sla` cron (§4.4) |
| SLA-ийн минутын нарийвчлал (Д-02/03/04, Д-26) өдрийн cron-д багтахгүй | §4.4 + §7: тусдаа `app/api/cron/crm-sla/route.ts` (5–10 мин), crm-daily-д зөвхөн өдрийн давтамжийн дүрмүүд үлдсэн; U8 файлын жагсаалтад орсон |
| F-118/120/122 шошгоны эх өгөгдөлгүй | §2.5 `crm_contact_tags` junction + шүүлт/багц үйлдэл/marketing segment-ийн хэрэглээний тайлбар; §6.2 addTags/removeTags |
| F-126 хуваарилалтын 4 горимын бүтэцгүй | §2.2а: `lead_assignment` jsonb schema, `crm_duty_shifts`, `crm_assignment_state` (cursor+queue), `lib/crm/assign.ts` цэвэр функц unit тесттэй (U2) |
| CRM удирдах дүрүүд office_admin болж эрх тэлэх (2 удаа дурдагдсан) | §1.1 «Эрхийн тэлэлтийн ХААЛТ»: `crm_staff.panel_admin` + `crm_is_panel_admin()` + CRM-ээс гадуурх бичих policy-уудын ALTER + layout guard — бүгд U1-ийн 000100-д, хойшлуулалгүй; §13-3 хаагдсан |
| 000400 дотор activities↔opportunities дараалал + circular FK-уудын байршил заагдаагүй | §2 миграцийн хүснэгт: 000400 дараалал ил; ALTER бүр тодорхой миграцид (aml_case_id→000500, lease/active_lease/mgmt/fulfilled→000600, complaint_id→000800); §2 төгсгөлийн дарааллын дүрэм |
| pg_trgm үүсгэгдээгүй, btree_gist schema-гүй | §2 хүснэгт 000100: хоёул `with schema extensions`; §2.10 давталтгүйг тэмдэглэв |
| RLS helper-үүд хожмын хүснэгт дурдаж CREATE мөчид унах | §3.1 «Байршил/хэлний дүрэм»: plpgsql + ашиглагдах миграцидаа тодорхойлох (can_view_contact→000200, txn_on_hold→000500), leases guard/өргөтгөлийн зам |
| Хөндлөн-хүснэгт бичдэг trigger-үүд дуудагчийн RLS-д унах | §2.9 ⚠️ блок: definer шаардлагатай trigger-үүдийн ил жагсаалт (Д-25 alert+case, invoice status, paid_amount, синкүүд, түүх/аудит бичилтүүд) + guard-уудад шаардахгүйг ялгав |
| `crm_check_gate` definer биш бол AML гейт чимээгүй тэнцэх | §2.3: «ЗААВАЛ security definer set search_path = public» + оффис шалгалт |
| RETURNING+RLS занга (submitAmlAlert, reassignLead) | §6.2 ⚠️ конвенц: aml_alerts insert-д `.select()` хориотой; owner/visibility өөрчилдөг update-д `{ count: 'exact' }` |
| contact_id/payments зэрэг индексүүд дутуу | §2.5/2.8/2.9/2.10/2.11-д бүх 11 индекс нэмэгдсэн (leads/opp contact_id, leases tenant/landlord, payments×4, activities lead_id, phones/emails contact_id, commission lease/monthly); §3.2 «Гүйцэтгэл»: `(select fn())` initplan боолт |
| types/database.ts-ийг U1 дангаар урьдчилж бичих зөрөх эрсдэл | §2 төгсгөл + §10 преамбул: нэгж бүр өөрийн append-only бүсдээ өөрөө нэмнэ; SUPABASE_DB_URL олдвол `supabase gen types` давуу зам |
| agent/crm/page.tsx U4/U9 далд зөрчил | §10 U4/U9 мөрүүд: U4 бие даасан хүрээ (U9 import-гүй), U9 бүрэн дахин бичих санаатай handoff |
| rules/notify + automation хүснэгтүүд U8-д байж өмнөх нэгжүүд ажиллахгүй | §2 хүснэгт: automation_rules/rule_runs/notification_matrix/prefs DDL → 000100; §10: `lib/crm/rules.ts`, `notify.ts` → U1; U8-д зөвхөн seed/өргөтгөл, crm-daily/crm-sla |
| Marketing definer view (major давхардал) | Critical мөртэй хамт §3.4-т шийдэгдсэн |
| Нэг том lib/validation/crm.ts эзэмшлийн давхцал | §6.3: домэйн-файл конвенцоор нэгж тус бүрийн validation файл (crm-contacts/leads/properties/pipeline/transactions/aml/rentals/commissions/automation); §10 файлын жагсаалтууд шинэчлэгдсэн |

### Minor — шийдэгдсэн (23, давхардал тооцолгүй 22)

| Асуудал | Тусгасан газар |
|---|---|
| F-466 PM тооцоо хуваарьгүй | §7: `verifyPayment`/`saveMonthlyRecord` доторх runRule + crm-monthly гээгдэл скан; §10 U6 |
| F-516(б) зуучлалын хөлсний нэхэмжлэх | §6.2 `createBrokerageInvoice` (rental_fee_tiers-ээс автомат дүн, F-411 хамгаалалт хэвээр, PL-3 runRule) |
| F-419 ₮ дүйцэл гараар | §2.9: `fx_rates` setting, автомат бөглөлт, `fx_rate_source`, гар override шалтгаан+audit; §13-4 хаагдсан |
| F-703 файлын хамгаалалтгүй | §2.12: `doc_upload_policy` setting, MIME/хэмжээ/өргөтгөл тулгалт, Content-Disposition, гүн скан 2.0 |
| F-361 урсгал хооронд шилжүүлэх action байхгүй | §6.2 `transferPipeline(oppId, toPipelineCode, reason)` |
| AML кейсийн үзэлт аудитлагдахгүй | §3.3-5 definer RPC `crm_get_aml_case(s)` + `view_aml_case` audit; §6.1/§10 U5 нийцүүлэв (энэ давалтад §6.1-ийн үлдэгдэл зөрүүг зассан) |
| ToR §6–§10 тулгагдаагүй | §10 U1 эхний алхам: ACC-/SEC-/NF-/INT-/MIG- тулгалт; §13-1 |
| unique(opportunity_id) цуцлалтын дараах хэлцлийг хаах | §2.9 partial unique `where status <> 'cancelled'` |
| crm_protect_immutable number-гүй хүснэгтэд унах (2 удаа дурдагдсан) | §2.4: TG_ARGV + to_jsonb(old/new) харьцуулалт, залгалтын заавар |
| Vercel Hobby-д минутын cron ажиллахгүй | §4.4: Pro урьдач нөхцөл + гадаад scheduler fallback; §13-7 |
| Realtime publication-д AML хүснэгт орох эрсдэл | §2.4 house style гажилт: crm_*-ийг supabase_realtime-д НЭМЭХГҮЙ |
| updated_at хөшиж үлдэх | §2.4: `crm_set_updated_at()` нийтлэг trigger бүх updated_at-тай хүснэгтэд |
| leases exclusion '[]' сунгалтад давхцах + renewLease дараалал | §2.10: '[)' муж + «эхлээд renewed, дараа нь insert» дарааллын заавар |
| Tenant хоорондын FK нийцэлгүй | §2.4: config хүснэгтүүдэд `unique (id, office_id)` + composite FK дүрэм |
| Нэг файл доторх forward reference (zone_directory, activities) | §2 хүснэгт + §2.6/§2.8 дотор дарааллын тайлбар |
| notification_prefs-ийн cross-table CHECK боломжгүй | §2.12: BEFORE INSERT/UPDATE trigger болгож сольсон |
| Cron даалгаврын tasks.created_by NOT NULL унах | §4.4: created_by = responsible_id (fallback office_admin) конвенц |
| Next 16 params Promise дурдагдаагүй | §4.1: [id] хуудсуудын `params: Promise<…>` await + next docs тулгалт |
| components/crm/utils.ts эзэмшилгүй | §5 + §10: U1 үүсгэнэ, бусад нь import л хийнэ |
| CONTACT_KINDS/SERVICE_KINDS/OPP_STATES label дутуу | §9-д 3 бүрдэл нэмэгдсэн |
| Chart library-ийн шинэ хамаарал орох эрсдэл | §5: гар бичмэл SVG/CSS, гадны chart lib ХОРИОТОЙ |

### Татгалзсан

Байхгүй — 43 асуудал бүгд үндэслэлтэй.

### Хэрэгжүүлэлтийн нэгжүүдийн шалгалт

Засваруудын дараах §10 хүснэгт дотооддоо нийцтэй: файлын эзэмшил давхцахгүй (2 санаатай handoff ил зарлагдсан), validation файлууд нэгж тус бүрд хуваарилагдсан, cron route-ууд (crm-matching→U3, crm-monthly→U6, crm-daily/crm-sla→U8) болон rules/notify/automation суурь (U1) зөв нэгжид байна; хамаарлын гинж шугаман хэвээр.





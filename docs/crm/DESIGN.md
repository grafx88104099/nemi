# Nemi CRM — кодын бүтэц

Хуучин CRM-ийн (сэжим, урсгал, хэлцэл, түрээс, долоо хоногийн төлөвлөгөө г.м.) код,
дэлгэц устсан. Өмнөх баримт git-ийн түүхэнд бий. Хуучин `crm_*` хүснэгтүүд DB-д хэвээр
(тусдаа шийдвэрээр устгана).

## Цэс ба замууд

Хоёр панель ижил сегменттэй: `/agent/crm/**` (агент), `/office/crm/**` (оффис).
`/…/crm` нь `/…/crm/staff` руу чиглэнэ.

| Цэс | Сегмент |
|---|---|
| Staff | `/staff` |
| Харилцагчид | `/contacts` |
| Миний ажил | `/my-work` |
| Хүлээлгийн үйлчлүүлэгч | `/waitlist` |
| Санхүү | `/finance` (эрхээр) |
| Тайлан | `/reports` (эрхээр) |
| Тохиргоо | `/settings` (оффист эрхээр; агентад хувийн) |
| Календарь | `/calendar` |
| Миний баг | агент `/team/monitor`, оффис `/teams` |
| Батлах | `/approvals` (батлах эрхтэнд) |

Цэсний эрх `crm2_my_context()`-оос (`components/crm2/shell/*`, `lib/crm2/paths.ts`).
Устсан хуучин замуудын чиглүүлэлт: `lib/crm-redirects.ts` (`next.config.ts`).

## Хадгалагдсан модулиуд

- Ажилтан, дүр, эрх: `crm_staff`, `lib/actions/crm-staff.ts`, `lib/queries-crm-core.ts`,
  `/office/crm/settings/staff`, салбар `/office/crm/settings/branches`.
- Баг, ахлагч батлах, багийн явц: `components/crm/teams/*`, `lib/actions/crm-teams.ts`,
  `lib/queries-crm-teams.ts`, `lib/queries-crm-team-monitor.ts` (Staff-ийн үзүүлэлтээр).
- Календарь: `components/crm/calendar/*`, `lib/crm/calendar-view.ts`,
  `lib/queries-crm-calendar.ts` (үйл явдал, даалгавар, Staff-ийн үзүүлэлт, сайтын үзлэг).
- Мэдэгдэл, web push: `notifications`, `lib/crm/notify.ts`, `lib/crm/push.ts`,
  `components/crm/mobile/{pwa,PushToggle,InstallPrompt}`.
- Ажилтан гарах үеийн хориг: `lib/crm2/offboarding.ts` (DB `crm_offboarding_blockers`).

# Apple App Privacy + Google Data safety — БОДИТ хариултууд

Эх сурвалж (кодоос баталгаажуулсан, 2026-07-18):
- `lib/core/analytics.dart` — `analytics_events` insert: `event`, `props`, `user_id` (нэвтэрсэн бол), `created_at`. Event-үүд: `call_tap`, `viewing_booked`, `favorite_add`, `search_zero_results`, `signup_complete`.
- Бүртгэл: email + нууц үг (Supabase Auth); профайл: `full_name`, `phone`.
- Аппын функц: `favorites`, `viewings`, `recently_viewed` — бүгд user_id-тай холбогдоно.
- Гуравдагч талын SDK: Supabase л сүлжээ рүү ханддаг. Firebase, ads, tracking SDK **байхгүй**. Sentry v1.0-д **суугаагүй** (нэмбэл энэ маягтыг шинэчилнэ — Crash Data нэмэгдэнэ).
- Байршил: аппын permission огт байхгүй (газрын зураг v1.1); "Байршил" товч нь geo URI-г гадаад апп руу нээдэг.
- Устгах: апп доторх Профайл → Бүртгэл устгах (`delete-account` Edge Function, FK cascade) + имэйл хүсэлт info@nemi.mn.

**Гол байр суурь:** Tracking (апп/веб хооронд, ads/data broker зорилгоор) — **БАЙХГҮЙ → ATT prompt хэрэггүй**. Ads — **байхгүй**. Гуравдагч этгээдэд өгөгдөл зарах/дамжуулах — **байхгүй**.

---

## A. Apple — App Privacy (App Store Connect асуулга)

### A1. "Do you or your third-party partners collect data from this app?" → **Yes**

### A2. Цуглуулдаг өгөгдлийн төрөл бүрээр

| ASC ангилал | Дэд төрөл | Цуглуулдаг уу | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|---|
| Contact Info | **Email Address** | Yes | **Yes** | No | App Functionality (бүртгэл/нэвтрэлт) |
| Contact Info | **Name** | Yes (профайлд заавал биш) | **Yes** | No | App Functionality |
| Contact Info | **Phone Number** | Yes (профайлд заавал биш) | **Yes** | No | App Functionality (агент эргэж холбогдох) |
| User Content | Other User Content | **No** | — | — | (апп хэрэглэгч контент нийтэлдэггүй) |
| Browsing History | — | **No** | — | — | (доорх тайлбар) |
| **Usage Data** | Product Interaction | **Yes** | **Yes** (нэвтэрсэн үед; anon үед холбогдохгүй) | No | Analytics (+ App Functionality) |
| Identifiers | User ID | **Yes** | **Yes** | No | App Functionality (Supabase auth UID) |
| Location | — | **No** | — | — | permission огт байхгүй |
| Financial Info | — | **No** | — | — | төлбөр аппад байхгүй |
| Diagnostics | Crash Data | **No** (v1.0 — Sentry суугаагүй) | — | — | Sentry нэмэгдвэл Yes/Not linked болгоно |

Тайлбарууд:
- **Product Interaction (Usage Data)** дор дараахыг хамруулна: analytics events (`call_tap`, `viewing_booked`, `favorite_add`, `search_zero_results` — filter JSON props-той, `signup_complete`).
- **Favorites / viewings / recently viewed** нь хэрэглэгчийн үйлдлээр үүсдэг аппын функцийн өгөгдөл — Apple-ийн таксономид "Product Interaction / Usage Data, App Functionality, Linked to user" гэж мэдүүлэхэд хамгийн зөв буудаг. "Browsing History"-г Apple вебийн browsing history гэж тодорхойлдог тул **No** (сүүлд үзсэн зарууд нь Usage Data-д багтана).
- Linked to user: `analytics_events.user_id` нэвтэрсэн үед бичигддэг тул консерватив байдлаар **Linked** гэж мэдүүлнэ (anon event-үүд user_id=null ч, нэг ангилалд linked байгаа бол linked гэх нь Apple-ийн дүрэм).

### A3. Tracking
- "Do you or your partners use data ... to track users?" → **No** (аппуудын/вебсайтуудын хооронд tracking, data broker, ads байхгүй).
- → **ATT (AppTrackingTransparency) prompt ХЭРЭГГҮЙ**, `NSUserTrackingUsageDescription` нэмэхгүй.

### A4. Privacy Policy URL
`https://nemi.mn/privacy`

---

## B. Google Play — Data safety маягт

### B1. Ерөнхий асуултууд

| Асуулт | Хариулт |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** (collect), **No** (share) |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (Supabase — HTTPS/TLS) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — апп доторх устгал + вебээс хүсэлт |
| Account creation | Апп бүртгэл үүсгэх боломжтой (email); бүртгэлгүйгээр ч гол функц ажиллана |
| Data deletion URL (шинэ шаардлага) | `https://nemi.mn/privacy` (устгах зааврыг агуулна; апп доторх зам: Профайл → Бүртгэл устгах) |

### B2. Data types (цуглуулдаг бүх төрөл)

| Play ангилал | Төрөл | Collected | Shared | Optional? | Ephemeral? | Purpose |
|---|---|---|---|---|---|---|
| Personal info | **Email address** | Yes | No | Yes (зөвхөн бүртгүүлбэл) | No | Account management |
| Personal info | **Name** | Yes | No | Yes | No | Account management |
| Personal info | **Phone number** | Yes | No | Yes | No | Account management, App functionality |
| Personal info | **User IDs** | Yes | No | Yes | No | Account management, App functionality |
| App activity | **App interactions** | Yes | No | **No (Required)** | No | Analytics, App functionality |
| App activity | In-app search history | Yes (zero-result хайлтын filter лог) | No | **No (Required)** | No | Analytics |
| App activity | Other user-generated content | No | — | — | — | — |
| Location | Approximate / Precise | **No** | — | — | — | permission байхгүй |
| Financial info | бүгд | **No** | — | — | — | төлбөр байхгүй |
| Photos and videos | бүгд | **No** | — | — | — | upload байхгүй (v1.2 хүртэл) |
| App info and performance | Crash logs / Diagnostics | **No** (v1.0) | — | — | — | Sentry нэмэгдвэл Yes болгоно |
| Device or other IDs | **No** | — | — | — | — | advertising ID ашигладаггүй |

Бүх "Collected" мөрөнд: **Data is NOT processed ephemerally**. Optional-ийн хувьд хоёр бүлэг:
- **Email / Name / Phone / User IDs → Optional = Yes**: зөвхөн бүртгэл үүсгэсэн үед л оршдог; бүртгэлгүй хэрэглэгч огт өгдөггүй.
- **App interactions / In-app search history → Optional = No (Required)**: `lib/core/analytics.dart` event-үүд (call_tap, search_zero_results г.м.) бүх хэрэглэгчээс — anon-г оруулаад — opt-out-гүй логлогддог. Play-ийн "optional" нь цуглуулалтаас өөрөө татгалзах боломжийг хэлдэг тул anonymity нь linkage-т л нөлөөлнө, optionality-д биш.

### B3. Ads / SDK
- Аппад зар сурталчилгаа **байхгүй** → "Contains ads" = **No**.
- Advertising ID permission (`com.google.android.gms.permission.AD_ID`) **ашиглахгүй** — merged manifest-д гуравдагч SDK-ээс орж ирээгүйг release build дээр шалгах (`aapt dump permissions`).

---

## C. Хоёр store-д нийтлэг мэдэгдэл (нэг мөр хариулт)

| Асуулт | Хариулт | Үндэслэл |
|---|---|---|
| Tracking across apps/websites | **No** | tracking SDK, ads, data broker байхгүй |
| Data sold to third parties | **No** | — |
| Data shared with third parties | **No** | Supabase нь processor (өөрийн backend), гуравдагч хүлээн авагч биш |
| User data deletable? | **Yes** | Профайл → Бүртгэл устгах (шууд, FK cascade) эсвэл info@nemi.mn |
| Юу устдаг вэ | auth бүртгэл, профайл, хадгалсан зар, хадгалсан хайлт, сүүлд үзсэн, мэдэгдлүүд; үзэлт/сэтгэгдлийн түүх де-идентификаци (user_id → null) | `supabase/functions/delete-account/index.ts` FK тэмдэглэл |
| Children / нас | Аппыг хүүхдэд чиглүүлээгүй; Play "Target audience" = **18+** (эсвэл 13+; санал: 18 ба түүнээс дээш — үл хөдлөхийн зар) | — |

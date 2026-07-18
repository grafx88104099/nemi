# Release чеклист — Nemi мобайл v1.0

Дараалал: **0. PRE-FLIGHT → 1. Android → 2. iOS → 3. Нийтлэлтийн дараа**.

---

## 0. PRE-FLIGHT (хоёр платформд нийтлэг — БҮГДИЙГ эхлээд шалга)

- [ ] **Supabase redirect URL:** Dashboard → Authentication → URL Configuration → "Redirect URLs"-д `nemi://auth-callback` байгаа эсэх. Байхгүй бол signup баталгаажуулалт + нууц үг сэргээх линк аппд буцаж ирэхгүй.
- [ ] **delete-account Edge Function deploy хийгдсэн эсэх:**
  ```bash
  supabase functions list          # delete-account харагдах ёстой (ACTIVE)
  # deploy хийх бол:
  supabase functions deploy delete-account
  ```
  Гар тест: buyer биш (шинэ) хэрэглэгчээр аппд нэвтэрч Профайл → Бүртгэл устгах → амжилттай устаж, гарах ёстой. (Тест данс `buyer@nemi.mn`-ийг БҮҮ устга — review-д хэрэглэнэ.)
- [ ] **Тест данс амьд эсэх:** `buyer@nemi.mn` / `Nemi1234!` — prod дээр нэвтэрч үзэх (review_notes.md-д заасан).
- [ ] **env/prod.json** зөв (prod Supabase URL + anon key); build бүрт `--dart-define-from-file=env/prod.json`.
- [ ] **Privacy policy амьд:** https://nemi.mn/privacy нээгдэж буй эсэх (store маягтууд энэ URL-ийг заана).
- [ ] **app_config kill switch тэглэгдсэн эсэх:** launch-ийн үед хэрэглэгчийг санамсаргүй түгжихгүйн тулд:
  ```sql
  select min_supported_version from app_config;  -- null эсвэл '1.0.0' байх ёстой
  ```
- [ ] MN copy эцсийн ревью + offline/error/empty төлөвүүд гараар шалгагдсан.
- [ ] `flutter analyze` 0 алдаа, `flutter test` бүгд ногоон.

---

## 1. Android — signed AAB → Play Console

### 1.1 Keystore үүсгэх (НЭГ Л УДАА — алдвал upload key reset хүсэлт гаргах хэрэгтэй болно)

```bash
keytool -genkey -v -keystore ~/nemi-upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
```
- Нууц үгүүдээ нууц үгийн менежерт хадгал. `~/nemi-upload.jks` файлыг backup-л (жишээ нь шифрлэгдсэн cloud storage).
- Play "App signing"-ийг Google удирдана (default) — энэ бол зөвхөн **upload key**.

### 1.2 key.properties бөглөх

`android/key.properties.example` → `android/key.properties` болгож хуулаад бөглө (git-д ордоггүй, .gitignore-д бий):

```properties
storeFile=/Users/huhenege/nemi-upload.jks
storePassword=<нууц үг>
keyAlias=upload
keyPassword=<нууц үг>
```

Gradle тохиргоо аль хэдийн залгагдсан (`android/app/build.gradle.kts` — key.properties байвал release түлхүүрээр гарын үсэглэнэ).

### 1.3 AAB build

```bash
cd "/Users/huhenege/Projects/Nemi 2/nemi_mobile"
flutter build appbundle --release --dart-define-from-file=env/prod.json
# Гарц: build/app/outputs/bundle/release/app-release.aab
```

Шалгалт: `keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab` — гарын үсэг debug БИШ, upload alias байх ёстой.

### 1.4 Play Console замнал

1. Play Console → Create app → нэр "Nemi — Үл хөдлөх хөрөнгө", App/Free.
2. **Set up your app** цуврал маягтууд:
   - App content → Privacy policy: `https://nemi.mn/privacy`
   - App access: "All functionality is available without special access" БИШ — тест данс шаардлагатай тул "All or some functionality is restricted" сонгоод `buyer@nemi.mn` / `Nemi1234!` + review_notes.md-ийн зааврыг оруулна.
   - Ads: **No**
   - Content rating: IARC асуулга — listing_mn.md §7-ийн хариултууд → Everyone/3+
   - Target audience: 18+ (privacy_forms.md §C)
   - **Data safety: privacy_forms.md §B-ийн хүснэгтийг мөр мөрөөр нь бөглөнө** — Collect=Yes/Share=No, encrypted in transit=Yes, deletion=Yes (+ deletion URL `https://nemi.mn/privacy`); дараа нь data types: Email, Name, Phone, User IDs, App interactions, In-app search history.
   - Store listing: listing_mn.md-ийн нэр/short/full description + screenshots (screenshots_spec.md) + icon 512×512 (assets/brand/icon.png-ээс resize) + feature graphic 1024×500.
3. Release → **Internal testing** → Create release → AAB upload → өөрсдийн имэйлүүдийг tester-т нэмж бодит төхөөрөмж дээр татаж шалгана (нэвтрэх, зүрх, үзэлт товлох, устгах урсгал).
4. Асуудалгүй бол → **Production** track руу promote → release notes (MN): "Nemi аппын анхны хувилбар — зар хайх, шүүх, агенттай холбогдох, үзэлт товлох." → Review-д илгээх (эхний review 1–7 хоног).

---

## 2. iOS — TestFlight → App Review

### 2.1 Xcode signing

1. `open ios/Runner.xcworkspace`
2. Runner target → Signing & Capabilities → **Team**: Apple Developer багаа сонго; Bundle Identifier `mn.nemi.app`; "Automatically manage signing" ✓.
3. **iPhone-only шалгах:** Runner target → General → Supported Destinations-д зөвхөн iPhone байх ёстой (`project.pbxproj`-д гурван config бүгд `TARGETED_DEVICE_FAMILY = 1` — аль хэдийн тохируулсан, Xcode-оор санамсаргүй iPad нэмчихээгүйг баталгаажуул). Ингэснээр iPad 13" screenshot шаардагдахгүй (screenshots_spec.md).
4. App Store Connect (appstoreconnect.apple.com) → Apps → "+" → New App: platform iOS, нэр "Nemi — Үл хөдлөх хөрөнгө", bundle id `mn.nemi.app`, SKU `nemi-app`, хэл Mongolian.

### 2.2 Build + upload

```bash
cd "/Users/huhenege/Projects/Nemi 2/nemi_mobile"
flutter build ipa --release --dart-define-from-file=env/prod.json
# Гарц: build/ios/ipa/nemi_mobile.ipa
```

Upload — аль нэгээр:
- **Transporter** апп (Mac App Store-оос): ipa-г чирж оруулаад Deliver; эсвэл
- `xcrun altool` / Xcode Organizer (Product → Archive → Distribute App).

### 2.3 TestFlight

1. Build processing дуусахыг хүлээнэ (~10–30 мин, имэйл ирнэ).
2. TestFlight → Internal Testing → өөрийн Apple ID-г tester болгож нэмээд бодит iPhone дээр суулгаж бүрэн урсгалыг шалгана (ялангуяа: signup имэйл линк `nemi://auth-callback`-аар аппд буцах, Бүртгэл устгах).
3. Export compliance асуувал: "Standard encryption (HTTPS only)" → exempt. (`ITSAppUsesNonExemptEncryption=false`-г Info.plist-д нэмбэл асуулт дахин гарахгүй.)

### 2.4 App Review submission

1. App Store Connect → App Store таб → 1.0 Prepare for Submission.
2. Metadata: listing_mn.md (нэр, subtitle, description, keywords, category Lifestyle, age 4+), screenshots (screenshots_spec.md), Support URL `https://nemi.mn`.
3. **App Privacy**: privacy_forms.md §A-ийн хүснэгтээр бөглөнө.
4. **App Review Information**: тест данс `buyer@nemi.mn` / `Nemi1234!` + **review_notes.md-ийн текстийг Notes талбарт бүтнээр нь paste** (бүртгэл устгах зам, төлбөргүй гэдэг, MN хэлтэй гэдгийг заасан).
5. Submit for Review (эхний review 1–3 хоног; reject ирвэл review_notes-ийн тайлбараар Resolution Center-т хариулна).

---

## 3. Нийтлэлтийн ДАРАА

- [ ] **App Store URL-ээ кодонд буцааж суулгах:** апп approve болмогц App Store хуудасны `id` дугаарыг аваад `lib/core/app_config.dart` доторх `kAppStoreUrl`-ийг бөглөж дараагийн release-д оруулах. **Энэ хоосон байх үед `min_supported_version` kill switch-ийг ӨРГӨЖ БОЛОХГҮЙ** — iOS хэрэглэгч шинэчлэх товчгүй түгжигдэнэ.
- [ ] Store listing-ийн амьд харагдацыг шалгах (icon, screenshot, тайлбар).

## 4. Байнгын дүрмүүд

### Version bump (release бүрт)

`pubspec.yaml` → `version: A.B.C+N`:
- **N (build number)** — store-д upload хийх БҮРТ +1 (ижил N-тэй build-ийг хоёр store хоёулаа хүлээж авдаггүй). Жишээ: 1.0.0+1 → 1.0.0+2 (metadata-only дахин илгээлт ч шинэ build шаардвал).
- **C (patch)** — bug fix release: 1.0.0 → 1.0.1.
- **B (minor)** — шинэ функц (чат, газрын зураг): 1.0.x → 1.1.0.
- Semver хэсэг (A.B.C) нь `app_config.min_supported_version`-той харьцуулагддаг (`compareSemver`, build number тооцохгүй).

### `app_config.min_supported_version` — kill switch хэрэглэх журам

Зөвхөн **breaking backend өөрчлөлт** (хуучин binary эвдэрсэн) үед:

1. Засвартай шинэ хувилбар (жишээ 1.1.0) **хоёр store-д хоёуланд нь live болсныг** баталгаажуул.
2. Хэрэглэгчдэд шинэчлэх хугацаа өг (доод тал нь 1–2 долоо хоног).
3. Дараа нь:
   ```sql
   update app_config set min_supported_version = '1.1.0';
   ```
4. Үр нөлөө: 1.1.0-с доош хувилбарууд дараагийн нээлтэд blocking "Шинэчлэх шаардлагатай" дэлгэц харна (fail-open — сүлжээгүй үед түгждэггүй).
5. Буцаах: `update app_config set min_supported_version = null;`
6. Урьдчилсан нөхцөл: iOS-ийн `kAppStoreUrl` бөглөгдсөн байх (§3).

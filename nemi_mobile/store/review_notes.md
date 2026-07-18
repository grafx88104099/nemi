# App Review Notes (paste into App Store Connect "Notes" / Play Console "App access" instructions)

Language of the app UI: Mongolian (the app serves the Mongolian real-estate market). The notes below are in English for the review teams.

---

## App overview

Nemi is a real-estate marketplace app for Mongolia (listings from verified agents and agencies: apartments, houses, offices, land — for sale and for rent). It is the mobile client of the existing website https://nemi.mn and shares the same user accounts and backend (Supabase).

- Browsing, searching, filtering listings and calling agents requires **no account**.
- An account (email + password) unlocks: saving favorites, booking property viewings, recently-viewed history, and profile editing.

## Test account (full access)

- Email: `buyer@nemi.mn`
- Password: `Nemi1234!`

Sign-in path: open the app → bottom tab "Профайл" (Profile, rightmost tab) → "Нэвтрэх" (Log in) → enter the credentials above.

Please do not delete this test account via the in-app deletion flow — use it for verification only. If you need to verify deletion, feel free to sign up with a fresh email (email confirmation link returns to the app via the `nemi://auth-callback` deep link).

## Account deletion (in-app, required-compliance path)

Path: bottom tab **"Профайл" (Profile) → "Бүртгэл устгах" (Delete account)** → confirmation dialog → account and personal data are deleted server-side immediately (auth record, profile, favorites, saved data; viewing/review history is de-identified). The user is signed out automatically. Deletion is also available by emailing info@nemi.mn (stated in the privacy policy at https://nemi.mn/privacy).

## Payments

There are **no payments, purchases, subscriptions, or paid digital content anywhere in the app**. Browsing real-estate listings is free. The only "contact" action is a native phone call (tel: link) to the listing agent. Agent-side subscription billing exists only on the website for real-world services and is not accessible or referenced in this app. Therefore no IAP is used.

## Content

- All listing content is real-estate marketplace data published by verified, registered real-estate agents/agencies through the web platform. App users **cannot post content** in this version.
- No user-generated content, no chat, no ads, no third-party tracking SDKs (no ATT prompt needed).
- Location permission is never requested; the "Байршил" (Location) button opens the property's coordinates in the external maps app.

## Anything unusual

- App language is Mongolian only (target market). 
- Deep link scheme `nemi://auth-callback` is used solely for email confirmation and password-reset return.
- If a listing photo occasionally fails to load, it is remote marketplace data, not an app defect; a placeholder is shown.

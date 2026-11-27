# Stoku as a Mobile App (iOS & Android)

The Expo app is **universal**: one codebase builds for iOS, Android and web.
The web version is already live (`https://phone-pos.vercel.app`). This guide
turns it into installable mobile builds with **EAS Build** (Expo Application
Services).

## One-time setup (per machine)

```bash
npm install -g eas-cli     # or use: npx eas-cli ...
eas login                  # free Expo account (expo.dev)
eas init                   # links this repo to an EAS project (writes projectId into app.json)
```

`EXPO_PUBLIC_API_URL` is already set per build profile in `eas.json`
(`https://stoku-api.onrender.com`), so the mobile app talks to the same
production API as the web app. Native apps send no `Origin` header, so the
API's CORS allow-list doesn't apply to them.

## Tier 1 — shareable Android APK (free, no store)

```bash
eas build -p android --profile preview
```

EAS builds in the cloud (~10–20 min) and gives you a **download page + QR
code**. Share that link; on the phone:

1. Open the link → download `Stoku.apk`.
2. Android asks to allow installs from that source (one-time toggle).
3. Install → sign in with the demo accounts.

Honest caveats: Play Protect may show a "unknown app" warning on first install
(normal for sideloaded APKs); you must send people the file yourself.

## Tier 2 — Google Play Store

1. Google Play Console developer account: **$25 one-time**.
2. Build a store-ready bundle: `eas build -p android --profile production`
   (produces an `.aab`; signing keys are managed by EAS).
3. Submit: `eas submit -p android --latest` (or upload in the Console).
4. Store listing needs: app name/description/screenshots, a **privacy policy
   URL**, and the "Data safety" form (this app: no data collection beyond
   email/password auth you host yourself; demo data is fictional).
5. Review takes ~1–7 days; then anyone can install it from the store.

## Tier 3 — iOS (requires $99/yr Apple Developer)

1. Join the Apple Developer Program.
2. `eas build -p ios --profile production` (EAS handles credentials;
   `eas credentials` if anything needs attention).
3. Distribution options:
   - **TestFlight** (recommended): `eas submit -p ios --latest`, then in App
     Store Connect enable a *public TestFlight link* — up to 10,000 testers
     install from a single URL. 90-day builds, fast approval (~24–48 h).
   - **App Store**: full review (days), screenshots, privacy policy.
4. Without the Apple account there is no iOS install path — direct iPhone
   users to the web app and "Add to Home Screen" (it's already mobile-first).

## Keeping the apps updated

- **JS/asset-only changes**: `eas update --branch production` ships instantly,
  no store review (EAS Update).
- **Native changes** (new native module, SDK bump): new `eas build` + store
  submission.
- The API is deployed separately (Render) — server changes need no app update.

## Version bumps

`app.json` `version` is user-facing; `android.versionCode` / iOS build numbers
auto-increment (`autoIncrement` in `eas.json`, `appVersionSource: remote`).

## Mobile-specific notes

- Point `EXPO_PUBLIC_API_URL` at a different backend for staging by adding a
  new build profile — the value is baked in at **build time**.
- The demo database is shared by every user of the app (web + mobile). That is
  intentional for a portfolio demo; all data is fictional.
- Render free tier sleeps ~15 min: the first login after idle can take ~50 s.

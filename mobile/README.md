# Skyline Pulse mobile app

The iOS and Android app for Skyline Pulse, built with [Expo](https://expo.dev) (SDK 58, React Native, Expo Router). It talks to the same Cloudflare Pages API as the website, through the bearer-token routes under `/api/mobile/*` described in [docs/MOBILE-API.md](../docs/MOBILE-API.md).

## What's here (phase 2)

| Area | Status |
|---|---|
| Sign-in | Cloudflare Access OIDC with PKCE in the phone's system browser. Tokens are kept in the device's secure storage (Keychain / Keystore) and refreshed when the server issues a refresh token. |
| Navigation | Tabs: Home, Services, Production, Calendar, More |
| Themes | Light, Dark and Ocean, matching the website. The app follows the phone's setting until you pick one. |
| Data | Home shows counts. Services and Production list the latest 20 entries (read-only). |
| Coming next | Logging and editing (phase 3), Calendar and Planning Center (phase 4), Analytics and Exports (phase 5), push notifications (phase 6) |

| Path | Purpose |
|---|---|
| `app/` | Screens (Expo Router file-based routes) |
| `src/api.ts` | API client, a port of `../assets/data-client.js` |
| `src/session.ts` | Token expiry and refresh rules |
| `src/AuthContext.tsx` | Sign-in, secure token storage, refresh |
| `src/theme.ts` | Theme colours, kept identical to the website by `tests/theme.test.ts` |
| `src/config.ts` | Server and sign-in settings |

## Run it

Use Node.js 22 or newer.

```sh
cd mobile
npm ci
npm test            # unit tests (API client, sessions, themes)
npm run typecheck
```

Sign-in returns to the app through the `skylinepulse://auth` link, and **Expo Go can't receive that link**. Run the app as a development build instead:

| Option | Command | Needs |
|---|---|---|
| iOS simulator on a Mac | `npx expo run:ios` | Xcode |
| Android emulator or phone | `npx expo run:android` | Android Studio |
| Real phones, built in the cloud | `npx eas-cli build --profile development` | An [Expo account](https://expo.dev/signup) (free tier is enough). iPhones also need the Apple Developer account. |

After installing a development build, `npm start` serves the JavaScript to it with live reload.

## Settings

The defaults point at the **staging** preview, so nothing touches production data by accident. Override them with `EXPO_PUBLIC_*` variables. None are secrets.

| Variable | Default |
|---|---|
| `EXPO_PUBLIC_PULSE_API` | `https://claude-inspiring-noether-ejq.skylinechurchpulse.pages.dev` |
| `EXPO_PUBLIC_ACCESS_TEAM_DOMAIN` | `peacockengr.cloudflareaccess.com` |
| `EXPO_PUBLIC_ACCESS_MOBILE_CLIENT_ID` | The staging OIDC application's client ID |

The staging OIDC application's **Redirect URLs** must include `skylinepulse://auth`.

A production build needs its own OIDC application and client ID (see [docs/MOBILE-API.md](../docs/MOBILE-API.md)) plus a `production` profile in `eas.json`. It is left out until that application exists, so a store build can't accidentally point at staging.

## App identity

| | |
|---|---|
| Name | Skyline Pulse |
| iOS bundle ID / Android package | `tech.skylinechurch.pulse` |
| Link scheme | `skylinepulse` |
| Icon | Generated from `../assets/skylinelogosq.jpeg`. Replace `assets/icon.png` with a 1024×1024 original before store submission. |

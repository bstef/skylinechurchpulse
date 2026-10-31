# Mobile app roadmap

This is the plan for the native iOS and Android apps for Skyline Pulse, with what's done and what's left. Update it as each phase lands.

**Approach:** a React Native app built with Expo (one codebase for both platforms) that uses the existing Cloudflare Pages API and D1 database. The website and backend stay the same. See [`mobile/README.md`](../mobile/README.md) for running the app and [MOBILE-API.md](MOBILE-API.md) for how it signs in.

**Last updated:** October 31, 2026

## Overview

| Phase | What | Status | Who | Est. |
|---|---|---|---|---|
| 0 | Accounts and setup | ⏳ To do | Church admin | 1–2 wks |
| 1 | Backend sign-in for the app | ✅ Merged, one check left | Claude, admin for Cloudflare | 2–3 wks |
| 2 | App foundation | ✅ Merged, not yet run on a phone | Claude | 2 wks |
| 3 | Logging and editing | ⏭️ Next | Claude | 4–5 wks |
| 4 | Calendar and Planning Center | ⬜ Not started | Claude | 3 wks |
| 5 | Analytics and exports | ⬜ Not started | Claude | 3–4 wks |
| 6 | Native extras | ⬜ Not started | Claude, admin for assets | 2 wks |
| 7 | Beta testing | ⬜ Not started | Team | 2–3 wks |
| 8 | Store submission | ⬜ Not started | Admin with Claude | 1–2 wks |

Total estimate: about 5–6 months part-time.

## Phase 0: Accounts and setup ⏳

These are tied to the church's legal identity and payment, so they can't be done from code.

- [ ] Get a free **D-U-N-S number** for the church. Apple and Google both need it to register as an organization.
- [ ] Enroll in the **Apple Developer Program** as an organization ($99/yr). Apply for Apple's **nonprofit fee waiver** early.
- [ ] Create a **Google Play Console** organization account ($25 one-time). Organization accounts skip Google's 12-tester closed-test rule for personal accounts.
- [ ] Create an **Expo account** (free tier) for EAS cloud builds. No Mac is needed for iOS builds.
- [ ] Register the app ID `tech.skylinechurch.pulse` in App Store Connect and Play Console.

## Phase 1: Backend sign-in for the app ✅

Native apps can't use the Cloudflare Access cookie the website relies on. The app instead signs in through a separate Access for SaaS (OIDC) application and sends a bearer token to `/api/mobile/*`.

| Done | Where |
|---|---|
| Mobile routes `/api/mobile/*` that reuse the website's handlers, with bearer-token checks (signature, issuer, audience, expiry) that fail closed | [#41](https://github.com/bstef/skylinechurchpulse/pull/41) |
| Setup steps written for the current Cloudflare dashboard | [#42](https://github.com/bstef/skylinechurchpulse/pull/42) |
| Staging OIDC application created, PKCE on, no client secret | Cloudflare dashboard |
| Access **Bypass** for `api/mobile/*` on previews only | Cloudflare dashboard |
| `ACCESS_MOBILE_CLIENT_ID` set for previews only; production stays closed | [#42](https://github.com/bstef/skylinechurchpulse/pull/42) |
| Confirmed: issuer, key endpoint, RS256, PKCE, public client | Discovery document |
| Confirmed: `/api/mobile/status` returns `401` without a token, and `/api/status` still shows the Access login | Private-window check |
| `npm run test:mobile-signin` script for a real sign-in check from your computer | [#42](https://github.com/bstef/skylinechurchpulse/pull/42) |

**Left to do**
- [ ] Run `npm run test:mobile-signin` and get **PASS** (`401` without a token, `200` with one).
- [ ] Remove `http://localhost:8790/callback` from the staging application's Redirect URLs once that passes.
- [ ] Production setup, done before store submission (phase 8): a separate production OIDC application, an `api/mobile/*` bypass on `skylinechurch.tech`, and the production `ACCESS_MOBILE_CLIENT_ID`.

## Phase 2: App foundation ✅

| Done | Where |
|---|---|
| Expo SDK 58 project in `mobile/` (React Native 0.88, Expo Router, TypeScript) | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| Sign-in in the system browser with PKCE; tokens in Keychain/Keystore; refresh before expiry; any `401` signs out | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| API client ported from the website's `data-client.js` | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| Tabs: Home (counts), Services and Production (latest 20, read-only), Calendar (placeholder), More (theme, account, sign out) | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| Light, Dark and Ocean themes; a test keeps them identical to the website | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| Review fixes: an in-flight token refresh can't undo a sign-out; a truncated reply shows an error instead of loading forever | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| 10 unit tests; the iOS and Android bundles compile | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |

**Left to do**
- [ ] Make sure `skylinepulse://auth` is in the staging OIDC application's Redirect URLs. If Cloudflare rejects custom schemes, switch to an `https://skylinechurch.tech/...` app link.
- [ ] Run the app as a development build (`npx expo run:ios`, `run:android`, or `eas build --profile development`; Expo Go can't receive the sign-in link) and check:
  - [ ] Sign in, and the tabs appear
  - [ ] Home counts match the staging site
  - [ ] The chosen theme survives a restart
  - [ ] Sign out returns to the sign-in screen

## Phase 3: Logging and editing ⏭️

- [ ] Sunday Services form: date, service type, attendance (with the Planning Center prefill), unity, engagement, sound, flow, host feedback, notes
- [ ] Production form: role coverage and names, slides grade, missed cues, feedback
- [ ] SkyYouth view and form
- [ ] Edit and delete existing entries, using the same validation messages as the website (duplicates, out-of-range values)
- [ ] Save drafts on the device so a lost connection doesn't lose a half-filled form
- [ ] Planning Center plan picker for prefill (`/api/mobile/pco-plans`)

## Phase 4: Calendar and Planning Center ⬜

- [ ] Calendar day and month views of logged services and plans
- [ ] "Needs details" reminders, matching the website's date and time logic
- [ ] Planning Center Responses: confirmed, declined and no answer per upcoming plan (`/api/mobile/pco-stats`)
- [ ] Church Stats view

## Phase 5: Analytics and exports ⬜

- [ ] Attendance, experience and production trend charts for all three areas
- [ ] CSV and PDF exports through the native share sheet
- [ ] Email a report (`/api/mobile/send-report-email`; production only, as on the website)
- [ ] Manage report recipients

## Phase 6: Native extras ⬜

- [ ] Push notifications, sent from `cron-worker`, for example "Monday digest is ready" and "Sunday still needs details"
- [ ] Final app icon from a 1024×1024 original (the current icon is upscaled from a 447px logo), plus the splash screen
- [ ] Status bar colours and other polish per theme
- [ ] Over-the-air updates for JavaScript fixes

## Phase 7: Beta testing ⬜

- [ ] TestFlight build for iPhones
- [ ] Play internal or closed testing track for Android
- [ ] Two to three weeks of use by the team on real Sundays; fix what comes up

## Phase 8: Store submission ⬜

- [ ] Production Cloudflare setup (see phase 1) and a `production` profile in `mobile/eas.json`
- [ ] Privacy policy page, for example under `docs/` on `skylinechurch.tech`
- [ ] App Store privacy labels and the Google Play data safety form
- [ ] Screenshots for both stores
- [ ] Apple reviewer access: a reviewer email in an Access policy, pointed at **staging** data
- [ ] Distribution: Apple **Unlisted** or Business Manager custom app; Google private or closed track

## Costs

| Item | Cost |
|---|---|
| Apple Developer Program | $99/yr, or $0 with the nonprofit waiver |
| Google Play Console | $25 one-time |
| Expo (EAS builds, push) | Free tier is usually enough |
| Cloudflare (Pages, D1, Access) | No change |
| Claude plan for development | Pro $20/mo, or Max $100–$200/mo during the heavy build phases |

## Decisions

| Decision | Why |
|---|---|
| Expo (React Native) instead of separate Swift and Kotlin apps | One JavaScript codebase for both stores, close to the website's code; EAS builds iOS without a Mac |
| Separate `/api/mobile/*` routes with bearer tokens | The Access cookie and same-origin check can't work from a native app; the browser routes stay exactly as they are |
| Separate OIDC applications for staging and production | A staging token can never work in production; a test enforces that the IDs differ |
| No production build profile until the production OIDC application exists | Prevents a store build from pointing at staging by mistake |

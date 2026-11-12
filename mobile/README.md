# Skyline Pulse mobile app

The iPhone, iPad and Android app for Skyline Pulse, built with [Expo](https://expo.dev) (SDK 58, React Native 0.88, Expo Router, TypeScript). It reads and writes the same data as the website, through the bearer-token routes under `/api/mobile/*` described in [docs/MOBILE-API.md](../docs/MOBILE-API.md). Plans and remaining work are in the [mobile roadmap](../docs/MOBILE-ROADMAP.md).

[What it does](#what-it-does) · [iPad](#ipad) · [Run it](#run-it-on-a-mac) · [Face ID in the simulator](#test-face-id-in-the-simulator) · [Troubleshooting](#troubleshooting) · [Code layout](#code-layout) · [Settings](#settings) · [History](#how-we-got-here)

## What it does

| Area | What people can do |
|---|---|
| **Sign in** | Sign in once with the same email as the website: iOS asks to use `cloudflareaccess.com`, you enter your email, then the code Cloudflare emails you. The sign-in is kept in the phone's secure storage (Keychain / Keystore). |
| **Face ID / Touch ID** | After the first sign-in, Face ID opens the app. It asks again after 5 minutes away and falls back to the phone passcode. Turn it off in **More → Security** (which itself needs Face ID). |
| **Staying signed in** | The app quietly renews the sign-in. People sign out only when Cloudflare rejects the renewal (after 30 days, or if they're removed from the access policy). Losing signal shows "Unable to connect" and keeps them signed in. This needs refresh tokens turned on in Cloudflare, see [MOBILE-API.md Part 5](../docs/MOBILE-API.md). |
| **Home** | Like the website's home page: welcome banner, how many Planning Center plans still need details, count tiles (including serving responses), average scores, an attendance trend for the last 8 services, a card for each section, and Recently Logged. Each card and entry opens its screen. |
| **Services** | This fortnight's Planning Center plans marked *Upcoming*, *Needs details*, *Logged* or *+ Log another*. Tapping a plan opens the form with the date, service and Check-Ins attendance filled in. You can also log a service by hand, edit or delete any entry, and load older plans back to 120 days. |
| **SkyYouth** | The same, for SkyYouth's own Planning Center plans and entries. "Log a service" preselects SkyYouth. |
| **Production** | Log role attendance and who covered each role, slides grade, missed cues and camera direction. Edit or delete past logs. |
| **More** | Light, Dark and Ocean themes (matching the website), the Face ID setting, who you're signed in as, and Sign out. |
| **Forms** | Same fields, defaults and error messages as the website. Unsaved forms are kept as drafts on the phone and come back after a lost connection or a closed app. Earlier names are offered for "Logged by", host and role names, and delete always asks first. |

**Not in the app yet:** Calendar, Planning Center responses, Church Stats, Analytics and Exports. Use the website for these until phases 4–5. The Calendar tab is hidden until it has real content.

## iPad

**The same app runs on iPad.** There's no separate iPad app: one build and one App Store listing cover iPhone and iPad (`supportsTablet` is on in `app.json`).

**It doesn't have an iPad layout yet.** On an iPad you see the phone layout stretched wide:

| Today on iPad | Planned iPad polish |
|---|---|
| Locked to portrait | Rotates, for iPads on a stand in landscape |
| Cards and forms stretch edge to edge | Content width capped so forms stay readable |
| Bottom tab bar | Sidebar on the left, like Mail and Files |
| Forms cover the whole screen | Two columns: list on the left, form or entry on the right |

This is about 1–2 weeks of work, planned alongside the iPhone UI polish (see the roadmap).

## Run it on a Mac

You need Node.js 22 or newer, Xcode with an iOS simulator, and CocoaPods (`brew install cocoapods`).

> **Keep the project out of iCloud Drive.** If the repository is inside `~/Library/Mobile Documents/com~apple~CloudDocs/`, iCloud keeps syncing the hundreds of packages in `node_modules`. The dev server sees every sync as a code change and the app shows "Refreshing…" every second. Clone it somewhere like `~/Developer/skylinechurchpulse` instead.

**Always run app commands from inside `mobile/`.** Running Expo from the repository root sets up the *website* folder as an app instead (see [Troubleshooting](#troubleshooting)).

### First time, or after adding a native package

```sh
cd mobile
npm ci
npx expo run:ios --device "iPhone 18 Pro"
```

This builds the app (the first build takes several minutes), installs it on the simulator and starts the dev server. Use any simulator name from `xcrun simctl list devices available`, for example an iPad.

### Day to day

Once the app is installed, you only need the dev server:

```sh
cd mobile
npx expo start --localhost
```

Then press `i` to open the iOS simulator. Code changes appear in the app as you save. Use `--localhost` on a Mac with a VPN such as Tailscale; without it Expo may pick the VPN address, which iOS blocks (see [Troubleshooting](#troubleshooting)).

**Rebuild with `npx expo run:ios`** whenever a package with native code is added or `app.json` changes (for example adding Face ID). The dev server alone can't add native code.

### Checks

```sh
npm test            # 29 unit tests: API client, sessions, Face ID lock rules, themes, logging rules, drafts
npm run typecheck   # app and tests
```

From the repository root, `npm run test:mobile-signin` signs in against the real staging Cloudflare app in your browser. It checks that the API accepts the token and that refresh tokens renew it.

### Other ways to run it

| Option | Command | Needs |
|---|---|---|
| Android emulator or phone | `npx expo run:android` | Android Studio |
| Real phones, built in the cloud | `npx eas-cli build --profile development` | An [Expo account](https://expo.dev/signup) (free tier is enough). iPhones also need the Apple Developer account. |

**Expo Go doesn't work.** Sign-in returns to the app through the `skylinepulse://auth` link, which only a development build can receive.

## Test Face ID in the simulator

A simulator can't see your face, so you tell it what the "camera" saw:

1. In the simulator menu bar choose **Features → Face ID → Enrolled** (only needed once per simulator).
2. Sign in, then swipe the app away (⇧⌘H twice, swipe up) and reopen it.
3. When the white Face ID box appears, choose **Features → Face ID → Matching Face** (⌥⌘M) to unlock, or **Non-matching Face** (⌥⌘N) to see a failed attempt.

| Test | Expected |
|---|---|
| Reopen after swiping the app away | Lock screen and Face ID prompt |
| Come back after 5+ minutes away | Locks again |
| Come back within 5 minutes | No prompt |
| Cancel the prompt | Stays locked, with **Unlock with Face ID** and **Sign out** |
| More → Security → Off | Asks for Face ID first |

On a real iPhone, iOS asks once: "Allow Skyline Pulse to use Face ID?". It shows the reason set in `app.json`.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| Red screen: *Cannot resolve entry file: The `main` field… package.json* | Expo was run from the repository root, so it set up the website folder as an app. It also adds React Native to the website's `package.json` and creates `ios/`, `app.json` and `tsconfig.json` there. | Undo those root changes (`git checkout -- package.json package-lock.json` and remove the new root `ios/`, `.expo/`, `app.json`, `tsconfig.json`), then run from `mobile/`. Delete the blank "skylinechurchpulse" app from the simulator. |
| App stuck on the Skyline logo splash screen | Expo gave the app your VPN address (for example `100.x.x.x`), and iOS blocks plain-HTTP connections to it | Start the dev server with `npx expo start --localhost` |
| Blue "Refreshing…" banner every second | The project is in iCloud Drive and iCloud keeps touching `node_modules` | Move the project out of iCloud Drive |
| Red screen: *Cannot find native module 'ExpoLocalAuthentication'* (or another module) | The installed app was built before that native package was added | Rebuild with `npx expo run:ios` for that simulator |
| Asked for an email code again after about an hour | Cloudflare isn't issuing refresh tokens yet | Set the refresh token lifetime ([MOBILE-API.md Part 5](../docs/MOBILE-API.md)) |
| Developer menu sheet on first launch | Normal for development builds | Close it; open it later with ⌃⌘Z |

## Code layout

| Path | Purpose |
|---|---|
| `app/(tabs)/` | The five tabs: `index` (Home), `services`, `skyyouth`, `production`, `more`. `calendar` is hidden until phase 4. |
| `app/service-form.tsx`, `app/production-form.tsx` | Log and edit forms, shown as pop-up sheets |
| `app/sign-in.tsx`, `src/LockScreen.tsx` | Sign-in and Face ID lock screens |
| `src/api.ts` | API client, a port of `../assets/data-client.js` |
| `src/AuthContext.tsx`, `src/session.ts` | Sign-in, secure token storage, renewal rules |
| `src/LockContext.tsx`, `src/lock.ts` | Face ID / Touch ID lock and when it applies |
| `src/DataContext.tsx` | Shared cache of entries and plans, reloaded after every save and cleared on sign-out |
| `src/home.ts` | Home page counts, averages, attendance trend and section cards, ported from the website |
| `src/logging.ts` | Form defaults, validation, payloads and Planning Center matching, ported from the website |
| `src/drafts.ts`, `src/useDraftForm.ts` | Unsaved form drafts on the device |
| `src/lists.tsx`, `src/form.tsx`, `src/ui.tsx` | Shared list cards, form controls and building blocks |
| `src/theme.ts`, `src/ThemeContext.tsx` | Theme colours, kept identical to the website by `tests/theme.test.ts` |
| `src/config.ts` | Server and sign-in settings |
| `tests/` | Unit tests. Several read the website's `index.html` or run payloads through the server's own validation, so the app can't drift from the website. |

`ios/` and `android/` are generated by `expo run:*` / EAS and aren't committed.

## Settings

The defaults point at the **staging** preview, so nothing touches production data by accident. Override them with `EXPO_PUBLIC_*` variables. None are secrets.

| Variable | Default |
|---|---|
| `EXPO_PUBLIC_PULSE_API` | `https://claude-inspiring-noether-ejq.skylinechurchpulse.pages.dev` |
| `EXPO_PUBLIC_ACCESS_TEAM_DOMAIN` | `peacockengr.cloudflareaccess.com` |
| `EXPO_PUBLIC_ACCESS_MOBILE_CLIENT_ID` | The staging OIDC application's client ID |

The staging OIDC application's **Redirect URLs** must include `skylinepulse://auth`.

A production build needs its own OIDC application and client ID (see [docs/MOBILE-API.md](../docs/MOBILE-API.md)) plus a `production` profile in `eas.json`. That profile is left out until the production application exists, so a store build can't accidentally point at staging.

## App identity

| | |
|---|---|
| Name | Skyline Pulse |
| iOS bundle ID / Android package | `tech.skylinechurch.pulse` |
| Devices | iPhone and iPad (`supportsTablet`), Android phones |
| Link scheme | `skylinepulse` |
| Face ID message | "Skyline Pulse uses Face ID to keep church data private on this phone." |
| Icon | Generated from `../assets/skylinelogosq.jpeg`. Replace `assets/icon.png` with a 1024×1024 original before store submission. |

## How we got here

| Step | What happened | PR |
|---|---|---|
| Backend sign-in | Mobile routes under `/api/mobile/*` that accept a bearer token from a separate Cloudflare Access OIDC app, set up on staging only | [#41](https://github.com/bstef/skylinechurchpulse/pull/41), [#42](https://github.com/bstef/skylinechurchpulse/pull/42) |
| App foundation | Expo project, sign-in with PKCE, tabs, themes, read-only lists | [#43](https://github.com/bstef/skylinechurchpulse/pull/43) |
| Roadmap | Phases 0–8 written up in `docs/MOBILE-ROADMAP.md` | [#44](https://github.com/bstef/skylinechurchpulse/pull/44) |
| Logging and editing | Service and Production forms, Planning Center plans, SkyYouth, drafts | [#45](https://github.com/bstef/skylinechurchpulse/pull/45) |
| First run on a simulator | Confirmed the real Cloudflare sign-in and live data work. Found the root-folder, VPN-address and iCloud problems listed under Troubleshooting. | |
| Sign-in and tab fixes | Face ID unlock, staying signed in, clearer sign-in screen, SkyYouth as a tab, subtle tab animation | [#46](https://github.com/bstef/skylinechurchpulse/pull/46) |

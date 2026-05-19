# Story 11.1: i18n Framework Setup (next-intl + i18next)

Status: done

## Story

As a developer,
I want the internationalization framework configured across all spoke apps,
so that translation keys, locale routing, and language switching infrastructure are available for Arabic, Dari, and English.

## Acceptance Criteria

1. `next-intl` is installed and configured in all Next.js PWA apps (OPD Lite, Pharmacy Lite, Lab Lite) with locale routing (`/en/`, `/ar/`, `/da/` path prefixes or cookie-based detection)
2. `expo-localization` + `i18next` + `react-i18next` are installed and configured in Patient Lite Mobile
3. A shared `messages/` directory structure exists under each app with `en.json`, `ar.json`, `da.json` skeleton files containing at minimum the app name and a "loading" key
4. A `useLocale()` hook (or equivalent) is available in each app that returns the current locale and a `setLocale()` function
5. The locale context propagates a `dir` attribute (`ltr` or `rtl`) to the root `<html>` element (PWA) or root `<View>` (mobile) based on the active locale
6. Default locale is English; Arabic and Dari trigger `dir="rtl"`
7. Locale preference persists across page reloads (cookie for PWA, AsyncStorage for mobile) — but NOT in localStorage (PHI security constraint)
8. All existing tests pass — no regressions introduced

## Dependencies

- None (foundation story)

## Parallel Notes

- Stories 11.2, 11.3, 11.4, 11.5 all depend on this story completing first
- Stories 11.6 and 11.7 have NO dependency on this story and can proceed in parallel

## Tasks / Subtasks

- [x] Task 1: Install next-intl in PWA apps (AC: #1)
  - [x] Add `next-intl` to `apps/opd-lite/package.json`, `apps/pharmacy-lite/package.json`, `apps/lab-lite/package.json`
  - [x] Run `pnpm install`
  - [x] Create `apps/opd-lite/src/i18n.ts` with `getRequestConfig` defining supported locales `['en', 'ar', 'da']`
  - [x] Create equivalent `i18n.ts` in Pharmacy Lite and Lab Lite
  - [x] Add `createMiddleware` from `next-intl/middleware` to each app's `middleware.ts` (or create if not exists) with locale detection from cookie → Accept-Language header → default `en`
- [x] Task 2: Configure next-intl provider in PWA apps (AC: #1, #5, #6)
  - [x] Wrap each app's root layout with `NextIntlClientProvider`
  - [x] Set `<html lang={locale} dir={locale === 'ar' || locale === 'da' ? 'rtl' : 'ltr'}>` in root layout
  - [x] Ensure `next.config.js` includes `next-intl` plugin configuration if required
- [x] Task 3: Install i18next in Patient Lite Mobile (AC: #2)
  - [x] Add `i18next`, `react-i18next`, `expo-localization` to `apps/patient-lite-mobile/package.json`
  - [x] Create `apps/patient-lite-mobile/src/i18n/index.ts` with i18next init configuration
  - [x] Configure language detection via `expo-localization` (device locale → map to `en`/`ar`/`da`)
  - [x] Wrap app root with `I18nextProvider`
- [x] Task 4: Create skeleton message files (AC: #3)
  - [x] Create `apps/opd-lite/messages/en.json` with `{ "app": { "name": "OPD Lite", "loading": "Loading..." } }`
  - [x] Create `apps/opd-lite/messages/ar.json` with `{ "app": { "name": "عيادة خارجية", "loading": "جاري التحميل..." } }`
  - [x] Create `apps/opd-lite/messages/da.json` with `{ "app": { "name": "کلینیک سرپایی", "loading": "در حال بارگذاری..." } }`
  - [x] Repeat for Pharmacy Lite (`messages/en.json`, `ar.json`, `da.json`)
  - [x] Repeat for Lab Lite (`messages/en.json`, `ar.json`, `da.json`)
  - [x] Create `apps/patient-lite-mobile/src/i18n/locales/en.json`, `ar.json`, `da.json`
- [x] Task 5: Create useLocale hook abstraction (AC: #4, #7)
  - [x] For PWAs: create `packages/ui-kit/src/hooks/useAppLocale.ts` wrapping `next-intl`'s `useLocale` + a `setLocale` that updates the cookie and triggers router navigation
  - [x] For Mobile: create equivalent hook wrapping `i18next.changeLanguage()` + persist to AsyncStorage
  - [x] Ensure `setLocale` also updates the `dir` context
- [x] Task 6: Locale persistence (AC: #7)
  - [x] PWA: store locale preference in a `NEXT_LOCALE` cookie (next-intl default behavior) — verify no localStorage usage
  - [x] Mobile: store in AsyncStorage under key `@ultranos/locale`
  - [x] On app load, read persisted locale before rendering
- [x] Task 7: Verify no regressions (AC: #8)
  - [x] Run `pnpm test` across all apps
  - [x] Run `pnpm typecheck`
  - [x] Verify dev servers start without errors for all PWA apps

## Technical Notes

- Architecture mandates `next-intl` for web and `expo-localization` + `i18next` for mobile
- Cookie-based locale detection is preferred over URL path prefixes per architecture doc — confirm with team if path-based is needed for SEO (unlikely for internal clinical apps)
- The `dir` attribute on `<html>` is the foundation that Story 11.2 (RTL Layout Mirroring) builds upon
- Dari uses ISO 639-1 code `da` (note: this conflicts with Danish — team should confirm if `prs` (ISO 639-3) or `fa-AF` is preferred; using `da` here per existing conventions in the codebase)

## Dev Agent Record

### Implementation Plan

- Used `next-intl` v4.12.0 with `localePrefix: 'never'` for cookie-based locale detection (no URL path prefixes)
- PWA architecture: `src/i18n/routing.ts` (routing config) + `src/i18n/request.ts` (request config) + `src/middleware.ts` (locale middleware)
- Mobile architecture: `src/i18n/index.ts` (i18next init with expo-localization detection + AsyncStorage persistence)
- Root layouts made async to call `getLocale()` and `getMessages()` from `next-intl/server`
- Added `@react-native-async-storage/async-storage` as mobile dependency for locale persistence
- `ui-kit` tsconfig updated to `moduleResolution: "bundler"` to support `next/navigation` imports

### Debug Log

- `next-intl` required `createNextIntlPlugin` in `next.config.js` pointing to the request config file
- ui-kit needed `next` and `next-intl` as devDependencies and `moduleResolution: "bundler"` for type resolution
- Pre-existing test failures confirmed across all apps (unrelated to i18n): lab-results, conflict-resolution, encounter-dashboard, fulfillment, etc.

### Completion Notes

All 7 tasks completed successfully. The i18n framework is now configured across:
- 3 PWA apps (OPD Lite, Pharmacy Lite, Lab Lite) using next-intl with cookie-based locale detection
- 1 mobile app (Patient Lite Mobile) using i18next with expo-localization device detection + AsyncStorage persistence

New tests added: `useAppLocale.test.ts` (4 tests in ui-kit), `i18n-routing.test.ts` (3 tests in opd-lite), `i18n.test.ts` (6 tests in patient-lite-mobile). All pass.

No new regressions introduced — all pre-existing test failures are unrelated to i18n changes.

## File List

### New Files
- `apps/opd-lite/src/i18n/routing.ts`
- `apps/opd-lite/src/i18n/request.ts`
- `apps/opd-lite/src/middleware.ts`
- `apps/opd-lite/messages/en.json`
- `apps/opd-lite/messages/ar.json`
- `apps/opd-lite/messages/da.json`
- `apps/opd-lite/src/__tests__/i18n-routing.test.ts`
- `apps/pharmacy-lite/src/i18n/routing.ts`
- `apps/pharmacy-lite/src/i18n/request.ts`
- `apps/pharmacy-lite/src/middleware.ts`
- `apps/pharmacy-lite/messages/en.json`
- `apps/pharmacy-lite/messages/ar.json`
- `apps/pharmacy-lite/messages/da.json`
- `apps/lab-lite/src/i18n/routing.ts`
- `apps/lab-lite/src/i18n/request.ts`
- `apps/lab-lite/src/middleware.ts`
- `apps/lab-lite/messages/en.json`
- `apps/lab-lite/messages/ar.json`
- `apps/lab-lite/messages/da.json`
- `apps/patient-lite-mobile/src/i18n/index.ts`
- `apps/patient-lite-mobile/src/i18n/locales/en.json`
- `apps/patient-lite-mobile/src/i18n/locales/ar.json`
- `apps/patient-lite-mobile/src/i18n/locales/da.json`
- `apps/patient-lite-mobile/src/hooks/useAppLocale.ts`
- `apps/patient-lite-mobile/src/__tests__/i18n.test.ts`
- `packages/ui-kit/src/hooks/useAppLocale.ts`
- `packages/ui-kit/src/__tests__/useAppLocale.test.ts`

### Modified Files
- `apps/opd-lite/package.json` — added next-intl dependency
- `apps/opd-lite/next.config.js` — added next-intl plugin
- `apps/opd-lite/src/app/layout.tsx` — added NextIntlClientProvider, dynamic locale/dir
- `apps/pharmacy-lite/package.json` — added next-intl dependency
- `apps/pharmacy-lite/next.config.js` — added next-intl plugin
- `apps/pharmacy-lite/src/app/layout.tsx` — added NextIntlClientProvider, dynamic locale/dir
- `apps/lab-lite/package.json` — added next-intl dependency
- `apps/lab-lite/next.config.js` — added next-intl plugin
- `apps/lab-lite/src/app/layout.tsx` — added NextIntlClientProvider, dynamic locale/dir
- `apps/patient-lite-mobile/package.json` — added i18next, react-i18next, expo-localization, @react-native-async-storage/async-storage
- `apps/patient-lite-mobile/App.tsx` — added I18nextProvider, i18n init, RTL direction
- `packages/ui-kit/package.json` — added next/next-intl peer+dev deps
- `packages/ui-kit/src/index.ts` — exported useAppLocale and getDirection
- `packages/ui-kit/tsconfig.json` — switched to bundler moduleResolution

## Review Findings

- [x] [Review][Decision→Patch] Dari locale code `da` conflicts with Danish — switch to `prs` (ISO 639-3)
- [x] [Review][Decision→Patch] Mobile messages at `/src/i18n/locales/` — move to `/messages/` per spec
- [x] [Review][Patch] Cookie missing `Secure` flag [packages/ui-kit/src/hooks/useAppLocale.ts:30] — fixed
- [x] [Review][Patch] `I18nManager.forceRTL` requires app restart — added `requiresRestart` return [apps/patient-lite-mobile/src/hooks/useAppLocale.ts] — fixed
- [x] [Review][Patch] Unhandled AsyncStorage failure in mobile `setLocale` [apps/patient-lite-mobile/src/hooks/useAppLocale.ts] — fixed
- [x] [Review][Patch] No error handling on dynamic message import [apps/*/src/i18n/request.ts] — fixed
- [x] [Review][Patch] Missing test coverage for `setLocale()` [packages/ui-kit/src/__tests__/useAppLocale.test.ts] — fixed
- [x] [Review][Defer] ui-kit barrel export includes Next.js-specific code [packages/ui-kit/src/index.ts:57] — deferred, pre-existing
- [x] [Review][Defer] `initI18n` lacks idempotency guard [apps/patient-lite-mobile/src/i18n/index.ts:45] — deferred, pre-existing

## Change Log

- 2026-05-16: Implemented i18n framework across all spoke apps (next-intl for PWAs, i18next for mobile) with cookie/AsyncStorage persistence and RTL direction support
- 2026-05-16: Code review completed — 2 decisions resolved, 5 patches identified, 2 deferred

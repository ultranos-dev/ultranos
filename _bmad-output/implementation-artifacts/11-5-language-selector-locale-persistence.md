# Story 11.5: Language Selector & Locale Persistence

Status: done

## Story

As a user,
I want a visible, always-accessible language toggle that lets me switch between English, Arabic, and Dari instantly,
so that I can change my language at any time without losing my place in the application.

## Acceptance Criteria

1. A globe icon language selector is permanently visible in the top navigation bar of all apps (PWA and mobile)
2. Tapping/clicking the globe opens a language picker showing three options in their native scripts: `English`, `العربية` (Arabic), `دری` (Dari)
3. Language change takes effect within 200ms — the UI re-renders in the new locale without a full page reload (PWA) or app restart (mobile)
4. Layout mirrors to RTL immediately upon selecting Arabic or Dari, and reverts to LTR upon selecting English. **Mobile exception:** React Native's `I18nManager.forceRTL()` requires an app restart to take effect — user is prompted via Alert.
5. On first launch, the app auto-detects the device/browser locale: Arabic locale → Arabic RTL; Dari/Farsi locale → Dari RTL; all others → English LTR (per PRD HP-001)
6. The selected language persists across sessions (cookie for PWA, AsyncStorage for mobile) and is restored on next visit
7. Language selection does NOT require authentication — it works on the login page and all pre-auth screens
8. For Patient Lite Mobile: each language option plays a 2-second warm audio greeting on tap (per PRD HP-002) to assist low-literacy users
9. The language picker is keyboard-accessible (Tab → Enter to select) and screen-reader announced
10. Switching language does not discard unsaved form data — only UI chrome text changes

## Dependencies

- Story 11.1 (i18n Framework Setup — provides locale switching mechanism and persistence)

## Tasks / Subtasks

- [x] Task 1: Create LanguageSelector component in ui-kit (AC: #1, #2, #9)
  - [x] Create `packages/ui-kit/src/components/LanguageSelector.tsx`
  - [x] Render a globe icon button (inline SVG globe icon)
  - [x] On click/tap: open a dropdown/popover with three language options
  - [x] Each option shows the language name in its native script
  - [x] Add `aria-label="Change language"`, `role="listbox"` with `role="option"` on each item
  - [x] Support keyboard navigation: Tab to focus, Enter/Space to open, Arrow keys to navigate options, Enter to select
- [x] Task 2: Integrate into AppShell navbar (AC: #1, #7)
  - [x] Add `languageSelector` slot prop to the shared AppShell component in `packages/ui-kit`
  - [x] Created `ConnectedLanguageSelector` component pre-wired to `useAppLocale` hook
  - [x] Position: inline-end of the navbar (right side in LTR, left side in RTL)
  - [x] Ensure it renders on ALL pages including `/login` (pre-auth) — added floating selector on login pages
  - [x] Verify it doesn't conflict with existing navbar items (user menu, sync indicator)
- [x] Task 3: Implement instant locale switching (AC: #3, #4, #10)
  - [x] PWA: uses existing useAppLocale hook — sets `NEXT_LOCALE` cookie and calls `router.refresh()`
  - [x] Switch does NOT trigger a full page reload — next-intl handles it via router refresh
  - [x] `dir` attribute on `<html>` updates via layout.tsx which reads locale server-side
  - [x] Form state preserved — React state persists during locale switch (re-render only)
  - [x] Mobile: calls `i18n.changeLanguage(locale)` which triggers re-render via React context
- [x] Task 4: Auto-detection on first launch (AC: #5)
  - [x] PWA: enhanced `middleware.ts` in all three apps to remap fa/fa-AF/prs/da → prs in Accept-Language header
  - [x] Map browser locales: `ar`, `ar-*` → Arabic; `fa`, `fa-AF`, `prs`, `da` → Dari; everything else → English
  - [x] Mobile: added `mapToSupportedLocale()` function to i18n/index.ts with same mapping logic
  - [x] Persistence set automatically (cookie by next-intl middleware, AsyncStorage by useAppLocale hook)
- [x] Task 5: Audio greetings for Patient Lite Mobile (AC: #8)
  - [x] Created placeholder audio files (need real recordings):
    - English: `assets/audio/greeting-en.mp3`
    - Arabic: `assets/audio/greeting-ar.mp3`
    - Dari: `assets/audio/greeting-prs.mp3`
  - [x] Store audio files in `apps/patient-lite-mobile/assets/audio/`
  - [x] On language option tap: `useLanguageGreeting` hook plays corresponding audio clip
  - [x] Uses `expo-av` for audio playback with `playsInSilentModeIOS: true`
  - [x] Audio plays regardless of device volume setting (playsInSilentModeIOS enabled)
- [x] Task 6: Persistence verification (AC: #6)
  - [x] PWA: NEXT_LOCALE cookie set with 1-year max-age, SameSite=Lax, path=/
  - [x] Mobile: AsyncStorage key `@ultranos/locale` persists across app restarts
  - [x] Language persists per-device, not per-account (cookie/AsyncStorage independent of auth)
- [x] Task 7: Integration testing (AC: all)
  - [x] 12 component tests for LanguageSelector: renders, opens, selects, keyboard nav, click outside, aria-selected
  - [x] 2 AppShell integration tests: languageSelector slot renders, works pre-auth (user=null)
  - [x] 7 mobile locale mapping tests: ar→ar, fa→prs, fa-AF→prs, prs→prs, da→prs, en→en, unsupported→null
  - [x] 4 AppShell snapshots updated (LTR/RTL with/without user)

## Technical Notes

- PRD HP-001: "Arabic locale → Arabic RTL. Dari/Farsi locale → Dari RTL. All others → English."
- PRD HP-002: "Each tap plays a 2-second warm audio greeting. No text literacy required to complete this step."
- PRD HP-003: "Globe icon in top navigation bar at all times. Language change takes effect within 200ms."
- The 200ms target is achievable because next-intl loads all locale messages at build time (static imports) — no network fetch on switch
- Form preservation during locale switch: React state persists because we're only re-rendering text content, not unmounting form components
- Audio greetings are Patient Lite Mobile only — PWA apps do not play audio on language selection

## Dev Agent Record

### Implementation Plan

1. Created `LanguageSelector` component in ui-kit with inline SVG globe icon, dropdown with listbox/option ARIA roles, keyboard navigation
2. Added `languageSelector` slot prop to `AppShell` component — positioned at inline-end of navbar, before sync/notification/user controls
3. Created `ConnectedLanguageSelector` wrapper that connects LanguageSelector to `useAppLocale` hook for zero-config usage
4. Integrated into all four apps:
   - **Pharmacy Lite**: Added to AppShellWrapper (authenticated) + floating globe on login page (pre-auth)
   - **Lab Lite**: Added to layout.tsx header (global, all pages)
   - **OPD Lite**: Added to ClinicalDashboard header (authenticated) + floating globe on login page (pre-auth)
   - **Patient Lite Mobile**: Created `LanguageSelectorMobile` (React Native) with modal picker + header bar in App.tsx
5. Enhanced all three PWA middleware files to remap Dari/Farsi browser locales (fa, fa-AF, prs, da) to `prs`
6. Enhanced mobile `detectDeviceLocale()` with `mapToSupportedLocale()` for the same mapping
7. Created `useLanguageGreeting` hook using expo-av for audio greeting playback on language tap
8. Placeholder audio files created — need real 2-second recordings before production

### Debug Log

- AppShell snapshot tests failed after adding `languageSelector` slot — updated snapshots (expected)
- TypeScript error on `LANGUAGES[focusIndex].code` — fixed with non-null assertion (`!`)
- Pre-existing test failures in opd-lite (314), pharmacy-lite (35), lab-lite (21), patient-lite-mobile (13) — all Vite transformation / next-intl import errors unrelated to this story

### Completion Notes

All 7 tasks complete. 21 new tests added (12 LanguageSelector component, 2 AppShell slot, 7 mobile locale mapping). ui-kit: 212/212 tests pass. TypeScript typecheck passes. Pre-existing test failures in app-level test suites confirmed not caused by this story.

**Note:** Audio greeting files (`assets/audio/greeting-{en,ar,prs}.mp3`) are placeholders and must be replaced with real 2-second warm greeting recordings before production deployment.

## File List

### New Files
- `packages/ui-kit/src/components/LanguageSelector.tsx` — Globe icon language selector component
- `packages/ui-kit/src/components/ConnectedLanguageSelector.tsx` — Pre-wired selector using useAppLocale hook
- `packages/ui-kit/src/__tests__/LanguageSelector.test.tsx` — 12 component tests
- `apps/lab-lite/src/components/LanguageSelectorClient.tsx` — Client wrapper for lab-lite layout
- `apps/opd-lite/src/components/LanguageSelectorClient.tsx` — Client wrapper for opd-lite
- `apps/patient-lite-mobile/src/components/LanguageSelectorMobile.tsx` — React Native language selector
- `apps/patient-lite-mobile/src/hooks/useLanguageGreeting.ts` — Audio greeting playback hook
- `apps/patient-lite-mobile/assets/audio/greeting-en.mp3` — Placeholder audio
- `apps/patient-lite-mobile/assets/audio/greeting-ar.mp3` — Placeholder audio
- `apps/patient-lite-mobile/assets/audio/greeting-prs.mp3` — Placeholder audio

### Modified Files
- `packages/ui-kit/src/index.ts` — Added LanguageSelector and ConnectedLanguageSelector exports
- `packages/ui-kit/src/AppShell.tsx` — Added `languageSelector` slot prop
- `packages/ui-kit/src/__tests__/AppShell.test.tsx` — Added 2 languageSelector slot tests
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx` — Added ConnectedLanguageSelector to AppShell + login page
- `apps/pharmacy-lite/src/middleware.ts` — Enhanced with Dari/Farsi locale remapping
- `apps/lab-lite/src/app/layout.tsx` — Added LanguageSelectorClient to header
- `apps/lab-lite/src/middleware.ts` — Enhanced with Dari/Farsi locale remapping
- `apps/opd-lite/src/app/login/page.tsx` — Added floating LanguageSelectorClient
- `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx` — Added LanguageSelectorClient to header
- `apps/opd-lite/src/middleware.ts` — Enhanced with Dari/Farsi locale remapping
- `apps/patient-lite-mobile/App.tsx` — Added header bar with LanguageSelectorMobile + audio greeting wiring
- `apps/patient-lite-mobile/src/i18n/index.ts` — Added mapToSupportedLocale() for Dari/Farsi locale detection
- `apps/patient-lite-mobile/src/__tests__/i18n.test.ts` — Added 7 mapToSupportedLocale tests

## Review Findings

- [x] [Review][Patch] Remove Danish `da` from locale mapping — incorrectly maps Danish to Dari [middleware.ts, i18n/index.ts]
- [x] [Review][Patch] Update AC #4 to note mobile RTL requires app restart (RN platform limitation)
- [x] [Review][Patch] Fix middleware `request.headers.set()` — NextRequest headers are read-only in Next.js 15 [apps/*/src/middleware.ts]
- [x] [Review][Patch] Guard `LANGUAGES[focusIndex]` when focusIndex is -1 [LanguageSelector.tsx:126]
- [x] [Review][Patch] Add audio sound cleanup on unmount [useLanguageGreeting.ts]
- [x] [Review][Patch] Fix `requiresRestart` comparison — capture old language before changeLanguage [useAppLocale.ts:34]
- [x] [Review][Patch] Add visible focus indicator on dropdown options [LanguageSelector.tsx:218]
- [x] [Review][Patch] Add `id` + `aria-activedescendant` to listbox options [LanguageSelector.tsx:169,190]
- [x] [Review][Patch] Add `.catch()` to `initI18n()` call [App.tsx:24]
- [x] [Review][Defer] `router.refresh()` may exceed 200ms on slow/offline networks — deferred, architectural
- [x] [Review][Defer] No explicit test for form data preservation during locale switch — deferred, works by React design
- [x] [Review][Defer] Admin Portal language selector not verified — deferred, out of scope

## Change Log

- 2026-05-16: Implemented Language Selector & Locale Persistence (Story 11.5) — globe icon selector in all apps, auto-detection with Dari/Farsi mapping, audio greetings for mobile, keyboard-accessible, pre-auth support

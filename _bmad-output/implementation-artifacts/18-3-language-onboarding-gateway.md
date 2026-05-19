# Story 18.3: Language Onboarding Gateway

Status: done

## Story

As a patient,
I want to choose my language on first use through a visual full-screen gateway,
so that I can use the app in my preferred language without needing to read text.

## Acceptance Criteria

1. On first login (after OTP authentication), a full-screen Language Onboarding Gateway is presented before the Home dashboard
2. The gateway displays 3 language options as large tappable buttons (minimum 80px tall, 24px+ font) in native scripts: `English`, `العربية`, `دری`
3. Each button tap plays a 2-second warm audio greeting in the corresponding language before confirming selection
4. No text literacy is required — the selection is icon-first and audio-assisted with visual script differentiation
5. After language selection, a 3-step onboarding flow plays: (1) "This is your Health Passport" illustration, (2) "Show this to your doctor" illustration, (3) completion
6. Each onboarding step uses full-screen illustration (60% of screen), 1-line translated text (20px+), and an icon-based "Next" arrow button
7. A "Skip" link is available for returning users who've reinstalled
8. The onboarding-complete flag is stored in AsyncStorage — subsequent logins skip directly to Home
9. The selected language is persisted and applied immediately (layout mirrors to RTL if Arabic or Dari)
10. The gateway only appears on first login — never on subsequent sessions

## Dependencies

- Story 18.2 (OTP Authentication — provides the first-login detection and routing)
- Epic 11 Story 11.5 (Language Selector — provides `useAppLocale` hook and audio greeting infrastructure)

## Existing Code Context

- `apps/patient-lite-mobile/src/components/OnboardingFlow.tsx` — 3-step onboarding already exists with illustration screens + AsyncStorage persistence
- `apps/patient-lite-mobile/src/components/VisualLanguageGateway.tsx` — language picker component already exists with native script buttons
- `apps/patient-lite-mobile/src/hooks/useAppLocale.ts` — locale switching hook exists
- Audio greeting files exist as placeholders in `assets/audio/greeting-{en,ar,prs}.mp3`
- The existing onboarding checks `@ultranos/onboarding-complete` in AsyncStorage

## Tasks / Subtasks

- [x] Task 1: Wire gateway into auth flow (AC: #1, #10)
  - [x] In `AuthNavigator.tsx` (from Story 18.2): after first login, check `@ultranos/onboarding-complete` in AsyncStorage
  - [x] If not complete: show `OnboardingScreen` before `TabNavigator`
  - [x] If complete: skip directly to `TabNavigator`
  - [x] Create `src/screens/OnboardingScreen.tsx` that composes `VisualLanguageGateway` + `OnboardingFlow`
- [x] Task 2: Enhance VisualLanguageGateway (AC: #2, #3, #4)
  - [x] Verify existing `VisualLanguageGateway.tsx` meets specs: 80px button height, 24px+ font, native scripts
  - [x] Verify audio greeting plays on button tap via `useLanguageGreeting` hook (from Story 11.5)
  - [x] Ensure buttons are large enough for low-literacy users — full width with generous padding
  - [x] Add subtle visual differentiation between scripts (e.g., Latin vs Arabic script shapes) — no flags needed
- [x] Task 3: Enhance OnboardingFlow (AC: #5, #6, #7)
  - [x] Verify existing `OnboardingFlow.tsx` has 3 steps with illustrations
  - [x] Ensure illustration takes 60% of screen, text is 20px+ and translated
  - [x] Step 1: Language selection (VisualLanguageGateway)
  - [x] Step 2: "This is your Health Passport" — QR code illustration
  - [x] Step 3: "Show this to your doctor" — patient showing phone illustration
  - [x] "Skip" link at top-right (or top-start for RTL) in muted color
  - [x] "Next" button uses arrow icon (directional — mirrors in RTL)
- [x] Task 4: Persist completion state (AC: #8, #9)
  - [x] On completion: set `@ultranos/onboarding-complete = 'true'` in AsyncStorage
  - [x] Language selection persisted via `useAppLocale` hook (existing from Story 11.5)
  - [x] Verify that language change triggers immediate RTL/LTR layout switch
- [x] Task 5: Testing (AC: all)
  - [x] Test: first login shows onboarding gateway
  - [x] Test: subsequent logins skip onboarding
  - [x] Test: language selection persists and applies
  - [x] Test: skip button sets completion flag
  - [x] Test: all 3 steps render with correct content
  - [x] Test: RTL layout applied when Arabic/Dari selected

## Dev Agent Record

### Implementation Plan
- Leveraged existing `VisualLanguageGateway`, `OnboardingFlow`, `useAppLocale`, and `useLanguageGreeting` from Epic 11
- Added `onboarding` phase to `AuthNavigator` between biometric enrollment and app entry
- Created thin `OnboardingScreen` composing existing components
- Enhanced `VisualLanguageGateway` with script hint characters for visual differentiation
- Enhanced `OnboardingFlow` with RTL-aware arrow mirroring and top-positioned skip link

### Completion Notes
- All 5 tasks completed and verified with 20 new tests (all passing)
- Existing test suites (onboarding-flow, visual-language-gateway) pass with zero regressions
- RTL snapshots updated to reflect VisualLanguageGateway script hint additions
- Pre-existing failures (6 suites) unrelated to this story confirmed unchanged

## File List

- `apps/patient-lite-mobile/src/screens/OnboardingScreen.tsx` — NEW: Thin screen composing OnboardingFlow
- `apps/patient-lite-mobile/src/navigation/AuthNavigator.tsx` — MODIFIED: Added 'onboarding' phase, isOnboardingComplete check, OnboardingScreen routing
- `apps/patient-lite-mobile/src/components/VisualLanguageGateway.tsx` — MODIFIED: Added scriptHint for visual script differentiation, row layout
- `apps/patient-lite-mobile/src/components/OnboardingFlow.tsx` — MODIFIED: RTL arrow mirroring, skip link repositioned to top-end
- `apps/patient-lite-mobile/src/__tests__/onboarding-gateway.test.tsx` — NEW: 20 integration tests covering all ACs
- `apps/patient-lite-mobile/src/__tests__/__snapshots__/rtl-snapshots.test.tsx.snap` — MODIFIED: Updated snapshots for VisualLanguageGateway changes
- `_bmad-output/implementation-artifacts/18-3-language-onboarding-gateway.md` — MODIFIED: Status, tasks, dev record
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: Story status updated

### Review Findings

- [x] [Review][Decision] D1: Audio greeting now awaits completion before advancing (AC #3) — resolved: option A
- [x] [Review][Decision] D2: Skip removed from step 0, only available on illustration steps (AC #7/AC #9) — resolved: option A
- [x] [Review][Decision] D3: Emoji placeholders accepted as known gap for design team (AC #6) — resolved: option B, dismissed
- [x] [Review][Patch] P1: `handleLanguageSelect` wrapped in try/catch [OnboardingFlow.tsx]
- [x] [Review][Patch] P2: `markOnboardingComplete` now awaited in handleNext/handleSkip [OnboardingFlow.tsx]
- [x] [Review][Patch] P3: `handleNext` uses functional updater for `setStep` [OnboardingFlow.tsx]
- [x] [Review][Patch] P4: Double-tap protection via `isProcessing` state + `disabled` prop [OnboardingFlow.tsx, VisualLanguageGateway.tsx]
- [x] [Review][Patch] P5: `isMountedRef` guard on async state updates [AuthNavigator.tsx]
- [x] [Review][Patch] P6: `BackHandler` integration for Android back button [OnboardingFlow.tsx]
- [x] [Review][Patch] P7: Arrow direction derived from `selectedLocale` instead of stale `I18nManager.isRTL` [OnboardingFlow.tsx]
- [x] [Review][Defer] W1: Auth phase / store state desync on session expiry [AuthNavigator.tsx] — deferred, pre-existing from Story 18.2
- [x] [Review][Defer] W2: Deep link timing gap — brief TabNavigator flash before onboarding redirect [AuthNavigator.tsx] — deferred, pre-existing architectural
- [x] [Review][Defer] W3: `biometricEnrolled` stale in `handleLoginSuccess` closure [AuthNavigator.tsx:76-86] — deferred, pre-existing from Story 18.2
- [x] [Review][Defer] W4: `authPhase` initializer can't synchronously check async onboarding state [AuthNavigator.tsx:64-68] — deferred, RN platform limitation
- [x] [Review][Defer] W5: `NotoSansArabic-Bold` font loading not verified in component [VisualLanguageGateway.tsx:18-19] — deferred, Epic 11 infrastructure

## Change Log

- 2026-05-18: Implemented Story 18.3 Language Onboarding Gateway — wired onboarding into auth flow, enhanced VisualLanguageGateway with script hints, added RTL arrow mirroring, 20 tests added
- 2026-05-18: Code review — 9 patches applied (audio gate, skip removal from step 0, try/catch, await persistence, functional updater, double-tap protection, unmount guard, BackHandler, locale-based arrow direction), 5 deferred, 8 dismissed

## Technical Notes

- Most of this story is integration/wiring of existing components (VisualLanguageGateway, OnboardingFlow) that were built in Epic 11
- The main new work is creating the `OnboardingScreen` and wiring it into the auth navigator flow
- PRD HP-002: "Visual Language Gateway: Full-screen language selection with large tappable buttons in native scripts. No text literacy required."
- The onboarding illustrations should be simple SVG or Lottie animations — no text in the illustrations themselves
- Audio greetings use placeholder files currently — real recordings needed before production launch

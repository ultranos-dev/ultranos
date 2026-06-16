# Pharmopedia O1 — Onboarding Entry + Ultranos Member Login (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Part of:** the Onboarding & Identity program (O1 → O2 → O3 → E4). Builds on the committed E1/E2/E3 UI work.

---

## 1. Background

Pharmopedia currently sends every unauthenticated user to a single `login.tsx` with a clinical/password vs patient/OTP segmented toggle, plus a separate `register.tsx` (patient OTP). The product now distinguishes two fundamentally different audiences at the door:

- **Ultranos members** — existing users of an Ultranos staff app (OPD Lite, Pharmacy Lite, Lab Lite, Admin). They already have accounts; they only sign in.
- **Public members** — everyone else (may also use Patient Mobile). They self-register through a guided wizard (built in O2).

O1 builds the **entry chooser** and reframes the existing clinical login as **Ultranos member sign-in**. The full public signup wizard is O2; until then the public path reuses the existing patient-OTP `register.tsx`.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Entry | A new **two-path chooser** screen (`onboarding.tsx`); Welcome's "Get Started" routes to it |
| Member sign-in | **Reuse existing email/password + forgot-password**; remove the clinical/patient toggle and the patient-OTP path from `login.tsx`. **TOTP/MFA deferred** (not built in O1) |
| Public path (interim) | Routes to the **existing `register.tsx`** (patient OTP) until O2 replaces it |
| UX | Premium, Clinical-Calm; the chooser is the brand moment |
| **Visual reference** | **OPD Lite / Lab Lite login screens** (`apps/{opd-lite,lab-lite}/src/app/[locale]/(auth)/login/page.tsx`) — the ShadCN "login-02" two-column layout. On mobile the brand panel is hidden (`lg:`-only), so Pharmopedia mirrors the **left form panel**, translated from web/ShadCN/Tailwind into RN Clinical-Calm. |

## 2a. Reference design — the OPD/Lab Lite auth shell

Both staff apps share one login design; Pharmopedia adopts its **mobile rendering** (the left panel). Translated to RN, the shared **auth shell** is:

- **Top header row:** a branded **icon-chip** (32px, `Radius.lg`, `primary500` background, white medical icon — `Pill` for Pharmopedia) + the **"Pharmopedia" wordmark** (heading font, ~`sm` semibold) on the logical start; **`LanguageChips`** on the logical end.
- **Centered content:** a `flex-1` centered column constrained to a comfortable max width (~360px), generous vertical rhythm.
- **Title block:** title in the **heading font, `2xl`, bold**; subtitle `sm`, `textMuted`, just below.
- **Banners:** rounded (`Radius.lg`), tinted — status = `info`/primary tint, error = `danger` tint (reuse the ui-kit `Banner` or a matching styled view), shown above the form/content.
- **Labeled fields:** a small `Label` (`sm`) above a bordered, rounded `TextInput` (matches ShadCN `Label`+`Input`); these are styled inline for O1 (a shared `TextField` native primitive can be extracted later).
- **Primary action:** a **full-width** `Button` (ui-kit `Button`, `variant="primary"`).
- **Footer:** centered, `xs`, `textMuted` — **"Ultranos Healthcare Platform"**.
- Fully theme-aware + RTL-aware (logical alignment, Arabic font), ≥44px targets.

Both the **onboarding chooser** (§3.1) and **member sign-in** (§3.3) are built on this shell so Pharmopedia feels like a first-class member of the Ultranos app family.

## 3. Scope

### 3.1 Onboarding chooser — `app/(auth)/onboarding.tsx` (new)
Built on the **auth shell (§2a)**: the branded icon-chip + wordmark + `LanguageChips` header, a centered title/subtitle ("Welcome to Pharmopedia" / "How would you like to continue?"), the two cards, and the "Ultranos Healthcare Platform" footer.
- Two large, tappable cards (stacked), each with a lucide icon, title, and one-line subtitle:
  - **Ultranos member** — icon (e.g. `Stethoscope` / `Building2`), title `t('onboarding.memberTitle')` ("I use an Ultranos app"), subtitle `t('onboarding.memberSubtitle')` ("Sign in with your OPD Lite, Pharmacy Lite, Lab Lite or Admin account"). Tapping → `router.push('/(auth)/login')`.
  - **Public member** — icon (e.g. `UserPlus`), title `t('onboarding.publicTitle')` ("I'm new here"), subtitle `t('onboarding.publicSubtitle')` ("Create a personal account"). Tapping → `router.push('/(auth)/register')` (interim; O2 will repoint this).
- A `LanguageChips` control (consistent with login/register) so language can be set before auth.
- Cards: surface background, `Radius.lg`, subtle border/shadow, ≥44px targets, `accessibilityRole="button"` with composed labels. RTL-aware (logical layout + Arabic font).

### 3.2 Welcome routing — `app/welcome.tsx`
`handleGetStarted` routes to `/(auth)/onboarding` instead of `/(auth)/login`. (Welcome remains the one-time brand intro gated by `hasSeenWelcome`.)

### 3.3 Member sign-in — `app/(auth)/login.tsx` (repurpose)
Rebuilt on the **auth shell (§2a)** so it visually matches the OPD/Lab Lite login (header chip + wordmark + `LanguageChips`; centered `max-w` form; title `2xl` + muted subtitle; tinted error/reset banners; labeled email/password fields; end-aligned forgot-password link; full-width primary button; "Ultranos Healthcare Platform" footer).
- Remove the `flow` clinical/patient **segmented toggle** and the entire **patient-OTP path** (`handleRequestOtp`/`handleVerifyOtp`/OTP step/resend cooldown) — patient/public auth now lives in the public flow.
- Keep: email + password fields, `handleClinicalLogin` (rename internally to `handleSignIn`), **forgot-password** (`handleForgotPassword` + reset-sent status banner), error banner, loading state.
- Title → `t('login.memberTitle')` ("Sign in to Ultranos"); subtitle `t('login.memberSubtitle')`.
- A **Back** affordance returns to the chooser (`router.back()`); the old register link is removed (the chooser is the hub).
- On success: unchanged (`login(...)` into auth store → `router.replace('/(tabs)')`).

### 3.4 Routing wiring
- `app/(auth)/_layout.tsx`: add `<Stack.Screen name="onboarding" />` and make it the first screen (initial route of the auth stack).
- `app/_layout.tsx`: the unauthenticated redirect target changes from `/(auth)/login` to `/(auth)/onboarding` (the `!showWelcome && !isAuthenticated` redirect).

### 3.5 i18n — `home`-style additions in all four locales
New `onboarding` namespace with real translations in `en/prs/ps/ar`:
`onboarding.title` (optional heading), `memberTitle`, `memberSubtitle`, `publicTitle`, `publicSubtitle`.
New `login.memberTitle` ("Sign in to Ultranos") and `login.memberSubtitle` (e.g. "Use your Ultranos staff account") + a `common.poweredBy` ("Ultranos Healthcare Platform") for the shared footer. Place keys to keep the four locale objects structurally identical (`Translations = typeof en`).

## 4. Testing
- **Onboarding chooser** (`onboarding.test.tsx`): renders both cards; tapping the member card pushes `/(auth)/login`; tapping the public card pushes `/(auth)/register`.
- **Member login** (`login-screen.test.tsx`, updated): renders email/password + forgot-password; no clinical/patient toggle; `signInWithPassword` called on submit; forgot-password triggers `resetPasswordForEmail`. Remove assertions tied to the removed patient toggle / register link. (The pre-existing failing "register-link" test is removed/replaced as part of this — it no longer applies.)
- **Welcome** (existing test): "Get Started" routes to `/(auth)/onboarding`.
- No regression to E1/E2/E3 tests; native typecheck adds no new errors; ui-kit typecheck passes.

## 5. Out of Scope (O1)
- The full **public signup wizard** (phone → OTP → profile + address) — **O2** (the public button is interim-wired to `register.tsx`).
- **Account discovery + claim** (phone lookup, MPI, DOB factor) — **O3**.
- **Profile screen refactor** + Hub `users.getProfile` — **E4**.
- **TOTP/MFA** for member login — future.
- Deleting `register.tsx` — it stays as the interim public path; O2 supersedes it.

## 6. Success Criteria
- Unauthenticated users land on the onboarding chooser (after Welcome); both cards route correctly.
- Member sign-in is email/password + forgot-password only (no patient toggle), and successful sign-in still reaches the tabs.
- New onboarding/login i18n keys present in all four locales with real translations.
- Chooser + updated login tests pass; no regressions; ui-kit + native typechecks clean.

## 7. Risks / Open Questions
- **Removing the patient-OTP path from `login.tsx`** must not break deep links or the interim public flow — `register.tsx` retains its own OTP logic, so patient OTP still works via the public card.
- **login-screen test churn**: existing tests assert the toggle/register-link; they're updated/trimmed here (the pre-existing failing register-link case is retired, not "fixed").
- **Premium feel** is partly visual; the chooser is built to the Clinical-Calm bar but final polish (spacing, motion) is validated in a real Expo run, consistent with the E2 collapse-animation caveat.

# Pharmopedia O2 — Public Signup Wizard (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Part of:** the Onboarding & Identity program (O1 ✓ → **O2** → O3 → E4). Builds on committed E1/E2/E3/O1.

---

## 1. Background

O1 added the onboarding chooser; its **public** card currently routes to the interim `register.tsx` (a two-field phone-OTP screen). O2 replaces that with a **premium, multi-step public signup wizard** that creates a self-owned profile: phone → OTP → name → photo → current address. The captured data is exactly what the E4 Profile screen will display/edit.

Account discovery/claim (matching an existing record by phone) is **O3**, which will insert a post-OTP branch into this same wizard.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Route | Rebuild `app/(auth)/register.tsx` as the wizard (O1's public card already routes here) |
| Persistence | Name + address → Supabase **`user_metadata`**; photo → Supabase **Storage** (`profile-photos` bucket), URL in `user_metadata.photo_url`. **No `patients` row** (claim/dedup is O3) |
| Photo | `expo-image-picker` (camera/library), **optional/skippable** → initials avatar if skipped |
| Address | Province + district **required**, village **optional**; reuse `getDistrictsByProvince`/`AfghanProvince` from `@ultranos/shared-types` |
| UX | Premium Clinical-Calm; AuthShell-style header + step progress indicator; per-step validation; haptics |
| Visual reference | Consistent with the OPD/Lab Lite auth shell (O1) and OPD Lite's address pattern (`GeographySection`) |

## 3. Scope

### 3.1 Wizard structure — `app/(auth)/register.tsx` (rebuild)
A single screen driving a `step` state machine with a progress indicator (e.g. "Step N of 5") and Back/Continue, built on the O1 `AuthShell` (wordmark + LanguageChips header, centered content, footer). Steps:

1. **Phone** — phone `TextInput` → `supabase.auth.signInWithOtp({ phone })`; on success advance + start a 60s resend cooldown (reuse the existing register cooldown logic).
2. **Verify** — 6-digit OTP input + resend → `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. On success the Supabase **session exists** (user authenticated); store it in the auth store via `login(...)`. *(O3 inserts the account-discovery step immediately after this verification.)*
3. **Name** — given name + family name (`TextInput`s); both required (non-blank) to continue.
4. **Photo (skippable)** — a `PhotoPicker` using `expo-image-picker`; shows a circular preview (or initials placeholder) + "Choose photo" / "Take photo" / "Skip". Selection stored as a local URI until Finish.
5. **Address** — `ProvincePicker` → `DistrictPicker` (districts depend on the chosen province) → village `TextInput` (optional). Province + district required to continue.
6. **Finish** (triggered from the Address step's "Create account"/"Finish"): (a) if a photo URI was chosen, upload it to Storage (3.3); (b) `supabase.auth.updateUser({ data: { given_name, family_name, address: { province, district, village }, photo_url } })`; (c) `router.replace('/(tabs)')`. On any failure, show an inline error and keep the user on the step (the session already exists, so they can retry or finish later from Profile).

Each step validates before advancing; Back returns to the previous step (hardware back too). The wizard never blocks: after OTP the user is authenticated, so partial completion still lands them in the app (remaining fields completed later in Profile/E4).

### 3.2 Components
- `app/(auth)/register.tsx` — the wizard host (step state, progress, navigation, submit).
- `src/components/signup/PhotoPicker.tsx` — image-picker + preview + skip.
- `src/components/signup/ProvincePicker.tsx` and `DistrictPicker.tsx` — searchable modal pickers over `@ultranos/shared-types` data (`AfghanProvince` list; `getDistrictsByProvince`). District picker is disabled until a province is selected and resets when province changes.
- `src/components/signup/WizardProgress.tsx` — the "Step N of M" indicator.
- `src/lib/profile-photo.ts` — `uploadProfilePhoto(uri, userId)` → uploads to the `profile-photos` bucket at `{userId}/avatar.<ext>` and returns the public/again-signed URL.

### 3.3 Supabase Storage (backend)
- Create a `profile-photos` Storage bucket via Supabase MCP.
- RLS / access: an authenticated user may read and write objects under their own `{auth.uid}/…` prefix only. Photos are non-PHI profile avatars; bucket may be public-read or signed-URL — the plan picks one (default: private bucket + a stored signed/public URL in `user_metadata.photo_url`; if public-read is simpler and acceptable for avatars, use that).
- `uploadProfilePhoto` reads the local file (expo-file-system/`fetch`→blob) and `supabase.storage.from('profile-photos').upload(...)` with upsert.

### 3.4 Dependencies & config
- Add `expo-image-picker` to `apps/pharmopedia/package.json` (Expo 54-compatible) and the picker plugin/permission strings (camera + photo library usage descriptions) in `app.config.ts`.
- A Vitest mock for `expo-image-picker` (mirrors the existing expo mocks) so wizard tests run.

### 3.5 i18n
New `signup` namespace in all four locales (`en/prs/ps/ar`) with real translations: step titles/subtitles, field labels (given name, family name, province, district, village), photo actions (choose/take/skip), progress ("Step {{n}} of {{total}}"), validation messages, and finish/error strings. Reuse existing `register.phone/sendCode/enterCode/sixDigitCode/resendCode/resendIn` where they already exist. Keep all four locale objects structurally identical.

## 4. Testing
- **Step navigation/validation:** can't advance past Name without both names; can't advance past Address without province + district; village optional; Back returns a step.
- **OTP:** phone step calls `signInWithOtp`; verify step calls `verifyOtp` and on success stores the session.
- **Address pickers:** selecting a province loads its districts; changing province resets district; district disabled until province chosen.
- **Photo:** skip → no upload, initials avatar; choosing a photo stores the URI and (at Finish) calls `uploadProfilePhoto`.
- **Finish:** calls `updateUser` with `{ given_name, family_name, address, photo_url }` and routes to `/(tabs)` (Storage + image-picker mocked).
- `uploadProfilePhoto` unit test (mocked `supabase.storage`).
- No regression to existing suites; native typecheck adds no new errors; ui-kit typecheck passes.

## 5. Out of Scope (O2)
- **Account discovery + claim** (post-OTP phone lookup, MPI, DOB second factor, staff-bounce) — **O3** (inserts a step after Verify).
- **Profile screen** display/edit of this data — **E4**.
- Member login — **O1 (done)**.
- Creating a `patients` row — deferred (O3/clinical registration owns patient records).

## 6. Success Criteria
- The public card opens a multi-step wizard; a new user completes phone → OTP → name → (optional photo) → address and lands in the app with `user_metadata` populated and (if chosen) a photo in Storage referenced by `photo_url`.
- Province/district pickers use the shared dataset; province+district enforced, village optional.
- Photo is skippable; skipping yields an initials avatar with no upload.
- New `signup` i18n keys in all four locales; new wizard tests pass; no regressions; ui-kit + native typechecks clean.

## 7. Risks / Open Questions
- **Storage bucket access model** (public-read vs private+signed URL): plan picks the simplest that keeps avatars working offline-tolerantly; documented there.
- **`expo-image-picker` in the test env:** mocked (no native module in Vitest); real capture validated in an Expo run.
- **Province list export:** confirm the exact runtime export for the full province list in `@ultranos/shared-types` (the type is `AfghanProvince`; the plan pins the array/helper). If only a districts helper exists, derive the province list from it.
- **Wizard size:** larger than prior epics; the plan decomposes into bite-sized tasks (pickers, photo, persistence, wizard host) and may land as several commits.
- **Premium feel / final polish & real device capture:** validated in an Expo run (standing caveat).

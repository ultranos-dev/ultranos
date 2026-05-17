# Story 27.10: Patient Self-Registration Flow

Status: ready-for-dev

## Story

As a patient,
I want to sign up for the Health Passport app independently,
so that I can view my health records without needing a clinic to create my account.

## Acceptance Criteria

1. **Given** a new patient opening Patient Lite Mobile, **when** they begin registration, **then** the flow collects: phone number, OTP verification, first name, date of birth, and preferred language (full-screen language gateway per Story 18.3)
2. **And** a FHIR Patient resource is created at the Hub with no `org_id` (free-floating patient)
3. **And** the patient is assigned `FREE` tier by default (`patient_tier` field on the Patient resource in `_ultranos` extension)
4. **And** biometric unlock is configured during first registration for subsequent access
5. **And** the patient is directed to the language onboarding gateway on first use, then to the home dashboard on subsequent logins
6. **And** a 90-day session is established per PRD Section 10.1
7. **And** registration emits an audit event with only the opaque patient ID (no PHI in audit log)
8. **And** duplicate phone number registration is rejected with a generic error (no confirmation of existing accounts -- prevents enumeration)

## Tasks / Subtasks

- [ ] Task 1: Add `patient_tier` field to FHIR Patient type (AC: #3)
  - [ ] 1.1 In `packages/shared-types/src/fhir/patient.ts`, add `patient_tier: 'FREE' | 'PREMIUM'` to the `_ultranos` interface
  - [ ] 1.2 Export a `PatientTier` type alias or enum: `type PatientTier = 'FREE' | 'PREMIUM'`
  - [ ] 1.3 Default value documented as `FREE` in JSDoc
  - [ ] 1.4 Update `CreatePatientInput` if needed (patient_tier is NOT user-supplied -- server defaults to FREE)

- [ ] Task 2: Create Hub API patient self-registration endpoint (AC: #1, #2, #3, #7, #8)
  - [ ] 2.1 Create `apps/hub-api/src/trpc/routers/patient-registration.ts` with a `register` mutation
  - [ ] 2.2 Input schema: `{ phone: string, otpCode: string, firstName: string, dateOfBirth: string, preferredLanguage: string }`
  - [ ] 2.3 This is a **public endpoint** (no auth required for initial OTP request) -- use `publicProcedure` not `protectedProcedure`
  - [ ] 2.4 Step 1: Verify OTP via Supabase Auth phone provider (`supabase.auth.verifyOtp()`)
  - [ ] 2.5 Step 2: Check for duplicate phone number -- if exists, return generic `{ success: false, message: 'Registration failed. Please try again.' }` (prevents account enumeration per AC #8)
  - [ ] 2.6 Step 3: Create FHIR Patient resource with `patient_tier: 'FREE'`, no `org_id`
  - [ ] 2.7 Step 4: Create Supabase Auth user linked to the patient record
  - [ ] 2.8 Step 5: Emit audit event with opaque patient ID only (never phone, name, or DOB)
  - [ ] 2.9 Step 6: Return session token (access + refresh) on success
  - [ ] 2.10 Register router in `apps/hub-api/src/trpc/routers/_app.ts`

- [ ] Task 3: Create OTP request endpoint (AC: #1)
  - [ ] 3.1 Add `requestOtp` mutation to the patient-registration router
  - [ ] 3.2 Input: `{ phone: string }` -- sends OTP via Supabase Auth
  - [ ] 3.3 Always return `{ sent: true }` regardless of whether phone exists (prevents enumeration)
  - [ ] 3.4 Rate limit: max 3 OTP requests per phone number per 10-minute window

- [ ] Task 4: Create registration screens in Patient Lite Mobile (AC: #1, #4, #5)
  - [ ] 4.1 Create `apps/patient-lite-mobile/src/screens/registration/PhoneInputScreen.tsx` -- phone number input with country code selector + "Send OTP" button
  - [ ] 4.2 Create `apps/patient-lite-mobile/src/screens/registration/OtpVerificationScreen.tsx` -- 6-digit OTP code input with resend timer (60s cooldown)
  - [ ] 4.3 Create `apps/patient-lite-mobile/src/screens/registration/ProfileSetupScreen.tsx` -- first name + date of birth + preferred language (language selector as full-screen gateway per Story 18.3 interface)
  - [ ] 4.4 Create `apps/patient-lite-mobile/src/screens/registration/BiometricSetupScreen.tsx` -- biometric enrollment prompt with skip option (can set up later in settings)
  - [ ] 4.5 Create `apps/patient-lite-mobile/src/navigation/RegistrationNavigator.tsx` -- stack navigator for registration flow
  - [ ] 4.6 All screens must support RTL layout (use logical CSS properties: `marginStart`, `paddingEnd`, etc.)
  - [ ] 4.7 On completion: navigate to language gateway (first time) or home (subsequent logins)

- [ ] Task 5: Biometric unlock setup during registration (AC: #4)
  - [ ] 5.1 Use `expo-local-authentication` to check device biometric capability
  - [ ] 5.2 If supported: prompt user to enable biometric unlock
  - [ ] 5.3 Store biometric binding reference via existing `mobile-key-service.ts` patterns (SecureStore with `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`)
  - [ ] 5.4 If user skips: set a flag to remind them later in settings
  - [ ] 5.5 If device has no biometric hardware: skip screen entirely, use PIN/passcode fallback

- [ ] Task 6: 90-day session configuration (AC: #6)
  - [ ] 6.1 Configure Supabase Auth session with 90-day refresh token expiry
  - [ ] 6.2 Store refresh token securely via `expo-secure-store` (existing pattern in `mobile-key-service.ts`)
  - [ ] 6.3 On app open: check session validity, refresh if needed
  - [ ] 6.4 After 90 days: force re-authentication (OTP flow)

- [ ] Task 7: Registration API client in Patient Lite Mobile (AC: #1, #2)
  - [ ] 7.1 Create `apps/patient-lite-mobile/src/lib/registration-api.ts` -- API client for registration endpoints
  - [ ] 7.2 `requestOtp(phone: string): Promise<{ sent: boolean }>`
  - [ ] 7.3 `register(input: RegistrationInput): Promise<{ session: Session, patientId: string }>`
  - [ ] 7.4 Handle network errors gracefully -- registration requires connectivity (cannot register offline)

- [ ] Task 8: Tests (AC: all)
  - [ ] 8.1 Hub API tests (`apps/hub-api/src/__tests__/patient-registration.test.ts`):
    - OTP request always returns `{ sent: true }` (no enumeration)
    - Successful registration creates Patient with `patient_tier: FREE`, no `org_id`
    - Duplicate phone returns generic error (not "phone already exists")
    - Audit event emitted with opaque patient ID only
    - Session token returned on success
    - Invalid OTP rejected
  - [ ] 8.2 Shared types tests:
    - `PatientTier` type is `'FREE' | 'PREMIUM'`
    - `FhirPatient._ultranos.patient_tier` exists
  - [ ] 8.3 Mobile screen tests (`apps/patient-lite-mobile/__tests__/registration/`):
    - Phone input screen renders country code selector + input
    - OTP screen accepts 6-digit code, shows resend timer
    - Profile setup screen collects name + DOB + language
    - Biometric setup screen shown when hardware available, skipped when not
    - Navigation flow proceeds through all screens in order
  - [ ] 8.4 Registration API client tests:
    - Successful registration flow
    - Network error handling

## Dev Notes

### Architecture & Patterns

**Public endpoint pattern:**
This is one of the few public (unauthenticated) endpoints in the Hub API. Use `publicProcedure` from `apps/hub-api/src/trpc/init.ts`. The existing codebase uses `protectedProcedure` for all clinical endpoints -- this registration endpoint is intentionally public because the user has no session yet.

**OTP flow via Supabase Auth:**
Supabase Auth provides a phone OTP provider out of the box. The flow is:
1. Client calls `requestOtp({ phone })` -> Hub API calls `supabase.auth.signInWithOtp({ phone })`
2. Supabase sends SMS OTP
3. Client collects OTP code -> calls `register({ phone, otpCode, ... })`
4. Hub API calls `supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })` -> returns session if valid

**Free-floating patient (locked decision):**
Per the locked decisions in the project memory, patients have NO `org_id`. The `FhirPatient` resource does not reference any organization. Patients are linked to organizations implicitly through encounters, not through ownership. This means the patient table has no foreign key to organizations.

**Anti-enumeration pattern:**
The generic error on duplicate phone is critical for patient privacy. An attacker should not be able to determine whether a phone number is registered by observing different error messages. Both `requestOtp` and `register` must return the same success-shaped response regardless of whether the phone exists.

**Session architecture (Patient-specific):**
Patient auth differs from practitioner auth per CLAUDE.md:
- Patients use OTP-only (no password, no MFA/TOTP)
- 90-day session (vs 15-min access tokens for practitioners)
- Biometric unlock for subsequent access
- The 90-day window is the refresh token lifetime; access tokens still expire at 15 minutes but auto-refresh silently

### Project Structure Notes

**New files:**
- `packages/shared-types/src/fhir/patient.ts` -- MODIFIED (add `patient_tier` to `_ultranos`)
- `apps/hub-api/src/trpc/routers/patient-registration.ts` -- new router
- `apps/hub-api/src/__tests__/patient-registration.test.ts` -- new tests
- `apps/patient-lite-mobile/src/screens/registration/PhoneInputScreen.tsx`
- `apps/patient-lite-mobile/src/screens/registration/OtpVerificationScreen.tsx`
- `apps/patient-lite-mobile/src/screens/registration/ProfileSetupScreen.tsx`
- `apps/patient-lite-mobile/src/screens/registration/BiometricSetupScreen.tsx`
- `apps/patient-lite-mobile/src/navigation/RegistrationNavigator.tsx`
- `apps/patient-lite-mobile/src/lib/registration-api.ts`
- `apps/patient-lite-mobile/__tests__/registration/` -- test directory

**Modified files:**
- `apps/hub-api/src/trpc/routers/_app.ts` -- register `patientRegistration` router
- `apps/patient-lite-mobile/src/navigation/` -- integrate RegistrationNavigator into root navigator

**Database migration (via Supabase MCP):**
- Add `patient_tier` column to `patients` table: `ALTER TABLE patients ADD COLUMN patient_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (patient_tier IN ('FREE', 'PREMIUM'));`
- Add index: `CREATE INDEX idx_patients_patient_tier ON patients(patient_tier);`

### RTL Considerations

All registration screens must work in RTL (Arabic, Dari). Specific concerns:
- Phone number input: numbers stay LTR even in RTL context (use `writingDirection: 'ltr'` on the phone input field)
- OTP digit inputs: individual digit boxes stay LTR
- Name input: supports RTL script entry (Arabic/Dari names)
- Date picker: use locale-aware date formatting
- Navigation back arrows: must mirror in RTL

### Language Gateway Integration

Story 18.3 defines a full-screen language onboarding gateway. The registration flow's language selection in ProfileSetupScreen should:
- Use the same language list and selection UI as the gateway (import shared config if available)
- Set the app locale immediately on selection
- The post-registration redirect goes to the language gateway for the full onboarding experience, then to home

**If Story 18.3 is not yet implemented:** The ProfileSetupScreen can include an inline language picker (dropdown with supported languages) as a fallback. When 18.3 lands, the post-registration flow will redirect to the gateway instead.

### Security Notes

- **Rate limiting on OTP:** Essential to prevent SMS bombing. Implement at the Hub API layer (3 requests per phone per 10 minutes). Supabase Auth also has built-in rate limits, but the Hub should enforce its own.
- **No PHI in errors:** Error messages must never reveal whether a phone number is registered, what the patient's name is, etc.
- **Audit logging:** Use `@ultranos/audit-logger` with event type `PATIENT_REGISTRATION`. Log only: `{ eventType: 'PATIENT_REGISTRATION', subjectId: patientId, outcome: 'success' | 'failure' }`. Never log phone number, name, or DOB.

### References

- [Source: CLAUDE.md#Auth-Sessions] -- Patient auth is OTP-only, no password
- [Source: CLAUDE.md#FHIR-R4-Alignment] -- `createdAt` lives in `_ultranos`, not `meta`
- [Source: CLAUDE.md#Encryption] -- QR codes contain `{ pid, iat, exp, v, sig? }`, never raw PHI
- [Source: _bmad-output/planning-artifacts/epics.md#Story-27.10] -- Epic story definition
- [Source: packages/shared-types/src/fhir/patient.ts] -- Current FHIR Patient type (needs `patient_tier` extension)
- [Source: apps/hub-api/src/trpc/routers/patient.ts] -- Existing patient router patterns
- [Source: apps/patient-lite-mobile/src/lib/mobile-key-service.ts] -- SecureStore + biometric patterns
- [Source: apps/patient-lite-mobile/src/lib/ecdsa-key-init.ts] -- Key init flow (runs after registration)
- [Source: apps/hub-api/src/trpc/routers/_app.ts] -- Router registration pattern
- **Depends on:** Epic 18 Story 18.3 (language gateway) -- can be developed in parallel if gateway interface is agreed
- **Depended on by:** Stories 27.11, 27.12 (patient_tier field must exist)

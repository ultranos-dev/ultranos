# Story 27.11: Freemium Tier Definition & Feature Gating

Status: ready-for-dev

## Story

As a product owner,
I want free and premium feature tiers defined for Patient Lite,
so that we can monetize value-added patient features.

## Acceptance Criteria

1. **Given** a free-tier patient, **when** they use Patient Lite Mobile, **then** they have access to: Health Passport QR code display and refresh, view active medications and allergies (allergy banner always visible per safety rules), language selection and switching, consent management (grant/withdraw), and view basic appointment history
2. **Given** a premium-tier patient, **when** they use Patient Lite Mobile, **then** they additionally have access to: full medical history export (FHIR Bundle download), guardian linking and delegated access management, push notification center (medication reminders, appointment alerts), prescription history with refill tracking, and priority support channel
3. **Given** a free-tier patient, **when** they navigate to a premium feature, **then** a contextual "Upgrade to Premium" prompt is shown with the feature description and pricing
4. **And** the tier is stored as `patient_tier` (enum: FREE, PREMIUM) on the Patient resource in the Hub's `_ultranos` extension
5. **And** tier checks are enforced at the Hub API layer (premium endpoints return `PREMIUM_REQUIRED` for free-tier patients) AND in the mobile app UI (locked icon + upgrade prompt)
6. **And** allergy display, medication safety information, and consent management are NEVER gated behind premium -- these are safety-critical features

## Tasks / Subtasks

- [ ] Task 1: Define feature-tier mapping configuration (AC: #1, #2)
  - [ ] 1.1 Create `packages/shared-types/src/feature-tiers.ts` with canonical tier definitions
  - [ ] 1.2 Define `FREE_FEATURES` constant array:
    - `HEALTH_PASSPORT_QR` -- QR code display and refresh
    - `VIEW_ACTIVE_MEDICATIONS` -- current medication list
    - `VIEW_ALLERGIES` -- allergy banner (safety-critical, always visible)
    - `LANGUAGE_SELECTION` -- language switching
    - `CONSENT_MANAGEMENT` -- grant/withdraw consent
    - `BASIC_APPOINTMENT_HISTORY` -- past appointments list
  - [ ] 1.3 Define `PREMIUM_FEATURES` constant array:
    - `MEDICAL_HISTORY_EXPORT` -- FHIR Bundle download
    - `GUARDIAN_LINKING` -- delegated access management
    - `NOTIFICATION_CENTER` -- medication reminders, appointment alerts
    - `PRESCRIPTION_HISTORY` -- refill tracking
    - `PRIORITY_SUPPORT` -- support channel
  - [ ] 1.4 Define `SAFETY_CRITICAL_FEATURES` constant array (subset of FREE that can NEVER be gated):
    - `VIEW_ALLERGIES`
    - `VIEW_ACTIVE_MEDICATIONS`
    - `CONSENT_MANAGEMENT`
  - [ ] 1.5 Export type `FeatureId` as union of all feature identifiers
  - [ ] 1.6 Export helper `isFeaturePremium(featureId: FeatureId): boolean`
  - [ ] 1.7 Export helper `isSafetyCritical(featureId: FeatureId): boolean`
  - [ ] 1.8 Add exports to `packages/shared-types/src/index.ts` barrel file

- [ ] Task 2: Create `enforcePremiumTier` middleware at Hub API (AC: #4, #5)
  - [ ] 2.1 Create `apps/hub-api/src/trpc/middleware/enforcePremiumTier.ts`
  - [ ] 2.2 Middleware reads `patient_tier` from the authenticated patient's record in the database
  - [ ] 2.3 If `patient_tier === 'FREE'`, throw `TRPCError` with code `FORBIDDEN` and message `PREMIUM_REQUIRED`
  - [ ] 2.4 If `patient_tier === 'PREMIUM'`, proceed to the next middleware/handler
  - [ ] 2.5 Include the feature ID in the error data payload so the mobile app can show the correct upgrade prompt: `{ code: 'PREMIUM_REQUIRED', featureId: string }`
  - [ ] 2.6 Cache the patient tier lookup for the duration of the request context (avoid repeated DB queries if multiple premium checks in one request)
  - [ ] 2.7 **CRITICAL:** This middleware must NEVER be applied to safety-critical endpoints (allergies, active medications, consent). Add a runtime assertion that validates the procedure name is not in the safety-critical list.

- [ ] Task 3: Apply `enforcePremiumTier` to premium Hub API endpoints (AC: #5)
  - [ ] 3.1 Identify existing or future endpoints that serve premium features:
    - Medical history export (FHIR Bundle) -- `patient.exportHistory` (may not exist yet)
    - Guardian linking -- `patient.linkGuardian` (may not exist yet)
    - Notification center -- `notification.listPatientNotifications` (may not exist yet)
    - Prescription history -- `medication.prescriptionHistory` (may not exist yet)
  - [ ] 3.2 For endpoints that exist: add `.use(enforcePremiumTier('FEATURE_ID'))` to the procedure chain
  - [ ] 3.3 For endpoints that don't exist yet: document the middleware application as a TODO in each endpoint's future story file
  - [ ] 3.4 Create a `PREMIUM_ENDPOINT_REGISTRY` constant mapping endpoint names to feature IDs for documentation and validation

- [ ] Task 4: Create `<PremiumGate>` component in Patient Lite Mobile (AC: #3, #5)
  - [ ] 4.1 Create `apps/patient-lite-mobile/src/components/PremiumGate.tsx`
  - [ ] 4.2 Props: `{ featureId: FeatureId, featureTitle: string, featureDescription: string, children: ReactNode }`
  - [ ] 4.3 Reads `patient_tier` from local patient state (Zustand store or context)
  - [ ] 4.4 If `PREMIUM`: render `children` (pass through)
  - [ ] 4.5 If `FREE`: render a locked overlay with:
    - Locked icon (padlock)
    - Feature title and description
    - "Upgrade to Premium" CTA button (navigates to upgrade flow from Story 27.12)
    - Monthly price display
  - [ ] 4.6 Support RTL layout (logical properties, mirrored padlock icon NOT needed -- padlock is a universal symbol)
  - [ ] 4.7 Accessible: screen reader announces "Premium feature, upgrade required" for locked state

- [ ] Task 5: Create patient tier store in Patient Lite Mobile (AC: #4, #5)
  - [ ] 5.1 Create `apps/patient-lite-mobile/src/stores/patient-tier-store.ts` (Zustand or extend existing patient profile store)
  - [ ] 5.2 State: `{ patientTier: 'FREE' | 'PREMIUM', setPatientTier: (tier) => void }`
  - [ ] 5.3 Initialize from Hub API patient profile on login
  - [ ] 5.4 Persist to local encrypted storage (SQLCipher via existing `encrypted-db.ts`)
  - [ ] 5.5 Reactive: when tier changes (upgrade/downgrade), all `<PremiumGate>` components re-render immediately

- [ ] Task 6: Wire premium gates into Patient Lite screens (AC: #2, #3)
  - [ ] 6.1 Identify existing screens that serve premium features:
    - If `ProfileScreen.tsx` has medical history export: wrap with `<PremiumGate featureId="MEDICAL_HISTORY_EXPORT">`
    - If guardian linking UI exists: wrap with `<PremiumGate featureId="GUARDIAN_LINKING">`
  - [ ] 6.2 For screens that don't exist yet (notification center, prescription history, guardian linking):
    - Create placeholder screen files in `apps/patient-lite-mobile/src/screens/` with `<PremiumGate>` wrapping
    - Content can be "Coming Soon" placeholder inside the gate
  - [ ] 6.3 **DO NOT** wrap allergy display, medication safety info, or consent management with PremiumGate

- [ ] Task 7: Safety validation tests (AC: #6)
  - [ ] 7.1 Create `apps/hub-api/src/__tests__/premium-safety-validation.test.ts`
  - [ ] 7.2 Test: allergy endpoints (`allergy.list`, `allergy.get`) do NOT use `enforcePremiumTier` middleware
  - [ ] 7.3 Test: medication safety endpoints (`medicationStatement.list`) do NOT use `enforcePremiumTier` middleware
  - [ ] 7.4 Test: consent endpoints (`consent.list`, `consent.grant`, `consent.withdraw`) do NOT use `enforcePremiumTier` middleware
  - [ ] 7.5 Test: attempting to apply `enforcePremiumTier` to a safety-critical endpoint throws a configuration error
  - [ ] 7.6 Create `apps/patient-lite-mobile/__tests__/premium-safety-validation.test.tsx`
  - [ ] 7.7 Test: allergy banner component renders without PremiumGate wrapping
  - [ ] 7.8 Test: medication list screen is accessible to FREE tier patients
  - [ ] 7.9 Test: consent settings screen is accessible to FREE tier patients

- [ ] Task 8: Hub API and mobile unit tests (AC: all)
  - [ ] 8.1 `apps/hub-api/src/__tests__/enforce-premium-tier.test.ts`:
    - FREE tier patient on premium endpoint: returns `PREMIUM_REQUIRED` error with feature ID
    - PREMIUM tier patient on premium endpoint: passes through
    - Tier lookup is cached per request context
    - Runtime assertion fires if applied to safety-critical endpoint
  - [ ] 8.2 `apps/patient-lite-mobile/__tests__/PremiumGate.test.tsx`:
    - PREMIUM tier: renders children
    - FREE tier: renders locked overlay with feature description
    - CTA button navigates to upgrade flow
    - Accessible labels present
    - RTL layout renders correctly
  - [ ] 8.3 `packages/shared-types/src/__tests__/feature-tiers.test.ts`:
    - `isFeaturePremium` returns true for premium features, false for free features
    - `isSafetyCritical` returns true for allergy, medication, consent features
    - `SAFETY_CRITICAL_FEATURES` is a subset of `FREE_FEATURES`
    - All feature IDs are unique (no duplicates)

## Dev Notes

### Architecture & Patterns

**Dual enforcement (Hub API + Mobile UI):**
The tier check happens in two places by design:
1. **Hub API middleware (`enforcePremiumTier`)** -- hard gate. Even if the mobile app is modified/bypassed, the API refuses to serve premium data to free-tier patients. This is the security boundary.
2. **Mobile UI (`<PremiumGate>`)** -- soft gate. Provides a good UX by showing the locked state immediately without making an API call that will fail. This is the UX boundary.

Both must stay in sync: if a feature is premium at the API, it must also be gated in the UI. The `PREMIUM_FEATURES` constant from `packages/shared-types/src/feature-tiers.ts` is the single source of truth for both.

**Safety-critical features are sacrosanct:**
Per CLAUDE.md healthcare safety rules:
- Allergies render first, in red, never collapsed, never behind a tab -- and certainly never behind a paywall
- Drug interaction checks must never be skipped
- Consent management is a patient right under data protection regulations (GDPR, local equivalents)

The `SAFETY_CRITICAL_FEATURES` list and the runtime assertion in `enforcePremiumTier` are defense-in-depth against accidentally gating these features.

**Patient-facing endpoints are exempt from org_id entitlement checks:**
The institutional entitlement middleware (Story 27.3) checks `org_id` on the caller's JWT. Patient endpoints have no `org_id` (free-floating patients). The `enforcePremiumTier` middleware is a separate, patient-specific enforcement layer that checks `patient_tier` on the Patient resource, not organizational subscription status.

**Error shape for `PREMIUM_REQUIRED`:**
```typescript
throw new TRPCError({
  code: 'FORBIDDEN',
  message: 'PREMIUM_REQUIRED',
  cause: { featureId: 'MEDICAL_HISTORY_EXPORT' }
})
```
The mobile app catches this specific error shape and routes to the upgrade screen with the feature context pre-populated.

### Project Structure Notes

**New files:**
- `packages/shared-types/src/feature-tiers.ts` -- canonical tier definitions (shared between Hub API and mobile)
- `apps/hub-api/src/trpc/middleware/enforcePremiumTier.ts` -- Hub API middleware
- `apps/hub-api/src/__tests__/enforce-premium-tier.test.ts`
- `apps/hub-api/src/__tests__/premium-safety-validation.test.ts`
- `apps/patient-lite-mobile/src/components/PremiumGate.tsx`
- `apps/patient-lite-mobile/src/stores/patient-tier-store.ts`
- `apps/patient-lite-mobile/__tests__/PremiumGate.test.tsx`
- `apps/patient-lite-mobile/__tests__/premium-safety-validation.test.tsx`
- `packages/shared-types/src/__tests__/feature-tiers.test.ts`

**Modified files:**
- `packages/shared-types/src/index.ts` -- add feature-tiers exports
- Existing premium endpoint files (when they exist) -- add `.use(enforcePremiumTier(...))` to procedure chains

**No database migration needed:** The `patient_tier` column is added in Story 27.10. This story only reads it.

### Middleware Implementation Pattern

Follow the existing middleware pattern from `apps/hub-api/src/trpc/middleware/enforceConsent.ts` and `enforceResourceAccess.ts`:

```typescript
// Pattern from existing middleware
export function enforcePremiumTier(featureId: FeatureId) {
  return t.middleware(async ({ ctx, next }) => {
    // 1. Validate featureId is not safety-critical (runtime assertion)
    if (isSafetyCritical(featureId)) {
      throw new Error(`CONFIGURATION ERROR: Cannot apply premium gate to safety-critical feature: ${featureId}`)
    }

    // 2. Look up patient_tier (cached on ctx if already fetched)
    const tier = ctx._patientTier ?? await fetchPatientTier(ctx.userId)

    // 3. Gate
    if (tier === 'FREE') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'PREMIUM_REQUIRED',
        cause: { featureId }
      })
    }

    return next({ ctx: { ...ctx, _patientTier: tier } })
  })
}
```

### PremiumGate Component Design

The `<PremiumGate>` component wraps entire screens, not individual UI elements. This keeps the gating coarse-grained and easy to audit. Each premium screen is wrapped at the navigation level:

```tsx
// In navigation config
<Stack.Screen name="MedicalHistoryExport">
  {() => (
    <PremiumGate
      featureId="MEDICAL_HISTORY_EXPORT"
      featureTitle="Medical History Export"
      featureDescription="Download your complete medical history as a FHIR-standard health record bundle."
    >
      <MedicalHistoryExportScreen />
    </PremiumGate>
  )}
</Stack.Screen>
```

The locked overlay should be visually distinct but not alarming -- use the app's secondary color with a padlock icon, not a red warning. This is a commercial upsell, not a safety warning.

### Testing Strategy

**Safety validation tests are the most critical tests in this story.** They assert that the system's commercial logic never interferes with clinical safety. These tests should:
1. Enumerate all safety-critical endpoints by inspecting router definitions
2. Assert none of them include `enforcePremiumTier` in their middleware chain
3. Be treated as blocking -- if these tests fail, the build must fail

### References

- [Source: CLAUDE.md#Healthcare-Safety-Rules] -- Allergies first, red, never collapsed; drug interactions never skipped; consent never gated
- [Source: CLAUDE.md#Auth-Sessions] -- Patient auth is OTP-only, 90-day session
- [Source: _bmad-output/planning-artifacts/epics.md#Story-27.11] -- Epic story definition
- [Source: packages/shared-types/src/fhir/patient.ts] -- `_ultranos` extension namespace for `patient_tier`
- [Source: apps/hub-api/src/trpc/middleware/enforceConsent.ts] -- Existing middleware pattern
- [Source: apps/hub-api/src/trpc/middleware/enforceResourceAccess.ts] -- Existing middleware pattern
- [Source: apps/patient-lite-mobile/src/screens/ProfileScreen.tsx] -- Existing screen to potentially wrap
- [Source: apps/patient-lite-mobile/src/screens/PrivacySettingsScreen.tsx] -- Consent screen (NEVER gate)
- **Depends on:** Story 27.10 (`patient_tier` field must exist on Patient resource)
- **Depended on by:** Story 27.12 (upgrade flow needs PremiumGate and tier definitions)

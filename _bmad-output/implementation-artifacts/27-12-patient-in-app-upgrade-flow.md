# Story 27.12: Patient In-App Upgrade Flow

Status: ready-for-dev

## Story

As a patient on the free tier,
I want to upgrade to premium through the app,
so that I can access my full health history and advanced features.

## Acceptance Criteria

1. **Given** a free-tier patient in Patient Lite Mobile, **when** they tap an "Upgrade" prompt or navigate to Settings → Subscription, **then** a subscription page shows: list of premium features, monthly price, and a "Subscribe" button
2. **And** payment is processed via platform in-app purchase (Google Play Billing for Android, Apple IAP for iOS)
3. **And** on successful purchase, the Hub API is called to update `patient_tier` to `PREMIUM`
4. **And** the patient immediately gains access to premium features without app restart (reactive state update)
5. **And** subscription management (cancel, restore, view receipt) is handled through the respective app store's subscription management UI
6. **And** if the patient cancels, `patient_tier` reverts to `FREE` at end of billing period
7. **And** premium features accessed during the grace period continue to work until the period ends
8. **And** the upgrade/downgrade transition emits an audit event (opaque patient ID + tier change only)

## Tasks / Subtasks

- [ ] Task 1: Add `react-native-iap` dependency and configure (AC: #2)
  - [ ] 1.1 Add `react-native-iap` to `apps/patient-lite-mobile/package.json`
  - [ ] 1.2 Run `pnpm install` and verify native linking
  - [ ] 1.3 Configure product IDs in `apps/patient-lite-mobile/src/config/iap.ts`:
    - `ULTRANOS_PREMIUM_MONTHLY` — subscription product ID for both stores
    - Store-specific product IDs if they differ
  - [ ] 1.4 Add Google Play Billing configuration in `android/app/build.gradle` (billing client dependency)
  - [ ] 1.5 Add Apple IAP entitlement in `ios/PatientLite/PatientLite.entitlements`

- [ ] Task 2: Create IAP service module (AC: #2, #5)
  - [ ] 2.1 Create `apps/patient-lite-mobile/src/services/iap-service.ts`
  - [ ] 2.2 Implement `initIAP()` — call `RNIap.initConnection()`, fetch products
  - [ ] 2.3 Implement `getSubscriptionProduct(): Promise<IAPProduct>` — returns premium subscription product with price info
  - [ ] 2.4 Implement `purchaseSubscription(productId: string): Promise<Purchase>` — initiates platform purchase flow
  - [ ] 2.5 Implement `getActiveSubscription(): Promise<Purchase | null>` — checks current subscription status from store
  - [ ] 2.6 Implement `restorePurchases(): Promise<Purchase[]>` — restores previous purchases (account recovery)
  - [ ] 2.7 Add purchase listener for real-time status updates (handles background cancellation/renewal)
  - [ ] 2.8 Clean up connection on app background/unmount via `RNIap.endConnection()`

- [ ] Task 3: Create Hub API endpoint for tier update (AC: #3, #8)
  - [ ] 3.1 Add `updatePatientTier` mutation to `apps/hub-api/src/trpc/routers/patient.ts`
  - [ ] 3.2 Input schema: `z.object({ patientId: z.string().uuid(), tier: z.enum(['FREE', 'PREMIUM']), purchaseToken: z.string(), platform: z.enum(['android', 'ios']) })`
  - [ ] 3.3 **Server-side receipt validation** — verify purchase token with Google Play Developer API or Apple App Store Server API before updating tier
  - [ ] 3.4 Update `patient_tier` field in patient record via `ctx.supabase.from('patients').update({ patient_tier: tier })`
  - [ ] 3.5 Emit audit event: `{ action: 'UPDATE', resourceType: 'PATIENT', resourceId: patientId, metadata: { operation: 'tier_change', previousTier, newTier } }` — opaque patient ID only, no PHI
  - [ ] 3.6 Return `{ success: true, tier: newTier }`
  - [ ] 3.7 This endpoint is patient-facing — exempt from `enforceEntitlement` (no org_id context), but requires authenticated patient session

- [ ] Task 4: Create Subscription/Upgrade screen (AC: #1)
  - [ ] 4.1 Create `apps/patient-lite-mobile/src/screens/SubscriptionScreen.tsx`
  - [ ] 4.2 Layout: scrollable view with premium feature list, each with icon + description
  - [ ] 4.3 Display monthly price from IAP product data (localized by store)
  - [ ] 4.4 "Subscribe" CTA button — disabled while purchase in progress, shows loading indicator
  - [ ] 4.5 "Restore Purchases" link for account recovery scenarios
  - [ ] 4.6 Current tier badge at top: "Free Plan" (gray) or "Premium Plan" (green/gold)
  - [ ] 4.7 If already premium: show "Manage Subscription" link that opens native store subscription management
  - [ ] 4.8 RTL-compatible: use `I18nManager.isRTL` for layout direction, logical margins
  - [ ] 4.9 Register screen in navigation: accessible from Settings → Subscription AND from PremiumGate upgrade prompts

- [ ] Task 5: Implement purchase flow and reactive state update (AC: #2, #3, #4)
  - [ ] 5.1 On "Subscribe" tap: call `iapService.purchaseSubscription(productId)`
  - [ ] 5.2 On successful purchase: extract receipt/purchase token
  - [ ] 5.3 Call Hub API `patient.updatePatientTier` with purchase token for server-side validation
  - [ ] 5.4 On Hub API success: update local patient state immediately via Zustand store `setPatientTier('PREMIUM')`
  - [ ] 5.5 Premium features unlock without app restart — `PremiumGate` component (from Story 27.11) reads tier from store reactively
  - [ ] 5.6 On failure: show error message, do NOT update tier (purchase token validation failed)
  - [ ] 5.7 Acknowledge purchase with store via `RNIap.finishTransaction()` to prevent re-delivery

- [ ] Task 6: Implement cancellation and grace period handling (AC: #5, #6, #7)
  - [ ] 6.1 Cancellation is handled by the app store — user manages via Google Play / App Store subscription settings
  - [ ] 6.2 Add IAP purchase update listener in app startup to detect subscription status changes
  - [ ] 6.3 On subscription expiry detected: call Hub API `patient.updatePatientTier` with tier: 'FREE'
  - [ ] 6.4 During grace period (store still reports active): premium features remain accessible
  - [ ] 6.5 Add `premiumExpiresAt` field to patient state for grace period tracking
  - [ ] 6.6 Show "Subscription ending on [date]" banner when in grace period

- [ ] Task 7: Create Hub API webhook for server-side subscription events (AC: #6, #7)
  - [ ] 7.1 Create `apps/hub-api/src/trpc/routers/patient-subscription-webhook.ts`
  - [ ] 7.2 Google Play Real-time Developer Notifications (RTDN) endpoint — receives subscription state changes via Pub/Sub
  - [ ] 7.3 Apple App Store Server Notifications V2 endpoint — receives subscription lifecycle events
  - [ ] 7.4 On `SUBSCRIPTION_EXPIRED` / `DID_FAIL_TO_RENEW`: update `patient_tier` to `FREE`
  - [ ] 7.5 On `SUBSCRIPTION_RENEWED` / `DID_RENEW`: ensure `patient_tier` is `PREMIUM`
  - [ ] 7.6 Emit audit event for each tier change
  - [ ] 7.7 Idempotent processing — handle duplicate webhook deliveries gracefully

- [ ] Task 8: Write tests (AC: all)
  - [ ] 8.1 Create `apps/patient-lite-mobile/__tests__/SubscriptionScreen.test.tsx`
  - [ ] 8.2 Test: subscription screen renders premium feature list with price
  - [ ] 8.3 Test: "Subscribe" button initiates IAP purchase flow
  - [ ] 8.4 Test: successful purchase calls Hub API and updates local tier state
  - [ ] 8.5 Test: failed purchase shows error, tier unchanged
  - [ ] 8.6 Test: already-premium user sees "Manage Subscription" instead of "Subscribe"
  - [ ] 8.7 Test: "Restore Purchases" triggers restore flow
  - [ ] 8.8 Create `apps/hub-api/src/__tests__/patient-tier-update.test.ts`
  - [ ] 8.9 Test: `updatePatientTier` validates purchase token before updating
  - [ ] 8.10 Test: tier change emits audit event with opaque patient ID only (no PHI)
  - [ ] 8.11 Test: invalid purchase token returns error, tier unchanged
  - [ ] 8.12 Test: webhook handles subscription expiry → tier revert to FREE
  - [ ] 8.13 Test: webhook is idempotent (duplicate events don't corrupt state)
  - [ ] 8.14 Verify all existing patient-lite-mobile tests pass (no regressions)

## Dev Notes

### Architecture & Patterns

**In-App Purchase Library:**
- Use `react-native-iap` (v12+) — cross-platform IAP for React Native
- Handles both Google Play Billing Library v5+ and StoreKit 2
- The library manages purchase lifecycle: initConnection → getProducts → requestPurchase → finishTransaction
- Always call `finishTransaction()` after successful server validation to prevent duplicate delivery

**Server-Side Receipt Validation (CRITICAL):**
- NEVER trust client-side purchase confirmation alone — always validate server-side
- **Google Play:** Use Google Play Developer API `purchases.subscriptions.get` with the `purchaseToken`
- **Apple:** Use App Store Server API `/v1/transactions/{transactionId}` with signed JWS transaction
- Store purchase validation secrets as environment variables: `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`, `APPLE_APP_STORE_SERVER_KEY`
- Receipt validation prevents fraud (replayed tokens, modified receipts)

**Reactive State Update Pattern:**
- Patient tier lives in Zustand store (same pattern as auth-session-store)
- `PremiumGate` component from Story 27.11 reads `patientTier` from store
- On tier change: store update → React re-render → PremiumGate unlocks/locks → no app restart needed
- This follows the same reactive pattern used by `useAuthSessionStore` for auth state

**Webhook Architecture:**
- App store webhooks provide the source of truth for subscription state (handles edge cases the client can't: payment failures, family sharing changes, refunds)
- Webhooks are REST endpoints, not tRPC procedures — they receive POST from Apple/Google servers
- Use signature verification: Google RTDN uses Pub/Sub message verification, Apple uses JWS signed notifications
- Process webhooks idempotently — store last processed notification ID to handle duplicates

**Audit Logging:**
- Tier changes are operational, not PHI — but still audit-logged per project convention
- Log: `{ action: 'UPDATE', resourceType: 'PATIENT', metadata: { operation: 'tier_change', previousTier, newTier, platform } }`
- NEVER log purchase tokens, payment amounts, or any financial data in audit events
- Use opaque patient ID only (no name, no phone number)

### Project Structure Notes

**Files to Create:**
| File | Purpose |
|------|---------|
| `apps/patient-lite-mobile/src/config/iap.ts` | IAP product ID configuration |
| `apps/patient-lite-mobile/src/services/iap-service.ts` | IAP service module (purchase, restore, listen) |
| `apps/patient-lite-mobile/src/screens/SubscriptionScreen.tsx` | Upgrade/subscription management UI |
| `apps/hub-api/src/trpc/routers/patient-subscription-webhook.ts` | Store webhook handler (Google RTDN + Apple SNv2) |
| `apps/patient-lite-mobile/__tests__/SubscriptionScreen.test.tsx` | Mobile UI tests |
| `apps/hub-api/src/__tests__/patient-tier-update.test.ts` | Hub API tier update + webhook tests |

**Files to Modify:**
| File | Change |
|------|--------|
| `apps/patient-lite-mobile/package.json` | Add `react-native-iap` dependency |
| `apps/hub-api/src/trpc/routers/patient.ts` | Add `updatePatientTier` mutation |
| `apps/hub-api/src/trpc/routers/_app.ts` | Register webhook router |
| `apps/patient-lite-mobile/src/navigation/*.tsx` | Add SubscriptionScreen to navigation |

**Files NOT to Modify:**
| File | Reason |
|------|--------|
| `packages/billing/` | Institutional billing (Story 27.8) is separate from patient IAP |
| `packages/shared-types/src/fhir/patient.ts` | `patient_tier` field already added in Story 27.10 |
| `packages/shared-types/src/feature-tiers.ts` | Feature tier config already created in Story 27.11 |

### Dependencies

- **Story 27.10:** `patient_tier` field on Patient resource must exist
- **Story 27.11:** `PremiumGate` component and `enforcePremiumTier` middleware must exist
- **Epic 18 Story 18.4:** Patient home dashboard (navigation target after upgrade) — can develop in parallel

### References

- [Source: epics.md — Story 27.12 acceptance criteria]
- [Source: CLAUDE.md — Auth & Sessions: Patient 90-day session]
- [Source: CLAUDE.md — Healthcare Safety Rules: no PHI in logs]
- [Source: apps/hub-api/src/trpc/routers/patient.ts — existing patient router pattern]
- [Source: apps/patient-lite-mobile/src/stores/ — Zustand store pattern for reactive state]
- [Source: packages/audit-logger/src/logger.ts — AuditLogger.emit() pattern]
- [react-native-iap docs: https://react-native-iap.dooboolab.com/]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log
- 2026-05-11: Story created with comprehensive IAP integration guidance, server-side receipt validation, webhook architecture, and reactive state update patterns.

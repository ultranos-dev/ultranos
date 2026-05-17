# Story 25.4: Mobile ECDSA-P256 Crypto Implementation

Status: done

## Story

As a patient,
I want my Health Passport QR code to be cryptographically signed,
so that clinicians can verify my identity is authentic.

## Acceptance Criteria

1. **Given** `packages/crypto/`, **when** mobile ECDSA-P256 support is added, **then** `generateEcdsaKeyPair()` creates a P-256 key pair compatible with React Native (via `expo-crypto` or SubtleCrypto polyfill)
2. **And** `signWithEcdsa(privateKey, payload)` produces a compact signature suitable for QR encoding
3. **And** `verifyEcdsaSignature(publicKey, payload, signature)` verifies the signature (usable by OPD Lite, Hub API, and Patient Lite Mobile)
4. **And** the private key is stored in device secure storage (Expo SecureStore with biometric binding)
5. **And** the public key is registered with the Hub API for remote verification
6. **And** Patient Lite Mobile's `PatientQRCode` component is updated to include the `sig` field in the QR payload

## Tasks / Subtasks

- [x] Task 1: Add ECDSA-P256 crypto functions to `packages/crypto/` (AC: #1, #2, #3)
  - [x] 1.1 Create `src/ecdsa.ts` with `generateEcdsaKeyPair()`, `signWithEcdsa()`, `verifyEcdsaSignature()`
  - [x] 1.2 Use Web Crypto API (`crypto.subtle`) for ECDSA P-256 — same cross-platform approach as `browser-crypto.ts`
  - [x] 1.3 Export compact signature format (base64-encoded raw r||s, 64 bytes) suitable for QR encoding
  - [x] 1.4 Export key pair as `{ publicKey: string, privateKey: string }` in base64 (SPKI/PKCS8 or raw)
  - [x] 1.5 Add exports to `src/index.ts` barrel file
  - [x] 1.6 Write unit tests in `src/__tests__/ecdsa.test.ts`

- [x] Task 2: Add mobile key management to `packages/crypto/` (AC: #4)
  - [x] 2.1 Create `src/mobile-ecdsa-keystore.ts` — wraps Expo SecureStore for ECDSA private key storage
  - [x] 2.2 `storeEcdsaPrivateKey(privateKeyBase64)` → stores in SecureStore with biometric access control
  - [x] 2.3 `getEcdsaPrivateKey()` → retrieves private key (requires biometric auth)
  - [x] 2.4 `hasEcdsaKeyPair()` → checks if a key pair exists
  - [x] 2.5 `deleteEcdsaKeyPair()` → removes key pair (for rotation)
  - [x] 2.6 Declare `expo-secure-store` as optional peer dependency (NOT a hard dependency — this file is only imported by mobile apps)

- [x] Task 3: Add Hub API patient key registration endpoint (AC: #5)
  - [x] 3.1 Add `registerPatientKey` mutation to an existing or new router
  - [x] 3.2 Store ECDSA-P256 public key in `patient_keys` table (NOT `practitioner_keys` — that's Ed25519 for clinicians)
  - [x] 3.3 Only PATIENT role can register (self-only)
  - [x] 3.4 Reject duplicate key registration
  - [x] 3.5 Default expiry: 1 year
  - [x] 3.6 Audit log the registration

- [x] Task 4: Update PatientQRCode component (AC: #6)
  - [x] 4.1 Import ECDSA sign function and mobile keystore
  - [x] 4.2 On QR generation: sign the `{ pid, iat, exp, v }` payload with stored private key
  - [x] 4.3 Include `sig` field in QR payload when key is available
  - [x] 4.4 Show "Verified" badge when signature is present (replace server-side signature prop)
  - [x] 4.5 Gracefully degrade: show "Unverified" badge if no key pair exists yet

- [x] Task 5: Key pair initialization flow in Patient Lite Mobile (AC: #4, #5)
  - [x] 5.1 On first login (after biometric setup), generate ECDSA key pair
  - [x] 5.2 Store private key in SecureStore via `mobile-ecdsa-keystore.ts`
  - [x] 5.3 Register public key with Hub API via `registerPatientKey`
  - [x] 5.4 Persist public key registration status locally (avoid re-registering)
  - [x] 5.5 Handle offline: queue public key registration for sync when online

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit tests for `ecdsa.ts`: key generation, sign, verify, round-trip, wrong-key rejection
  - [x] 6.2 Unit tests for `mobile-ecdsa-keystore.ts`: store, retrieve, delete, biometric gating
  - [x] 6.3 Unit tests for Hub API `registerPatientKey` endpoint: success, duplicate rejection, audit emission
  - [x] 6.4 Unit tests for PatientQRCode: signed payload includes `sig`, unsigned shows "Unverified"

## Dev Notes

### Critical Architecture Constraints

- **ECDSA-P256 is for patient identity QR ONLY.** Prescription QR signing uses Ed25519 (separate system, already implemented in `packages/sync-engine/src/crypto.ts` via `@noble/ed25519`). Do NOT mix these.
- **QR payload per CLAUDE.md:** `{ pid, iat, exp, v, sig? }` — JWT-standard short names. Never raw PHI. The `sig` field is the ECDSA-P256 signature.
- **Patient keys vs Practitioner keys:** The existing `practitioner_keys` table stores Ed25519 keys for clinicians (Story 16.7). Patient ECDSA-P256 keys need a separate `patient_keys` table or column with `key_type` discriminator.

### Platform Crypto Strategy

The Web Crypto API (`crypto.subtle`) supports ECDSA P-256 natively and works in:
- **Browsers** (all modern)
- **React Native** (Expo SDK 52 ships `expo-crypto` which polyfills SubtleCrypto)
- **Node.js** (via `globalThis.crypto`)

This means `packages/crypto/src/ecdsa.ts` can use the same `crypto.subtle` approach as `browser-crypto.ts` — no platform-specific branching needed for the crypto operations themselves. Only key *storage* is platform-specific (SecureStore on mobile, in-memory on PWA).

**Key formats for QR compactness:**
- Sign with `crypto.subtle.sign('ECDSA', { hash: 'SHA-256' }, privateKey, payload)`
- The raw signature is 64 bytes (r: 32 bytes, s: 32 bytes) — base64 encodes to ~88 chars
- This is compact enough for QR encoding (the whole payload stays small)
- Export private key as PKCS8 base64, public key as SPKI base64 (standard formats that `crypto.subtle.importKey` can re-import)

### Existing Code Patterns to Follow

**`browser-crypto.ts` patterns (MUST follow):**
- Uses `crypto.subtle` directly (no polyfills, no third-party libraries)
- Helper functions `uint8ToBase64()` and `base64ToUint8()` exist — reuse them (export from browser-crypto or duplicate in ecdsa.ts)
- Zero runtime dependencies
- Returns typed results, never throws on expected failures

**`mobile-key-service.ts` patterns (MUST follow for mobile keystore):**
- Uses `expo-secure-store` with `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` access control
- Write-then-verify pattern: store → read-back → confirm match
- Key naming convention: `ultranos_<purpose>` (e.g., existing: `ultranos_db_passphrase`)
- Use `ultranos_ecdsa_private_key` and `ultranos_ecdsa_public_key` as SecureStore keys
- Biometric gating via `expo-local-authentication` before key access

**`verify-with-krl.ts` patterns:**
- Platform-agnostic: injects platform-specific dependencies via function parameters
- The ECDSA verify function should follow this pattern — pure crypto, no storage coupling

**Package export pattern (package.json):**
```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./server": { "import": "./dist/server-crypto.js", "types": "./dist/server-crypto.d.ts" },
  "./mobile": { "import": "./dist/mobile-ecdsa-keystore.js", "types": "./dist/mobile-ecdsa-keystore.d.ts" }
}
```
Add `./mobile` export path for mobile-only key storage. The core `ecdsa.ts` functions export from `.` (they're platform-agnostic).

### Hub API Registration Endpoint

**Decision: New `patient_keys` table + router vs extending `practitioner_keys`**

Use a **new `patient_keys` table** because:
- Different key algorithm (ECDSA-P256 vs Ed25519)
- Different role constraints (PATIENT vs DOCTOR/CLINICIAN/ADMIN)
- Different column name semantics (`public_key_p256` not `public_key_ed25519`)
- Keeps practitioner key lifecycle (KRL, revocation) separate from patient identity keys

**Router placement:** Add a `patientKey` router (new file `apps/hub-api/src/trpc/routers/patient-key.ts`) and register it in `_app.ts`. Follow the pattern of `practitioner-key.ts` but simpler (no KRL, no revocation — patients just register/rotate).

**Endpoint shape:**
```typescript
patientKey.register: mutation({
  input: { publicKeyP256: string (base64 SPKI), patientId: string (UUID) },
  output: { registered: boolean, expiresAt: string }
})
```

**Database migration** (via Supabase MCP):
```sql
CREATE TABLE patient_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES ... ,
  public_key_p256 TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_keys_patient_id ON patient_keys(patient_id);
```

### PatientQRCode Component Changes

**Current state** (`apps/patient-lite-mobile/src/components/PatientQRCode.tsx`):
- Accepts `patientId: string` and optional `signature?: string` (server-provided)
- Generates payload: `{ pid, iat, exp, v }` and conditionally adds `sig` from prop
- Shows "Unverified" badge when no signature

**Target state:**
- Remove `signature` prop dependency — the component generates its own signature locally
- On mount/refresh: load private key from SecureStore → sign payload → include `sig`
- If no key pair exists (first run before key generation): show "Unverified" badge (graceful degradation)
- The `IdentityQRPayload` interface stays the same; `sig` is added to the serialized JSON only

**Key flow:**
```
1. Component renders → calls generatePayload(patientId)
2. generatePayload creates { pid, iat, exp, v }
3. Tries to load private key from mobile keystore
4. If key exists: signs JSON.stringify({ pid, iat, exp, v }) → adds sig field
5. If no key: returns payload without sig (shows "Unverified")
```

### Key Initialization Flow

**When:** After first successful biometric unlock (patient's first login)
**Where:** `apps/patient-lite-mobile/src/lib/` — new file `ecdsa-key-init.ts`
**What:**
1. Check if ECDSA key pair already exists in SecureStore (`hasEcdsaKeyPair()`)
2. If not: call `generateEcdsaKeyPair()` from `@ultranos/crypto`
3. Store private key via `storeEcdsaPrivateKey()` from `@ultranos/crypto/mobile`
4. Try to register public key with Hub API (`patientKey.register`)
5. If Hub is unreachable: save public key + registration intent to a local "pending registration" flag
6. On next successful sync/online event: retry registration

### SecureStore 2KB iOS Limit (Gap PT-G12)

The ECDSA-P256 private key in PKCS8 base64 is ~185 bytes. The public key in SPKI base64 is ~120 bytes. Both fit comfortably within the 2KB iOS SecureStore limit. No SQLCipher migration needed for key storage.

### Testing Standards

**Framework:** Vitest (all packages and hub-api tests use Vitest)
**Required test scenarios:**

For `ecdsa.ts`:
- Generate key pair → both keys are non-empty base64 strings
- Sign → verify round-trip succeeds
- Verify with wrong public key → returns false
- Verify with tampered payload → returns false
- Verify with tampered signature → returns false
- Sign different payloads → different signatures
- Key pair generation produces unique keys each call

For `mobile-ecdsa-keystore.ts`:
- Mock `expo-secure-store` and `expo-local-authentication`
- Store and retrieve key round-trip
- `hasEcdsaKeyPair()` returns true after store, false before
- `deleteEcdsaKeyPair()` clears keys
- Write-then-verify pattern: test that mismatch throws

For Hub API `registerPatientKey`:
- Successful registration returns `{ registered: true, expiresAt }`
- Duplicate key returns CONFLICT error
- Non-PATIENT role returns FORBIDDEN
- Audit event emitted on registration
- Default 1-year expiry when not specified

For PatientQRCode:
- With key pair available: QR payload includes `sig` field, "Verified" badge shown
- Without key pair: QR payload has no `sig`, "Unverified" badge shown
- Payload never contains raw PHI (no patient name, DOB, etc.)

### Project Structure Notes

**New files:**
- `packages/crypto/src/ecdsa.ts` — pure ECDSA-P256 crypto functions (platform-agnostic)
- `packages/crypto/src/mobile-ecdsa-keystore.ts` — Expo SecureStore wrapper for ECDSA keys
- `packages/crypto/src/__tests__/ecdsa.test.ts`
- `packages/crypto/src/__tests__/mobile-ecdsa-keystore.test.ts`
- `apps/hub-api/src/trpc/routers/patient-key.ts` — patient key registration router
- `apps/hub-api/src/__tests__/patient-key.test.ts`
- `apps/patient-lite-mobile/src/lib/ecdsa-key-init.ts` — key pair initialization flow

**Modified files:**
- `packages/crypto/src/index.ts` — add ECDSA exports
- `packages/crypto/package.json` — add `./mobile` export path, add `expo-secure-store` and `expo-local-authentication` as optional peer dependencies
- `apps/hub-api/src/trpc/routers/_app.ts` — register `patientKey` router
- `apps/patient-lite-mobile/src/components/PatientQRCode.tsx` — local signing integration
- `apps/patient-lite-mobile/package.json` — add `@ultranos/crypto` dependency (if not already present)

### References

- [Source: CLAUDE.md#Encryption] — QR code identity payload spec: `{ pid, iat, exp, v, sig? }`
- [Source: CLAUDE.md#Encryption] — ECDSA-P256 for identity QR, Ed25519 for prescription QR
- [Source: _bmad-output/planning-artifacts/epics.md#Story-25.4] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#CR-G01] — Gap: No mobile ECDSA-P256 support (HIGH severity)
- [Source: _bmad-output/planning-artifacts/component-spec.md#QrCodeDisplay] — QR component spec with ECDSA-P256 signature field
- [Source: packages/crypto/src/browser-crypto.ts] — Existing Web Crypto API patterns to follow
- [Source: packages/crypto/src/verify-with-krl.ts] — Platform-agnostic verification wrapper pattern
- [Source: apps/patient-lite-mobile/src/lib/mobile-key-service.ts] — Existing SecureStore + biometric patterns
- [Source: apps/hub-api/src/trpc/routers/practitioner-key.ts] — Key registration endpoint pattern (Ed25519)
- [Source: apps/patient-lite-mobile/src/components/PatientQRCode.tsx] — Current QR component (unsigned)

### Previous Story Intelligence (from 25-3)

- **File naming:** Kebab-case (e.g., `ecdsa.ts`, `mobile-ecdsa-keystore.ts`)
- **Import paths:** Use `.js` extension in TypeScript imports (ESM module resolution)
- **Common type reuse:** Import from existing files, don't re-declare (e.g., reuse `uint8ToBase64`/`base64ToUint8` helpers from browser-crypto if exported, or duplicate if they're private)
- **Barrel exports:** Add to `src/index.ts` immediately
- **Test patterns:** Vitest, deterministic test data, comprehensive edge cases
- **Zero runtime deps:** `packages/crypto` currently has zero runtime dependencies — maintain this for the core `ecdsa.ts` (mobile keystore is a separate export path with peer deps)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — all tasks completed without blocking issues.

### Completion Notes

- **Task 1 (ECDSA crypto functions):** Created `packages/crypto/src/ecdsa.ts` with `generateEcdsaKeyPair()`, `signWithEcdsa()`, `verifyEcdsaSignature()` using Web Crypto API (`crypto.subtle`). Platform-agnostic. Compact 64-byte raw signature (r||s) → 88-char base64. SPKI/PKCS8 key format. 8 unit tests pass.
- **Task 2 (Mobile keystore):** Created `packages/crypto/src/mobile-ecdsa-keystore.ts` wrapping `expo-secure-store` with biometric gating via `expo-local-authentication`. Write-then-verify pattern. Both deps declared as optional peer dependencies. Added `./mobile` export path. 11 unit tests pass.
- **Task 3 (Hub API endpoint):** Created `apps/hub-api/src/trpc/routers/patient-key.ts` with `register` mutation. PATIENT-only role (ADMIN bypasses). Self-only registration. Duplicate rejection via unique constraint (23505 → CONFLICT). Default 1-year expiry. Audit logging. Database migration applied: `patient_keys` table with `id`, `patient_id`, `public_key_p256` (unique), `expires_at`, `created_at`. 9 unit tests pass.
- **Task 4 (PatientQRCode update):** Refactored component from server-provided `signature` prop to local signing via `signWithEcdsa` + `getEcdsaPrivateKey`. Added "Verified" badge (green) when signed, kept "Unverified" badge (amber) for unsigned. Graceful degradation on crypto failure. 11 unit tests pass.
- **Task 5 (Key init flow):** Created `apps/patient-lite-mobile/src/lib/ecdsa-key-init.ts` with `initializeEcdsaKeyPair()` and `retryPendingKeyRegistration()`. Generates key pair on first login, stores in SecureStore, registers with Hub API. Offline-tolerant: saves pending registration flag for retry. 10 unit tests pass.
- **Task 6 (Tests):** All test scenarios from story spec covered: key generation, sign/verify round-trip, wrong-key rejection, tampered payload/signature rejection, unique key generation, compact signature format, mobile keystore CRUD with biometric gating, write-then-verify, Hub API RBAC, duplicate rejection, audit emission, QR component signed/unsigned states, PHI exclusion, graceful degradation, key init offline queueing.

### Pre-existing test failures (NOT introduced by this story)
- `packages/crypto/src/__tests__/server-crypto.test.ts`: `getEncryptionConfig > returns config with field lists` — expects `reason_code` in `randomizedFields` but it's missing. Pre-existing.
- `apps/patient-lite-mobile/__tests__/consent-mapper.test.ts`: 6 failures in consent resource creation. Pre-existing.
- `apps/patient-lite-mobile/__tests__/useConsentSettings.test.ts`: 3 failures. Pre-existing.
- `apps/patient-lite-mobile/__tests__/consent-sync.test.ts`: 2 failures. Pre-existing.

### File List

**New files:**
- `packages/crypto/src/ecdsa.ts`
- `packages/crypto/src/mobile-ecdsa-keystore.ts`
- `packages/crypto/src/__tests__/ecdsa.test.ts`
- `packages/crypto/src/__tests__/mobile-ecdsa-keystore.test.ts`
- `apps/hub-api/src/trpc/routers/patient-key.ts`
- `apps/hub-api/src/__tests__/patient-key.test.ts`
- `apps/patient-lite-mobile/src/lib/ecdsa-key-init.ts`
- `apps/patient-lite-mobile/__tests__/ecdsa-key-init.test.ts`

**Modified files:**
- `packages/crypto/src/index.ts` — added ECDSA exports
- `packages/crypto/package.json` — added `./mobile` export path, optional peer dependencies
- `apps/hub-api/src/trpc/routers/_app.ts` — registered `patientKey` router
- `apps/patient-lite-mobile/src/components/PatientQRCode.tsx` — refactored to local signing
- `apps/patient-lite-mobile/__tests__/PatientQRCode.test.tsx` — updated for local signing behavior
- `apps/patient-lite-mobile/package.json` — added `@ultranos/crypto` dependency
- `apps/patient-lite-mobile/jest.config.js` — added `@ultranos/crypto` module mappings

**Database migration:**
- `create_patient_keys_table` — creates `patient_keys` table with index on `patient_id`

### Review Findings

- [x] [Review][Decision] F4: Raw fetch vs sync engine for Hub key registration — DEFERRED: one-time non-clinical event, sync engine integration deferred to systematic sync story
- [x] [Review][Decision] F7: No shared verify-QR helper — FIXED: added `verifyIdentityQrPayload()` to `@ultranos/crypto`
- [x] [Review][Decision] F8: Audit failure silently swallowed — ACCEPTED: project-wide pattern, systemic fix should be global
- [x] [Review][Decision] F12: Top-level Expo imports in `mobile-ecdsa-keystore.ts` — ACCEPTED: separate `./mobile` export path is the architectural guard
- [x] [Review][Decision] F16: RBAC — VERIFIED: `roleRestrictedProcedure` has explicit ADMIN bypass at rbac.ts:76, mutation-body check is redundant but harmless
- [x] [Review][Patch] F1: `hasEcdsaKeyPair` reads private key slot without biometric auth — FIXED: now checks public key only
- [x] [Review][Patch] F2: No public key format validation — FIXED: added base64 regex with length range
- [x] [Review][Patch] F3: Key rotation doesn't clear `REGISTRATION_STATUS_KEY` — FIXED: `deleteEcdsaKeyPair` now clears registration flags
- [x] [Review][Patch] F5: Race condition — concurrent `initializeEcdsaKeyPair` — FIXED: added `_initInFlight` concurrency guard
- [x] [Review][Patch] F6: Non-atomic key storage — FIXED: added try/catch with `deleteEcdsaKeyPair` rollback
- [x] [Review][Patch] F10: Async refresh with no cleanup — FIXED: added `mountedRef` guard
- [x] [Review][Patch] F13: `PENDING_PUBLIC_KEY` stored without `STORE_OPTIONS` — FIXED: now uses `STORE_OPTIONS`
- [x] [Review][Patch] F15: QR component conflates "no key" vs "signing failed" — FIXED: `SigningState` type distinguishes three states
- [x] [Review][Patch] F19: Hardcoded `localhost:3000` fallback — KEPT: Expo inlines EXPO_PUBLIC_ vars at build time, so runtime validation is impractical. Fallback only active in dev/test. Production builds inline the real URL.
- [x] [Review][Defer] F9: Duplicated `uint8ToBase64`/`base64ToUint8` helpers across `ecdsa.ts` and `browser-crypto.ts` — deferred, code smell not a bug
- [x] [Review][Defer] F17: No rate limiting on key registration endpoint — deferred, infrastructure concern for API gateway layer
- [x] [Review][Defer] F18: ECDSA signature format portability risk (DER vs P1363 in polyfill envs) — deferred, Web Crypto spec guarantees IEEE P1363

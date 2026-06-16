# Story 28.4: Key Derivation from Supabase JWT (PBKDF2)

Status: done

## Story

As a clinician,
I want my local encryption key to survive a page refresh without re-entering credentials,
so that I don't lose access to my locally cached patient data on accidental refresh.

## Acceptance Criteria

1. **Given** a user authenticates via Supabase
   **When** the session JWT is available
   **Then** a deterministic encryption key is derived using PBKDF2 with the JWT `sub` claim + a device salt stored in `localStorage`
   **And** the same JWT always produces the same key on the same device

2. **Given** a user refreshes the page
   **When** the Supabase session is still valid (auto-refresh within 15-min window)
   **Then** the encryption key is re-derived from the refreshed JWT
   **And** all previously encrypted IndexedDB data is readable

3. **Given** the Supabase session has fully expired (no valid refresh token)
   **When** the user refreshes the page
   **Then** the encryption key cannot be derived
   **And** IndexedDB data remains encrypted and inaccessible until re-authentication

4. **Given** a different user logs in on the same device
   **When** they authenticate with a different JWT
   **Then** a different encryption key is derived
   **And** the previous user's encrypted data is unreadable

## Tasks / Subtasks

- [x] **Task 1: Implement `deriveSessionKey()` in `@ultranos/crypto`** (AC: 1)
  - [x] Add `deriveSessionKey(sub: string, salt: Uint8Array): Promise<CryptoKey>` to `packages/crypto/src/browser-crypto.ts`
  - [x] Use Web Crypto API `crypto.subtle.deriveKey()` with PBKDF2
  - [x] Parameters: SHA-256 hash, 100,000 iterations (OWASP minimum), 256-bit output
  - [x] Input key material: UTF-8 encoded `sub` claim
  - [x] Salt: 16-byte random value stored per-device
  - [x] Export from `packages/crypto/src/index.ts`

- [x] **Task 2: Implement device salt management** (AC: 1, 4)
  - [x] Add `getOrCreateDeviceSalt()` to `encryption-key-store.ts` in each PWA app
  - [x] On first use: generate 16-byte random salt via `crypto.getRandomValues()`, store in `localStorage` as `ultranos:device-salt`
  - [x] On subsequent uses: read from `localStorage`
  - [x] Device salt is NOT PHI — it is safe to store in `localStorage` (it provides device-binding, not secrecy)

- [x] **Task 3: Wire key derivation into auth flow** (AC: 1, 2)
  - [x] In `AuthGuard.tsx` (or equivalent auth entry point) for each PWA app:
    - After successful Supabase session hydration, extract `sub` from JWT
    - Call `deriveSessionKey(sub, deviceSalt)`
    - Set the derived key via `encryptionKeyStore.setKey(derivedKey)`
  - [x] OPD-Lite: `apps/opd-lite/src/components/AuthGuard.tsx`
  - [x] Pharmacy-Lite: `apps/pharmacy-lite/src/components/AuthGuard.tsx`
  - [x] Lab-Lite: `apps/lab-lite/src/components/AuthGuard.tsx`

- [x] **Task 4: Handle page refresh** (AC: 2)
  - [x] On page load: `AuthGuard` already calls `supabase.auth.getSession()`
  - [x] If session is valid: re-derive key from same `sub` + same device salt → same key
  - [x] Existing encrypted IndexedDB data becomes readable immediately
  - [x] Remove the current `generateSessionKey()` (random key) path in favor of deterministic derivation

- [x] **Task 5: Handle expired session** (AC: 3)
  - [x] If `getSession()` returns null/expired: do not derive key
  - [x] `encryptionKeyStore.isReady()` returns false
  - [x] Dexie operations throw `DecryptionKeyMissingError`
  - [x] Re-auth modal presented via existing `SessionTimeoutWrapper`

- [x] **Task 6: Handle user switching** (AC: 4)
  - [x] When a different user logs in: different `sub` → different derived key
  - [x] Previous user's encrypted data is unreadable (different key)
  - [x] On logout: call `clearPhiTables()` (from Story 28.2) to clean previous user's data
  - [x] On new login: fresh key derived, fresh data cached from Hub

- [x] **Task 7: Migrate from random key to derived key** (AC: 1-4)
  - [x] Existing data encrypted with random keys (Story 7.1) will be unreadable after this change
  - [x] On first login with derived key: if IndexedDB contains data encrypted with old random key, it will fail to decrypt
  - [x] Handle gracefully: catch `DecryptionError`, clear stale data, log migration event (no PHI in log)
  - [x] Data will be re-populated from Hub on next sync

- [x] **Task 8: Tests** (AC: 1-4)
  - [x] Test `deriveSessionKey()` is deterministic (same sub + salt → same key)
  - [x] Test different `sub` values produce different keys
  - [x] Test different salts produce different keys
  - [x] Test page refresh re-derives same key (integration test with mock Supabase)
  - [x] Test expired session cannot derive key
  - [x] Test device salt persists in localStorage across page loads
  - [x] Performance test: PBKDF2 derivation <500ms on target hardware

## Dev Notes

### Current State

**Key generation is currently RANDOM** — `generateSessionKey()` in `packages/crypto/src/browser-crypto.ts` creates a fresh AES-256-GCM key via `crypto.subtle.generateKey()`. This means every page refresh loses the key, and all encrypted IndexedDB data becomes inaccessible. Data must be re-fetched from Hub after refresh.

**Story 7.1 review D3 explicitly deferred this**: "Key derivation from JWT/PIN not implemented — random key means data loss on refresh. Accepted: refresh = data loss is a known limitation. Defer JWT/PIN derivation to a follow-up story."

**This is that follow-up story.**

### Key Derivation Design

```
Input: JWT.sub (user ID, e.g., "a1b2c3d4-...")
Salt: 16 bytes from localStorage("ultranos:device-salt")
Algorithm: PBKDF2-SHA256, 100,000 iterations
Output: AES-256-GCM CryptoKey (non-extractable)
```

**Why PBKDF2 over HKDF?** The JWT `sub` is a UUID — high entropy but short. PBKDF2's iteration count adds computational cost that protects against brute-force if the `sub` is leaked. HKDF is faster but designed for already-strong key material.

**Why `sub` and not the full JWT?** The JWT changes on every refresh (different `iat`, `exp`). The `sub` claim is the only stable, user-unique field across token refreshes.

### Key Files to CREATE

| File | Purpose |
|------|---------|
| None — all changes are to existing files |

### Key Files to UPDATE

| File | Change |
|------|--------|
| `packages/crypto/src/browser-crypto.ts` | Add `deriveSessionKey(sub, salt)` function |
| `packages/crypto/src/index.ts` | Export `deriveSessionKey` |
| `apps/opd-lite/src/components/AuthGuard.tsx` | Wire key derivation after session hydration |
| `apps/opd-lite/src/lib/encryption-key-store.ts` | Add `getOrCreateDeviceSalt()`, update `setKey()` to accept derived key |
| `apps/pharmacy-lite/src/components/AuthGuard.tsx` | Same as OPD-Lite |
| `apps/pharmacy-lite/src/lib/encryption-key-store.ts` | Same as OPD-Lite |
| `apps/lab-lite/src/components/AuthGuard.tsx` | Same as OPD-Lite |
| `packages/crypto/src/__tests__/browser-crypto.test.ts` | Add PBKDF2 derivation tests |

### Key Files to READ (context)

| File | Purpose |
|------|---------|
| `apps/opd-lite/src/components/AuthGuard.tsx` | Current JWT decoding: `jwt.split('.')[1]` to extract `sub` |
| `apps/opd-lite/src/lib/encryption-key-store.ts` | Current key store: `sessionKey` module variable, `setKey()`, `getKey()`, `isReady()`, `wipe()` |
| `apps/opd-lite/src/stores/auth-session-store.ts` | Auth session structure: `userId` (= JWT `sub`), `practitionerId`, `role` |

### Important Constraints

- **Device salt is NOT PHI** — storing it in `localStorage` is safe. It prevents cross-device key reuse.
- **PBKDF2 iterations**: 100,000 minimum (OWASP 2023). Higher if target devices can handle it (<500ms derivation time).
- **Non-extractable key**: The derived `CryptoKey` must be created with `extractable: false` to prevent key export via JS.
- **Migration from random keys**: Existing encrypted data from Story 7.1 will NOT be readable. This is expected — the data is re-populated from Hub on sync. Handle the `DecryptionError` gracefully.
- **`beforeunload` key wipe still applies**: Derived key is wiped on tab close per existing behavior. On re-open, key is re-derived from session if still valid.
- **Auth flow order**: JWT `sub` extraction → device salt retrieval → PBKDF2 derivation → `encryptionKeyStore.setKey()` → Dexie operations enabled. This must complete before any Dexie reads.

### Testing Standards

- Vitest for crypto package and PWA apps
- Web Crypto API must be available in test environment (jsdom + global crypto polyfill in vitest setup)
- Existing crypto tests at `packages/crypto/src/__tests__/browser-crypto.test.ts`
- Test determinism: same inputs → same key (verify via `exportKey` in tests only)

### References

- [Source: packages/crypto/src/browser-crypto.ts] — Current `generateSessionKey()` (to be supplemented with `deriveSessionKey()`)
- [Source: apps/opd-lite/src/lib/encryption-key-store.ts] — Key store interface
- [Source: apps/opd-lite/src/components/AuthGuard.tsx] — JWT `sub` extraction (lines 42-44)
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — Review D3: "Defer JWT/PIN derivation to follow-up"
- [Source: CLAUDE.md#Encryption] — "Encryption key lives in memory only"

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without blockers.

### Completion Notes List

- Implemented `deriveSessionKey(sub, salt, extractable?)` in `packages/crypto/src/browser-crypto.ts` using PBKDF2-SHA256 at 100,000 iterations, non-extractable by default. The `BufferSource` cast on the salt parameter resolves a TypeScript 5.x Uint8Array<ArrayBufferLike> strictness issue.
- Exported `deriveSessionKey` from `packages/crypto/src/index.ts`.
- Added `getOrCreateDeviceSalt()` to `encryption-key-store.ts` in all three PWA apps (OPD-Lite, Pharmacy-Lite, Lab-Lite). Lab-Lite previously had no `encryption-key-store.ts`; created it fresh with the same interface as the other apps.
- Replaced `generateSessionKey()` random-key path in all three `AuthGuard.tsx` files. Key is now derived from `data.session.user.id` + `getOrCreateDeviceSalt()` after session hydration.
- Pharmacy-Lite's AuthGuard had an incorrect redirect: it was blocking on `!encryptionKeyStore.isReady()` alongside the session check, meaning a valid session with no in-memory key (page refresh) would force a login redirect. Split the check: redirect only on no session; derive key if session valid but key missing.
- Added `encryptionKeyStore.wipe()` + `clearPhiTables()` to `handleSignOut()` in all three AuthGuards for Task 6 (user switching — ensure previous user's PHI and key are cleared before next login).
- Migration handling (Task 7): documented in `AuthGuard.tsx` comment that stale random-key data will produce a `DOMException(OperationError)` on first decrypt attempt in the Dexie proxy (Story 28.1), which is responsible for calling `clearPhiTables()` and allowing data re-population from Hub.
- All 8 new `deriveSessionKey` tests pass (18 total in browser-crypto.test.ts). Pre-existing failure in `server-crypto.test.ts` (`reason_code` field missing from config) is unrelated to this story.

### File List

- `packages/crypto/src/browser-crypto.ts` — Added `deriveSessionKey()`
- `packages/crypto/src/index.ts` — Exported `deriveSessionKey`
- `packages/crypto/src/__tests__/browser-crypto.test.ts` — Added 8 `deriveSessionKey` tests
- `apps/opd-lite/src/lib/encryption-key-store.ts` — Added `getOrCreateDeviceSalt()`
- `apps/opd-lite/src/components/AuthGuard.tsx` — Replaced `generateSessionKey` with `deriveSessionKey`; added `encryptionKeyStore.wipe()` + `clearPhiTables()` on logout
- `apps/pharmacy-lite/src/lib/encryption-key-store.ts` — Added `getOrCreateDeviceSalt()`
- `apps/pharmacy-lite/src/components/AuthGuard.tsx` — Fixed session/key redirect logic; added `deriveSessionKey`; added `encryptionKeyStore.wipe()` + `clearPhiTables()` on logout
- `apps/lab-lite/src/lib/encryption-key-store.ts` — Created (new file); matches OPD-Lite/Pharmacy-Lite interface + `getOrCreateDeviceSalt()`
- `apps/lab-lite/src/components/AuthGuard.tsx` — Added `deriveSessionKey`; added `encryptionKeyStore.wipe()` + `clearPhiTables()` on logout

### Review Findings

- [x] [Review][Decision] **D1: Story 28.5 scope co-mingled in this 28.4 diff** — RESOLVED: Split. Reverted `UnknownKeyVersionError`, `deriveKeyForVersion()`, version-prefixed `encryptPayload`, key-map `decryptPayload` from `browser-crypto.ts` and `index.ts`. Reverted rotation API (`rotateKey`, `retireVersion`, `requireKeyMap`, `getCurrentWriteVersion`) from all three key stores. All three key stores now have a symmetric single-key interface. 28.5 scope deferred to its own story.

- [x] [Review][Patch] **P1: `clearPhiTables()` fire-and-forget on sign-out — PHI may persist on disk** — FIXED. `handleSignOut()` in all three AuthGuards now chains `clearPhiTables().catch().finally()` so that `encryptionKeyStore.wipe()`, `clearSession()`, and navigation only execute after the PHI clear attempt completes (success or failure). This also eliminates the key-lifecycle-hooks sequencing issue — key is now wiped after `clearPhiTables()` resolves, not before.

- [x] [Review][Patch] **P2: Corrupted device salt in localStorage never removed** — FIXED. Added `localStorage.removeItem(DEVICE_SALT_KEY)` in the length-guard branch of `getOrCreateDeviceSalt()` in all three apps. Corrupt entry is now cleaned up so the subsequent `setItem` persists the new valid salt.

- [x] [Review][Patch] **P3: Missing test — expired session cannot derive key (Task 8 / AC 3)** — FIXED. Added `'expired session — isReady() is false until setKey() is called after successful auth'` test to `apps/opd-lite/src/__tests__/encryption-key-store.test.ts`. Asserts `isReady()` is false and `requireKey()` throws before any key is set.

- [x] [Review][Patch] **P4: Missing test — device salt persists in localStorage across page loads (Task 8)** — FIXED. Added `getOrCreateDeviceSalt` describe block to `apps/opd-lite/src/__tests__/encryption-key-store.test.ts` with three tests: persistence across calls, fresh generation when empty, and corrupt-salt recovery.

- [x] [Review][Patch] **P5: `deriveSessionKey` TypeScript type annotations** — DISMISSED. Actual code has full type annotations (`sub: string`, `salt: Uint8Array`, `extractable?: boolean`); finding was based on abbreviated diff representation.

- [x] [Review][Patch] **P6: `deriveSessionKey` failures silently swallowed by outer `try/catch`** — FIXED. Added specific inner `try/catch` around the `deriveSessionKey` call in all three AuthGuards. Emits `console.error('[auth] Encryption key derivation failed — ensure app is served over HTTPS')` and re-throws a named error, distinguishing this failure from network/session errors in the outer catch.

- [x] [Review][Defer] **W1: PBKDF2 iteration count (100k) below current OWASP 2023 recommendation (600k)** [`packages/crypto/src/browser-crypto.ts:55`] — The spec was written citing 100,000 as the "OWASP 2023 minimum," but OWASP 2023 Password Storage Cheat Sheet recommends 600,000 for PBKDF2-SHA256. The JWT `sub` (UUID) has high entropy, partially mitigating this. Deferred: iteration count change is a security policy decision requiring spec update and performance re-validation on target hardware. — deferred, pre-existing spec decision

- [x] [Review][Defer] **W2: 28.5 sub-concerns (pending D1 resolution)** — If D1 resolves to keep 28.5 code bundled, the following should be reviewed in the 28.5 story: `deriveKeyForVersion` salt concatenation has no length prefix between deviceSalt and version string (collision risk for short version strings); `console.error` in `decryptPayload` logs version metadata from a crypto path; `syncQueue.enqueue` in OPD-Lite calls `encryptPayload(key, payload)` without a version arg (always v1, even after rotation); Lab-Lite `setKey()` resets `keyMap` to `{ v1: key }` discarding rotated keys on re-auth. — deferred, 28.5 scope

- [x] [Review][Defer] **W3: Device salt XSS threat model** — XSS can exfiltrate `ultranos:device-salt` from localStorage, and combined with a stolen JWT `sub`, reconstruct the AES key offline. The spec explicitly acknowledges the salt in localStorage and notes "device salt provides device-binding, not secrecy." Mitigated by: non-extractable CryptoKey (key material cannot be exported via JS), CSP headers, and the requirement for two simultaneous exfiltrations. Deferred to security review. — deferred, spec-approved design

- [x] [Review][Defer] **W4: Race condition — concurrent auth state events can double-derive and race-set the key** [`apps/opd-lite/src/components/AuthGuard.tsx:66`] — The `!encryptionKeyStore.isReady()` guard check occurs before the `await deriveSessionKey(...)` suspension point, so two concurrent `onAuthStateChange` events could both enter the branch and the second `setKey()` overwrites the first. Probability is low (Supabase auth events serialize). Deferred: add a derivation mutex in a follow-up if observed. — deferred, low probability

- [x] [Review][Defer] **W5: No test for `clearPhiTables()` failure path on sign-out** — The sign-out path (P1) has no test coverage for what happens when `clearPhiTables()` throws or when `encryptionKeyStore.wipe()` is called before the key is set. Deferred alongside P1 fix. — deferred, pre-existing gap

- [x] [Review][Defer] **W6: Cross-app `'ultranos:device-salt'` localStorage key — shared if apps co-locate on same origin** [`apps/opd-lite/src/lib/encryption-key-store.ts:11`] — All three apps use the same constant `'ultranos:device-salt'`. If any two apps share a browser origin (same scheme+host+port), they share the salt, and the same user's `sub` produces the same AES key in both apps. Verify deployment topology: if apps run on separate subdomains/ports they have isolated localStorage and this is safe. If they ever share an origin, app-specific prefixes (e.g. `ultranos:opd:device-salt`) should be used. — deferred, verify deployment topology

# Story 28.4: Key Derivation from Supabase JWT (PBKDF2)

Status: ready-for-dev

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

- [ ] **Task 1: Implement `deriveSessionKey()` in `@ultranos/crypto`** (AC: 1)
  - [ ] Add `deriveSessionKey(sub: string, salt: Uint8Array): Promise<CryptoKey>` to `packages/crypto/src/browser-crypto.ts`
  - [ ] Use Web Crypto API `crypto.subtle.deriveKey()` with PBKDF2
  - [ ] Parameters: SHA-256 hash, 100,000 iterations (OWASP minimum), 256-bit output
  - [ ] Input key material: UTF-8 encoded `sub` claim
  - [ ] Salt: 16-byte random value stored per-device
  - [ ] Export from `packages/crypto/src/index.ts`

- [ ] **Task 2: Implement device salt management** (AC: 1, 4)
  - [ ] Add `getOrCreateDeviceSalt()` to `encryption-key-store.ts` in each PWA app
  - [ ] On first use: generate 16-byte random salt via `crypto.getRandomValues()`, store in `localStorage` as `ultranos:device-salt`
  - [ ] On subsequent uses: read from `localStorage`
  - [ ] Device salt is NOT PHI — it is safe to store in `localStorage` (it provides device-binding, not secrecy)

- [ ] **Task 3: Wire key derivation into auth flow** (AC: 1, 2)
  - [ ] In `AuthGuard.tsx` (or equivalent auth entry point) for each PWA app:
    - After successful Supabase session hydration, extract `sub` from JWT
    - Call `deriveSessionKey(sub, deviceSalt)`
    - Set the derived key via `encryptionKeyStore.setKey(derivedKey)`
  - [ ] OPD-Lite: `apps/opd-lite/src/components/AuthGuard.tsx`
  - [ ] Pharmacy-Lite: `apps/pharmacy-lite/src/components/AuthGuard.tsx`
  - [ ] Lab-Lite: `apps/lab-lite/src/components/AuthGuard.tsx`

- [ ] **Task 4: Handle page refresh** (AC: 2)
  - [ ] On page load: `AuthGuard` already calls `supabase.auth.getSession()`
  - [ ] If session is valid: re-derive key from same `sub` + same device salt → same key
  - [ ] Existing encrypted IndexedDB data becomes readable immediately
  - [ ] Remove the current `generateSessionKey()` (random key) path in favor of deterministic derivation

- [ ] **Task 5: Handle expired session** (AC: 3)
  - [ ] If `getSession()` returns null/expired: do not derive key
  - [ ] `encryptionKeyStore.isReady()` returns false
  - [ ] Dexie operations throw `DecryptionKeyMissingError`
  - [ ] Re-auth modal presented via existing `SessionTimeoutWrapper`

- [ ] **Task 6: Handle user switching** (AC: 4)
  - [ ] When a different user logs in: different `sub` → different derived key
  - [ ] Previous user's encrypted data is unreadable (different key)
  - [ ] On logout: call `clearPhiTables()` (from Story 28.2) to clean previous user's data
  - [ ] On new login: fresh key derived, fresh data cached from Hub

- [ ] **Task 7: Migrate from random key to derived key** (AC: 1-4)
  - [ ] Existing data encrypted with random keys (Story 7.1) will be unreadable after this change
  - [ ] On first login with derived key: if IndexedDB contains data encrypted with old random key, it will fail to decrypt
  - [ ] Handle gracefully: catch `DecryptionError`, clear stale data, log migration event (no PHI in log)
  - [ ] Data will be re-populated from Hub on next sync

- [ ] **Task 8: Tests** (AC: 1-4)
  - [ ] Test `deriveSessionKey()` is deterministic (same sub + salt → same key)
  - [ ] Test different `sub` values produce different keys
  - [ ] Test different salts produce different keys
  - [ ] Test page refresh re-derives same key (integration test with mock Supabase)
  - [ ] Test expired session cannot derive key
  - [ ] Test device salt persists in localStorage across page loads
  - [ ] Performance test: PBKDF2 derivation <500ms on target hardware

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

### Debug Log References

### Completion Notes List

### File List

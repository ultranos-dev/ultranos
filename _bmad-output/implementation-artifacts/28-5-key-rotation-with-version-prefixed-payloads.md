# Story 28.5: Key Rotation with Version-Prefixed Payloads

Status: ready-for-dev

## Story

As a system administrator,
I want encryption keys to be rotatable without making existing data permanently unreadable,
so that key compromise events can be remediated.

## Acceptance Criteria

1. **Given** encrypted payloads already contain a `v1:` version prefix
   **When** a key rotation is triggered (new key version `v2`)
   **Then** new writes use `v2:` prefix with the new key
   **And** reads detect the version prefix and select the correct key for decryption

2. **Given** a rotation has occurred and both `v1` and `v2` keys exist
   **When** a background re-encryption job runs
   **Then** all `v1:`-prefixed records are decrypted with the old key and re-encrypted with the new key
   **And** the `v1` key can be retired after all records are migrated

3. **Given** a record with an unknown version prefix (e.g., `v3:`) is encountered
   **When** decryption is attempted
   **Then** a `UnknownKeyVersionError` is thrown with the version prefix in the error
   **And** the error is logged (without PHI) for operational alerting

## Tasks / Subtasks

- [ ] **Task 1: Add version prefix to browser-side encryption** (AC: 1, 3)
  - [ ] Modify `encryptPayload()` in `packages/crypto/src/browser-crypto.ts` to prepend `v1:` to encrypted output
  - [ ] Modify `decryptPayload()` to parse version prefix before decrypting
  - [ ] Support version-aware key selection: accept `keyMap: Record<string, CryptoKey>` instead of single key
  - [ ] Default `v1` key = current session key for backward compatibility
  - [ ] Throw `UnknownKeyVersionError` for unrecognized version prefixes
  - [ ] Handle legacy payloads without version prefix (pre-rotation data): treat as `v1`

- [ ] **Task 2: Update Dexie encryption middleware** (AC: 1)
  - [ ] Update `dexie-encryption-middleware.ts` in OPD-Lite to pass version-aware key map
  - [ ] Current write key = latest version (e.g., `v1` initially, `v2` after rotation)
  - [ ] Reads: parse prefix, select correct key from map

- [ ] **Task 3: Update sync queue encryption** (AC: 1)
  - [ ] Update `encryptFn`/`decryptFn` callbacks (from Story 28.3) to use versioned encryption
  - [ ] Drain worker: decrypt with version-aware key selection

- [ ] **Task 4: Implement key rotation trigger** (AC: 2)
  - [ ] Add `rotateKey(newVersion: string)` to `encryption-key-store.ts`
  - [ ] New key derived via same PBKDF2 process (Story 28.4) with version-specific salt modifier: `PBKDF2(sub, salt + version)`
  - [ ] Store both old and new keys in memory during transition period
  - [ ] Set `currentWriteVersion` to new version

- [ ] **Task 5: Background re-encryption job** (AC: 2)
  - [ ] Implement `reEncryptAllRecords(fromVersion, toVersion)` utility
  - [ ] Iterate all PHI tables: read with old key, write with new key
  - [ ] Process in batches (100 records) to avoid blocking UI
  - [ ] Track progress in non-PHI metadata table
  - [ ] On completion: old key can be removed from key map

- [ ] **Task 6: Error handling for unknown versions** (AC: 3)
  - [ ] Create `UnknownKeyVersionError` in `packages/crypto/src/browser-crypto.ts`
  - [ ] Log error with version prefix and table name (no record content/PHI)
  - [ ] Surface error in UI as "Data requires newer app version" message

- [ ] **Task 7: Tests** (AC: 1-3)
  - [ ] Test v1-prefixed encrypt/decrypt round-trip
  - [ ] Test multi-version key map: v1 reads with v1 key, v2 reads with v2 key
  - [ ] Test legacy (no prefix) payloads treated as v1
  - [ ] Test `UnknownKeyVersionError` for unrecognized prefix
  - [ ] Test re-encryption job converts all v1 records to v2
  - [ ] Test concurrent read/write during re-encryption (no data corruption)

## Dev Notes

### Current State

**Server-side already has version prefixes**: `packages/crypto/src/server-crypto.ts` uses `v1:base64(iv+authTag+ciphertext)` format. Browser-side (`browser-crypto.ts`) does NOT have version prefixes — encrypted output is raw base64.

**The Dexie encryption middleware** in OPD-Lite stores encrypted data in an `_enc` field as a base64 string without version prefix. All existing encrypted data is implicitly "v1" but has no prefix marker.

### Architecture Decision: Version Prefix Format

Follow the server-side pattern for consistency:
```
v1:base64(iv + ciphertext)    ← current format (add prefix)
v2:base64(iv + ciphertext)    ← after rotation
```

**Backward compatibility**: Payloads without a `v<N>:` prefix are treated as `v1` (legacy pre-rotation data).

### Key Derivation for Rotated Keys

Building on Story 28.4's PBKDF2 derivation:
```
v1 key: PBKDF2(sub, deviceSalt)              ← existing (Story 28.4)
v2 key: PBKDF2(sub, deviceSalt + "v2")       ← rotated
```

Appending the version string to the salt ensures different keys per version while remaining deterministic.

### Key Files to UPDATE

| File | Change |
|------|--------|
| `packages/crypto/src/browser-crypto.ts` | Add version prefix to encrypt/decrypt, add key map support, add `UnknownKeyVersionError` |
| `packages/crypto/src/index.ts` | Export new types/errors |
| `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` | Pass key map instead of single key |
| `apps/opd-lite/src/lib/encryption-key-store.ts` | Add `rotateKey()`, key map storage, `currentWriteVersion` |
| `apps/pharmacy-lite/src/lib/dexie-encryption-middleware.ts` | Same as OPD-Lite |
| `apps/pharmacy-lite/src/lib/encryption-key-store.ts` | Same as OPD-Lite |

### Key Files to READ (context)

| File | Purpose |
|------|---------|
| `packages/crypto/src/server-crypto.ts` | Server-side `v1:` prefix pattern to align with |
| `packages/crypto/src/browser-crypto.ts` | Current unversioned encrypt/decrypt |
| `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` | How encryption is called from middleware |

### Important Constraints

- **Key rotation is a client-side operation** — the Hub API has its own server-side key rotation. This story is about local IndexedDB encryption keys only.
- **Re-encryption must be interruptible** — if the user closes the tab mid-re-encryption, the next session should resume from where it left off. Track progress in metadata table.
- **Rotation is a rare, manual event** — triggered by admin action or key compromise. Do NOT auto-rotate on every login.
- **Memory overhead**: During rotation, two keys are held in memory simultaneously. This is acceptable for short transition periods.
- **API signatures**: Changes to `encryptPayload()`/`decryptPayload()` function signatures affect Story 28.3 (sync queue) and Story 28.1 (Dexie middleware). Coordinate interface changes.

### Dependency Note

This story depends on Story 28.4 (key derivation) for the version-specific key derivation mechanism. The version prefix format and `UnknownKeyVersionError` can be implemented independently, but key rotation trigger requires deterministic derivation.

### Testing Standards

- Vitest for crypto package and PWA apps
- Test with Web Crypto API (jsdom + crypto polyfill)
- Existing crypto tests at `packages/crypto/src/__tests__/browser-crypto.test.ts`
- Re-encryption job tests should use realistic record counts (100+) to verify batching

### References

- [Source: packages/crypto/src/server-crypto.ts] — Server-side `v1:` version prefix pattern
- [Source: packages/crypto/src/browser-crypto.ts] — Current unversioned browser encryption
- [Source: apps/opd-lite/src/lib/dexie-encryption-middleware.ts] — Encryption middleware integration point
- [Source: apps/opd-lite/src/lib/encryption-key-store.ts] — Key store to extend with rotation
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — Review W3: TOCTOU concern during key operations

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

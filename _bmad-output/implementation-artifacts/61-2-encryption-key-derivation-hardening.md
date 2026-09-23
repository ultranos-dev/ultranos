# Story 61.2: Encryption Key-Derivation Hardening & Tamper Signaling

Status: ready-for-dev

## Story

As a security engineer,
I want the spoke session encryption key to require a genuine secret (not just on-disk-recoverable inputs), GCM tamper failures to be signaled rather than swallowed, and the identity-QR verifier wired (or its absence formally recorded),
so that "encryption at rest" and "tamper detection" are real properties, not nominal ones.

## Acceptance Criteria

1. **Given** the browser session key derivation, **when** a key is established at login, **then** it incorporates a server-issued, session-bound secret (key-wrapping secret returned at authentication, never persisted client-side) — an attacker with full disk access to the workstation can no longer re-derive the key from `sub` + localStorage salt.
2. **Given** existing encrypted local data on devices in the field, **when** the new scheme rolls out, **then** a migration re-wraps/re-encrypts on the first online login (old-scheme decrypt → new-scheme encrypt), with the offline-unlock story defined (see Dev Notes — offline re-login constraint) and no data loss.
3. **Given** `decryptField` encounters a GCM auth-tag failure or unknown version on the Hub, **then** it returns a discriminated result (or invokes an `onIntegrityFailure` hook) and the caller audit-logs the integrity failure (opaque IDs) — the silent `"[Encrypted Content]"` swallow is removed.
4. **Given** the identity (Health Passport) QR verifier, **then** either (a) the scanning feature that consumes `verifyIdentityQrPayload` is wired with signature AND `exp` enforcement, or (b) a formal gap record documents that identity-QR scanning is unbuilt, and the verifier gains the `exp` check now so it is safe when adopted. Canonical-JSON signing (sorted keys) fixes the key-order brittleness either way.
5. **Zero regression:** all three spokes unlock, read, and write their encrypted stores exactly as before post-migration; offline operation within a session is unchanged; prescription-QR verification (already correct) is untouched; all pre-existing crypto/app tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: KDF design + hub secret issuance** (AC: 1)
  - [ ] 1.1 Design doc in-code: hub issues a per-user wrapping secret at login (new endpoint or login response extension), held in memory only; session key = HKDF(server secret ‖ sub ‖ device salt). Present the offline-relogin tradeoff as a decision point (see Dev Notes) before implementation.
  - [ ] 1.2 Implement in `packages/crypto/src/browser-crypto.ts:21-58` (new versioned derivation alongside the old); wire opd-lite (`AuthGuard.tsx:76`, `login/page.tsx:99`), pharmacy-lite, lab-lite (per Story 58.3's adoption) key establishment.
- [ ] **Task 2: Field-data migration** (AC: 2) — per-app startup migration: detect old-scheme data, decrypt with legacy derivation, re-encrypt vNext; resumable; test with populated fixtures.
- [ ] **Task 3: Tamper signaling** (AC: 3) — `packages/crypto/src/server-crypto.ts:38-68`: discriminated result + audit hook; update hub read paths to log integrity failures; keep a safe display fallback for UI.
- [ ] **Task 4: Identity QR** (AC: 4) — add `exp` enforcement + canonical JSON to `packages/crypto/src/ecdsa.ts:96-112`; grep confirms zero production callers today [V] — disposition (wire vs formal gap) recorded; KRL-wrapped verify required when wired.
- [ ] **Task 5: Tests + regression verification** (AC: 5) — crypto package suite + per-app unlock/read/write integration; migration fixture test; tamper-injection test (bit-flipped ciphertext → signaled); `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **P-CRYPTO-2 / H-OPD-2** (KDF from non-secret inputs — PBKDF2(sub, localStorage salt); "memory-only in letter but not in spirit"), **P-CRYPTO-4** (decryptField swallow defeats GCM's purpose), **P-CRYPTO-3 [V]** (identity-QR verifier unwired, no exp check), **P-CRYPTO-17 (canonical JSON)** — audit §8.

### Offline Re-login Constraint (decision point)

A server-issued secret means a fully-offline cold login cannot re-derive the key. Options: (a) accept it — offline work continues within an unlocked session; cold-start offline requires cached wrapped-DEK unlock via a local passcode/PIN; (b) wrap a random DEK with BOTH the server secret and a device-PIN-derived key (either unlocks). Recommend (b) for the target environments (multi-day outages are normal). This mirrors the existing `awaiting-key` machinery — reuse it.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Post-migration, every encrypted read/write works; in-session offline behavior is unchanged; the chosen offline-cold-start path is validated before rollout. Prescription QR (Ed25519/KRL — verified exemplary) is untouched. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `packages/crypto/src/{browser-crypto,server-crypto,ecdsa}.ts`, per-app key-establishment sites (`AuthGuard`/login), hub login/secret endpoint.
**New files:** `packages/crypto/src/__tests__/kdf-vnext.test.ts`, per-app migration modules + tests.

### References

- [Source: docs/system-audit-2026-09-23.md#8-shared-packages-packages] — P-CRYPTO-1..4
- [Source: packages/crypto/src/browser-crypto.ts:21-58] — current derivation
- [Source: apps/pharmacy-lite — awaiting-key sync states] — locked-store machinery to reuse

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

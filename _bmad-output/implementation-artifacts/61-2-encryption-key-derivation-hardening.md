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

Opus 4.8 (1M) — Lane-E (Story 61.2).

### Debug Log References

- crypto suite: 109 passed (incl. new kdf-vnext 10, tamper-signal 12, ecdsa exp/canonical additions).
- opd-lite encryption suite: 67 passed (incl. new encryption-vnext-migration 4).
- opd/pharmacy/lab auth-guard + login: passed; hub file-download: 20 passed; hub session endpoint: 5 passed.
- typecheck: @ultranos/crypto, hub-api, opd-lite, pharmacy-lite, lab-lite all clean.

### Completion Notes List

- **Decision #6 → dual-wrap (option b), reversible.** Random DEK wrapped under BOTH a
  hub-issued memory-only server secret (online arm) and a device-PIN-derived key
  (offline cold-start arm); either unlocks. Implemented in
  `packages/crypto/src/browser-crypto.ts` (KEY_SCHEME_VERSION 'k2', AES-KW wrap).
  Legacy `deriveSessionKey` retained for migration. Per-app establishment layered
  over 56.1 app_metadata reads and 56.3 MFA flow (both intact).
- **Hub secret issuance:** new `session.getKeyWrappingSecret` protected query returns
  HMAC-SHA256(`HUB_KEY_WRAPPING_MASTER_SECRET`, sub) hex. Master secret is env-only,
  never returned. Requires the new env var to be set in hub deployments.
- **Migration:** per-app startup re-encryption v1→v2 via the existing Dexie
  rotation machinery (read decrypts under key map, write encrypts under current
  write version). Resumable (per-table localStorage marker), idempotent, never
  plaintext. lab-lite has no local PHI store → no migration module.
- **Tamper signaling:** `decryptFieldResult` (discriminated) + `onIntegrityFailure`
  hook on `decryptField`; hub file-download routes audit `INTEGRITY_FAILURE`
  (new AuditAction) with opaque IDs. `decryptField` remains backward compatible
  (placeholder fallback) for callers without a hook.
- **Identity QR — FORMAL GAP (disposition (b)).** `verifyIdentityQrPayload` still has
  ZERO production callers (grep-verified: only its own module + tests reference it;
  no scanner UI consumes it). The identity/Health-Passport QR SCANNING feature is
  UNBUILT. Per AC #4(b) we recorded this gap and hardened the verifier now so it is
  safe when adopted: added `exp` enforcement + canonical-JSON (sorted-key)
  signing/verification (`packages/crypto/src/ecdsa.ts`), exported from the crypto
  barrel. When the scan feature is built it MUST call `verifyIdentityQrPayload`
  (signature + exp) and sign payloads with `canonicalJsonStringify`.
- **Prescription QR (Ed25519/KRL) — UNTOUCHED** (verified-correct; `verify-with-krl.ts`
  and its exports unchanged).

### File List

Modified:
- packages/crypto/src/browser-crypto.ts (KDF vNext: dual-wrapped DEK)
- packages/crypto/src/server-crypto.ts (decryptFieldResult + onIntegrityFailure hook)
- packages/crypto/src/ecdsa.ts (exp enforcement + canonicalJsonStringify)
- packages/crypto/src/index.ts (new exports)
- packages/shared-types/src/enums.ts (AuditAction.INTEGRITY_FAILURE)
- apps/hub-api/src/trpc/routers/_app.ts (register sessionRouter)
- apps/hub-api/src/app/api/lab-files/[fileId]/route.ts (integrity-failure audit)
- apps/hub-api/src/app/api/specimen-files/[fileId]/route.ts (integrity-failure audit)
- apps/opd-lite: components/AuthGuard.tsx, app/[locale]/(auth)/login/page.tsx,
  lib/encryption-key-store.ts, lib/trpc.ts
- apps/pharmacy-lite: components/AuthGuard.tsx, app/[locale]/(auth)/login/page.tsx,
  lib/encryption-key-store.ts, lib/trpc.ts
- apps/lab-lite: components/AuthGuard.tsx, lib/encryption-key-store.ts, lib/trpc.ts

New:
- apps/hub-api/src/trpc/routers/session.ts
- apps/{opd-lite,pharmacy-lite,lab-lite}/src/lib/encryption-key-vnext.ts
- apps/{opd-lite,pharmacy-lite,lab-lite}/src/lib/device-pin.ts
- apps/{opd-lite,pharmacy-lite}/src/lib/encryption-migration-vnext.ts
- packages/crypto/src/__tests__/{kdf-vnext,tamper-signal}.test.ts
- apps/opd-lite/src/__tests__/encryption-vnext-migration.test.ts
- apps/hub-api/src/__tests__/session-key-wrapping-secret.test.ts

### Change Log

- 2026-09-23: Story 61.2 implemented (KDF vNext dual-wrap, tamper signaling,
  identity-QR exp+canonical-JSON hardening, per-app migration + offline PIN unlock).

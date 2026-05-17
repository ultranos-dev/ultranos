# Story 21.2: QR Signature Verification Enforcement

Status: done

## Story

As a pharmacist,
I want prescription QR codes to be cryptographically verified on the server before any status lookup,
so that forged QR codes cannot be used to enumerate prescription data.

## Acceptance Criteria

1. **Given** a scanned QR payload submitted to `medication.getStatus`, **When** the payload includes a signature field, **Then** the Ed25519 signature is verified against the embedded public key BEFORE any database lookup
2. **Given** a signature verification failure, **When** the server detects an invalid signature, **Then** the request is rejected with `INVALID_SIGNATURE` error and no database lookup occurs
3. **Given** a public key that appears on the Key Revocation List, **When** the key is checked, **Then** the request is rejected with `KEY_REVOKED` error
4. **Given** a QR payload with no signature, **When** submitted to `medication.getStatus`, **Then** the request is rejected (no unsigned lookups allowed)
5. **Given** any signature verification failure (invalid signature, revoked key, missing signature), **When** the rejection occurs, **Then** a security audit event is emitted with action `SECURITY_VIOLATION` and relevant details in metadata

## Tasks / Subtasks

- [x] Task 1: Add server-side Ed25519 verification utility (AC: #1, #2)
  - [x] 1.1 Create `apps/hub-api/src/lib/ed25519-verify.ts` — import `crypto` (Node.js built-in) for Ed25519 verification using `crypto.verify('ed25519', ...)`
  - [x] 1.2 Implement `verifyEd25519Signature(payload: string, signature: string, publicKey: string): boolean` — takes base64-encoded signature and public key, returns boolean
  - [x] 1.3 This is separate from the ECDSA-P256 code in `packages/crypto/src/ecdsa.ts` which is for patient identity QR (Health Passport), NOT prescriptions

- [x] Task 2: Add KRL (Key Revocation List) server-side check (AC: #3)
  - [x] 2.1 Create `apps/hub-api/src/lib/krl-check.ts` — query `practitioner_keys` table for the public key and check revocation status
  - [x] 2.2 Implement `isKeyRevoked(publicKey: string, supabase: SupabaseClient): Promise<boolean>` — returns true if key is in the KRL (revoked_at IS NOT NULL)
  - [x] 2.3 Fail-closed: if the DB query fails, treat the key as revoked (reject the request)

- [x] Task 3: Update `medication.getStatus` input schema and handler (AC: #1, #2, #3, #4)
  - [x] 3.1 Extend `GetStatusInputSchema` in `apps/hub-api/src/trpc/routers/medication.ts` to accept a `signedBundle` field: `z.object({ payload: z.string(), sig: z.string(), pub: z.string() }).optional()`
  - [x] 3.2 Add validation logic BEFORE the database lookup (before line 368):
    - If `signedBundle` is provided: verify signature → check KRL → extract prescriptionId/qrCodeId from `signedBundle.payload`
    - If neither `signedBundle` nor legacy `prescriptionId`/`qrCodeId` is provided: reject with `BAD_REQUEST`
    - If `signedBundle` is NOT provided but `prescriptionId`/`qrCodeId` IS provided: reject with `UNSIGNED_LOOKUP_REJECTED` (no unsigned lookups)
  - [x] 3.3 On `INVALID_SIGNATURE`: throw `TRPCError({ code: 'BAD_REQUEST', message: 'INVALID_SIGNATURE' })`
  - [x] 3.4 On `KEY_REVOKED`: throw `TRPCError({ code: 'FORBIDDEN', message: 'KEY_REVOKED' })`

- [x] Task 4: Emit security audit events on verification failures (AC: #5)
  - [x] 4.1 On invalid signature: emit audit event `{ action: 'SECURITY_VIOLATION', resourceType: 'PRESCRIPTION', outcome: 'FAILURE', metadata: { reason: 'invalid_signature' } }`
  - [x] 4.2 On revoked key: emit audit event `{ action: 'SECURITY_VIOLATION', resourceType: 'PRESCRIPTION', outcome: 'FAILURE', metadata: { reason: 'key_revoked', publicKeyPrefix: pub.slice(0, 8) } }`
  - [x] 4.3 On missing signature: emit audit event `{ action: 'SECURITY_VIOLATION', resourceType: 'PRESCRIPTION', outcome: 'FAILURE', metadata: { reason: 'unsigned_lookup' } }`
  - [x] 4.4 Check if `SECURITY_VIOLATION` exists in `AuditAction` enum in `packages/shared-types/src/enums.ts` — if not, add it

- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test `ed25519-verify.ts`: valid signature → true, tampered payload → false, wrong key → false
  - [x] 5.2 Unit test `krl-check.ts`: active key → false, revoked key → true, DB error → true (fail-closed)
  - [x] 5.3 Integration test `medication.getStatus`:
    - Valid signed bundle → status returned
    - Invalid signature → `INVALID_SIGNATURE` error, no DB lookup
    - Revoked key → `KEY_REVOKED` error
    - Unsigned lookup (raw prescriptionId) → rejected
    - Missing both fields → `BAD_REQUEST`
  - [x] 5.4 Verify audit events emitted for all failure paths

## Dev Notes

### Architecture & Patterns

- **Ed25519 vs ECDSA-P256:** The codebase has two separate signing systems. Ed25519 is for prescription QR codes (`SignedPrescriptionBundle` in `packages/shared-types/src/prescription.ts`). ECDSA-P256 is for patient identity QR codes (Health Passport, `packages/crypto/src/ecdsa.ts`). This story is Ed25519 ONLY.
- **Client-side already implemented:** Pharmacy Lite already verifies Ed25519 signatures client-side in `apps/pharmacy-lite/src/lib/prescription-verify.ts`. This story adds the SERVER-SIDE gate so that even a compromised client cannot bypass verification.
- **`SignedPrescriptionBundle` shape:** `{ payload: string, sig: string, pub: string, issued_at: string, expiry: string }` where `payload` is a JSON-stringified minified prescription bundle containing medication codes and references (never demographics).
- **Breaking change consideration:** Adding mandatory signature verification to `medication.getStatus` means existing clients that pass raw `prescriptionId`/`qrCodeId` will be rejected. The Pharmacy Lite app already constructs signed bundles, so this should be compatible. Verify by checking `apps/pharmacy-lite/src/lib/prescription-verify.ts` and the scan flow.
- **Node.js Ed25519:** Node.js 18+ supports Ed25519 natively via `crypto.verify('ed25519', data, publicKey, signature)` and `crypto.createPublicKey({ key: Buffer.from(pubKeyBase64, 'base64'), format: 'der', type: 'spki' })`.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `apps/hub-api/src/trpc/routers/medication.ts` | Add signature verification BEFORE DB lookup in `getStatus` (around line 361–368); extend `GetStatusInputSchema` |
| `packages/shared-types/src/enums.ts` | Add `SECURITY_VIOLATION` to `AuditAction` enum if missing |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `apps/hub-api/src/lib/ed25519-verify.ts` | Ed25519 signature verification using Node.js crypto |
| `apps/hub-api/src/lib/krl-check.ts` | Key Revocation List check against practitioner_keys table |
| `apps/hub-api/src/__tests__/qr-signature-verification.test.ts` | Tests |

### Project Structure Notes

- The `verifyWithKrl` wrapper in `packages/crypto/src/verify-with-krl.ts` is designed for client-side use with injected verify functions. The server-side implementation in this story can be simpler: direct DB query + `crypto.verify`.
- The `PrescriptionScanner.tsx` in pharmacy-lite extracts IDs via `parsePrescriptionIds()` WITHOUT calling `verifyPrescriptionQr()` first — this is a client-side gap but NOT in scope for this story (server-side enforcement is the fix).

### References

- [Source: apps/hub-api/src/trpc/routers/medication.ts#L361-L415] — `getStatus` handler to modify
- [Source: packages/shared-types/src/prescription.ts] — `SignedPrescriptionBundle` type definition
- [Source: apps/pharmacy-lite/src/lib/prescription-verify.ts] — client-side Ed25519 verification (reference implementation)
- [Source: packages/crypto/src/verify-with-krl.ts] — KRL verification wrapper (client-side pattern)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-21] — Story 21.2 acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Ed25519 verification uses Node.js built-in `crypto.verify(null, data, keyObject, sig)` with SPKI/DER format keys
- KRL check queries `practitioner_keys.revoked_at` — fail-closed on DB error or missing key
- `SECURITY_VIOLATION` already existed in `AuditAction` enum (added by prior story)
- Existing `medication.test.ts` getStatus tests updated from raw prescriptionId to signed bundles

### Completion Notes List
- Created `ed25519-verify.ts` with `verifyEd25519Signature()` — 5 unit tests (valid sig, tampered payload, wrong key, invalid sig base64, invalid key base64)
- Created `krl-check.ts` with `isKeyRevoked()` — 4 unit tests (active key, revoked key, DB error fail-closed, key not found fail-closed)
- Updated `medication.getStatus` handler: signature verification + KRL check BEFORE any DB lookup
- Extended `GetStatusInputSchema` with `signedBundle` field
- 3 security audit events emitted via `AuditLogger.emit()` for invalid_signature, key_revoked, unsigned_lookup
- 9 integration tests for getStatus with signed bundles covering all ACs
- Updated existing medication.test.ts to use signed bundles (breaking change per story spec)
- 2 pre-existing recordDispense test failures from Story 21.3 linter changes (not related to this story)

### File List
- `apps/hub-api/src/lib/ed25519-verify.ts` (NEW) — Ed25519 signature verification
- `apps/hub-api/src/lib/krl-check.ts` (NEW) — Key Revocation List check
- `apps/hub-api/src/__tests__/qr-signature-verification.test.ts` (NEW) — 18 tests
- `apps/hub-api/src/trpc/routers/medication.ts` (MODIFIED) — getStatus handler + imports + schema
- `apps/hub-api/src/__tests__/medication.test.ts` (MODIFIED) — getStatus tests updated for signed bundles

### Review Findings

- [x] [Review][Decision] D1: No expiry validation on signed payload — DISMISSED: read-only endpoint, replay is low risk, key revocation handles compromise
- [x] [Review][Decision] D2: Any non-revoked practitioner key accepted — DISMISSED: by design, physical QR possession is the trust anchor
- [x] [Review][Decision] D3: `getStatus` uses `protectedProcedure` — RESOLVED → P7: restrict to PHARMACIST + CLINICIAN
- [x] [Review][Patch] P1: No Zod validation on parsed payload — added `SignedPayloadSchema` with UUID validation [medication.ts]
- [x] [Review][Patch] P2: No audit event when signedBundle missing AND no IDs provided — added SECURITY_VIOLATION emit [medication.ts]
- [x] [Review][Patch] P3: `signedBundle` is `.optional()` but always required at runtime — added explanatory comment, intentional for audit event coverage [medication.ts]
- [x] [Review][Patch] P4: Tests don't assert SECURITY_VIOLATION audit event contents — added RPC-based audit assertions to AC2/AC3/AC4 tests [qr-signature-verification.test.ts]
- [x] [Review][Patch] P5: No `resourceId` in SECURITY_VIOLATION audit events — added `attemptedPrescriptionId`/`attemptedQrCodeId` to unsigned_lookup metadata [medication.ts]
- [x] [Review][Patch] P6: Test doesn't verify `.eq()` column for prescriptionId lookups — added `mockEq` assertion [qr-signature-verification.test.ts]
- [x] [Review][Patch] P7 (from D3): `getStatus` restricted to PHARMACIST/CLINICIAN/DOCTOR via `roleRestrictedProcedure` [medication.ts]
- [x] [Review][Defer] W1: Audit failure on SECURITY_VIOLATION is swallowed (no retry/alert) — deferred, broader audit infrastructure concern
- [x] [Review][Defer] W2: KRL base64 normalization / multiple rows handling — deferred, data integrity concern for practitioner_keys table
- [x] [Review][Defer] W3: `INTERACTION_CHECK` not in `AuditResourceType` enum — deferred, pre-existing from checkInteractions handler
- [x] [Review][Defer] W4: KRL check uses caller's Supabase client (RLS context) — deferred, needs service-role client investigation

### Change Log
- 2026-05-13: Story 21.2 implemented — server-side Ed25519 QR signature verification enforcement on medication.getStatus
- 2026-05-13: Code review complete — 3 decision-needed, 6 patch, 4 deferred, 7 dismissed

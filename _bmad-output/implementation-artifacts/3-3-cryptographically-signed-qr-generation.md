# Story 3.3: Cryptographically Signed QR Generation

Status: done

## Story

As a clinician,
I want to provide the patient with a secure digital prescription,
so that they can fulfill it at any pharmacy with confidence in its authenticity.

## Acceptance Criteria

1. [x] Finalized prescriptions are bundled into a minified prescription payload (compact format optimized for QR size constraints).
2. [x] The bundle is signed using the clinician's private key (Ed25519) stored in device secure storage.
3. [x] A high-density QR code is generated containing the signed payload.
4. [x] The QR code is displayed on-screen for patient capture or printing.
5. [x] Signature generation occurs offline.

## Tasks / Subtasks

- [x] **Task 1: Payload Minification** (AC: 1)
  - [x] Implement a `compressPrescription` utility to minify the FHIR `MedicationRequest` (removing whitespace, using short keys if necessary).
- [x] **Task 2: Cryptographic Signing** (AC: 2, 5)
  - [x] Integrate with `noble-ed25519` for signing.
  - [x] Retrieve the clinician's private key from the RAM-keyed store (PWA).
  - [x] Sign the minified payload.
- [x] **Task 3: QR Generation UI** (AC: 3, 4)
  - [x] Install and configure `qrcode.react` (PWA).
  - [x] Build the "Prescription Finalized" success screen with the QR display.
- [x] **Task 4: Signature Verification Utility**
  - [x] Create a shared helper in `@ultranos/sync-engine` to verify these signatures (to be used by the Pharmacy app).

## Dev Notes

- **Security:** NEVER display the private key. The signing should happen in a protected utility.
- **Density:** Keep the payload small (e.g., <1KB) to ensure the QR remains scannable even on low-end phone cameras.
- **Privacy:** Do not include sensitive patient demographics in the QR; only the FHIR ID and Medication details.

### Project Structure Notes

- Component: `apps/opd-lite-pwa/src/components/clinical/PrescriptionQR.tsx`
- Crypto: `packages/sync-engine/src/crypto.ts`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#QR-Prescriptions)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR8)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- noble-ed25519 v3 uses `utils.randomSecretKey()` not `randomPrivateKey()` — fixed during Task 2.

### Completion Notes List

- **Task 1:** Created `compressPrescription` utility that strips verbose FHIR system URIs, internal metadata (_ultranos), and PHI. Uses compact short keys (med, dos, dur, etc.) to keep payload under 1KB. 10 unit tests.
- **Task 2:** Integrated `@noble/ed25519` (v3.1.0) for Ed25519 signing. Created `signPayload`, `verifySignature`, and `generateKeyPair` functions in sync-engine. PWA-side `signPrescriptionBundle` combines compression + signing + base64 encoding. 13 tests (8 crypto + 5 signing).
- **Task 3:** Built `PrescriptionQR` component using `qrcode.react`. Shows "Finalize & Generate QR" button, loading state during signing, success screen with QR display, and error handling. 7 component tests.
- **Task 4:** `verifySignature` exported from `@ultranos/sync-engine` for use by Pharmacy app. Same crypto module serves both signing and verification.
- **Integration:** Wired PrescriptionQR into encounter dashboard. RAM-only key store clears on tab close/visibility change per PHI security rules. QR section appears when prescriptions exist.

### Review Findings

- [x] [Review][Decision] **D1: Algorithm mismatch — Ed25519 vs ECDSA-P256** — Resolved: keep Ed25519 (story spec). CLAUDE.md updated to distinguish prescription QR (Ed25519) from identity QR (ECDSA-P256).
- [x] [Review][Decision] **D2: Missing `issued_at` and `expiry` envelope fields** — Resolved: added `issued_at` and `expiry` (30-day default) to `SignedPrescriptionBundle`.
- [x] [Review][Decision] **D3: Public key never distributed** — Resolved: embedded `pub` (base64 public key) in QR bundle for offline verification.
- [x] [Review][Decision] **D4: QR payload is custom compact format** — Resolved: accepted custom format, updated AC #1 wording.
- [x] [Review][Patch] **P1: No QR data size guard** — Fixed: added 2,500-byte limit check after signing with user-facing error message.
- [x] [Review][Patch] **P2: Clinical notes included in QR payload** — Fixed: removed `note` field from `CompactRx`.
- [x] [Review][Patch] **P3: `coding[0]` crash when coding array absent** — Fixed: added optional chaining `coding?.[0]`.
- [x] [Review][Patch] **P4: Race condition in `getSigningKey`** — Fixed: added pending-promise guard for async singleton pattern.
- [x] [Review][Patch] **P5: `visibilitychange` clears keys too aggressively** — Fixed: removed visibilitychange listener, kept beforeunload only per CLAUDE.md.
- [x] [Review][Patch] **P6: No print functionality** — Fixed: added Print button to QR success screen.
- [x] [Review][Patch] **P7: Empty encounter reference** — Fixed: `enc` field omitted when encounter is absent.
- [x] [Review][Defer] **W1: Audit log failure silently swallowed** — Three catch blocks with empty bodies in encounter-dashboard.tsx. Broader pattern — no client-side audit retry/queue exists. Consistent with D9/D23/D38. Address in Story 6-2.
- [x] [Review][Defer] **W2: Interaction check only against pending prescriptions** — `activeMedNames` built from `pendingPrescriptions` only, not patient's full active medication list. Story 3.2 scope (D2 in 3-2 review). MedicationStatement data model doesn't exist yet.
- [x] [Review][Defer] **W3: `asNeededBoolean` not in Zod DosageSchema** — `compress-prescription.ts:58` checks `d?.asNeededBoolean` but DosageSchema doesn't define it. Zod strips unknown keys, so PRN flag is always omitted. Schema change needed; separate concern.

### Change Log

- 2026-04-29: Implemented all 4 tasks for Story 3.3 — payload minification, Ed25519 signing, QR UI, verification utility.

### File List

- apps/opd-lite-pwa/src/lib/compress-prescription.ts (new)
- apps/opd-lite-pwa/src/lib/prescription-signing.ts (new)
- apps/opd-lite-pwa/src/lib/signing-key-store.ts (new)
- apps/opd-lite-pwa/src/components/clinical/PrescriptionQR.tsx (new)
- apps/opd-lite-pwa/src/components/encounter-dashboard.tsx (modified)
- apps/opd-lite-pwa/src/__tests__/compress-prescription.test.ts (new)
- apps/opd-lite-pwa/src/__tests__/prescription-signing.test.ts (new)
- apps/opd-lite-pwa/src/__tests__/PrescriptionQR.test.tsx (new)
- apps/opd-lite-pwa/package.json (modified — added qrcode.react)
- packages/sync-engine/src/crypto.ts (new)
- packages/sync-engine/src/index.ts (modified — exports crypto)
- packages/sync-engine/src/__tests__/crypto.test.ts (new)
- packages/sync-engine/package.json (modified — added @noble/ed25519)

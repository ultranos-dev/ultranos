# Story 3.3: Cryptographically Signed QR Generation

Status: ready-for-dev

## Story

As a clinician,
I want to provide the patient with a secure digital prescription,
so that they can fulfill it at any pharmacy with confidence in its authenticity.

## Acceptance Criteria

1. [ ] Finalized prescriptions are bundled into a minified FHIR Bundle.
2. [ ] The bundle is signed using the clinician's private key (Ed25519) stored in device secure storage.
3. [ ] A high-density QR code is generated containing the signed payload.
4. [ ] The QR code is displayed on-screen for patient capture or printing.
5. [ ] Signature generation occurs offline.

## Tasks / Subtasks

- [ ] **Task 1: Payload Minification** (AC: 1)
  - [ ] Implement a `compressPrescription` utility to minify the FHIR `MedicationRequest` (removing whitespace, using short keys if necessary).
- [ ] **Task 2: Cryptographic Signing** (AC: 2, 5)
  - [ ] Integrate with `tweetnacl` or `noble-ed25519` for signing.
  - [ ] Retrieve the clinician's private key from `SecureStore` (Mobile) or the RAM-keyed store (PWA).
  - [ ] Sign the minified payload.
- [ ] **Task 3: QR Generation UI** (AC: 3, 4)
  - [ ] Install and configure `qrcode.react` (PWA) or `react-native-qrcode-svg` (Mobile).
  - [ ] Build the "Prescription Finalized" success screen with the QR display.
- [ ] **Task 4: Signature Verification Utility**
  - [ ] Create a shared helper in `@ultranos/sync-engine` to verify these signatures (to be used by the Pharmacy app).

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

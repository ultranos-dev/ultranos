/**
 * Signed prescription bundle for QR-based prescription transfer.
 *
 * Contains a minified, signed payload suitable for encoding in a QR code.
 * Per CLAUDE.md: QR prescription payloads contain medication codes, dosage,
 * and references — never demographics or clinical notes. Signed with Ed25519.
 */
export interface SignedPrescriptionBundle {
  payload: string    // minified JSON of prescription data
  sig: string        // base64-encoded Ed25519 signature
  pub: string        // base64-encoded public key for verification
  issued_at: string  // ISO 8601 timestamp
  expiry: string     // ISO 8601 timestamp
}

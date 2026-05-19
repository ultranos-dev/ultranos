/**
 * Certificate Pinning Configuration.
 *
 * Story 21.5 AC#3: Certificate pinning for Hub API connections.
 *
 * Contains SHA-256 hashes of the Hub API's leaf certificate and a
 * backup pin (CA intermediate) for rotation resilience.
 *
 * PIN ROTATION PROCEDURE:
 * 1. Generate new leaf certificate for Hub API domain
 * 2. Add new pin hash to PINS array (keep old pin temporarily)
 * 3. Deploy app update with both pins
 * 4. After all clients update, remove old pin
 * 5. Update LAST_ROTATED date
 *
 * To compute a pin from a PEM certificate:
 *   openssl x509 -in cert.pem -pubkey -noout |
 *     openssl pkey -pubin -outform der |
 *     openssl dgst -sha256 -binary |
 *     openssl enc -base64
 */

export interface CertificatePin {
  /** Base64-encoded SHA-256 hash of the certificate's Subject Public Key Info (SPKI) */
  hash: string
  /** Description of what this pin represents */
  label: string
}

/**
 * Hub API certificate pins.
 * At least 2 pins required: leaf certificate + CA intermediate backup.
 */
export const HUB_API_PINS: CertificatePin[] = [
  {
    hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    label: 'Hub API leaf certificate (placeholder — replace with actual pin before production)',
  },
  {
    hash: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    label: 'CA intermediate backup pin (placeholder — replace with actual pin before production)',
  },
]

/** Minimum TLS version required for Hub API connections */
export const MIN_TLS_VERSION = 'TLSv1.3' as const

/** Last pin rotation date for tracking */
export const LAST_ROTATED = '2026-05-12'

/**
 * Runtime validation: ensure placeholder pins are not deployed to production.
 * Throws at app startup if pins haven't been replaced.
 */
export function validatePins(): void {
  if (__DEV__) return // Placeholder pins are acceptable in development

  // A valid SHA-256 SPKI pin is exactly 44 characters of base64 (32 bytes → 44 chars with padding).
  // Additionally, a real hash has high entropy — placeholder values like AAAA... have < 4 unique chars.
  const validBase64Pin = /^[A-Za-z0-9+/]{43}=$/

  for (const pin of HUB_API_PINS) {
    if (!validBase64Pin.test(pin.hash)) {
      throw new Error(
        `FATAL: Certificate pin "${pin.label}" has invalid hash format. ` +
        'Expected a 44-character base64-encoded SHA-256 SPKI hash. ' +
        'See certificate-pins.ts for the pin generation procedure.',
      )
    }

    // Entropy check: a real SHA-256 hash has high character diversity.
    // Placeholder values (AAAA..., BBBB...) use < 4 unique characters.
    const uniqueChars = new Set(pin.hash.replace(/=+$/, '')).size
    if (uniqueChars < 4) {
      throw new Error(
        `FATAL: Certificate pin "${pin.label}" appears to be a placeholder (low entropy). ` +
        'Replace with a real SHA-256 SPKI hash before deploying to production.',
      )
    }
  }
}

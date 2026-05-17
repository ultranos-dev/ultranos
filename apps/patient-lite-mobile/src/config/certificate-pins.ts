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

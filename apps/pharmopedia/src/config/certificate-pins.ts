/**
 * Certificate Pinning Configuration — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/config/certificate-pins.ts.
 *
 * PIN ROTATION PROCEDURE:
 * 1. Add new pin hash, deploy app with both pins
 * 2. After all clients update, remove old pin
 *
 * To compute a pin from a PEM certificate:
 *   openssl x509 -in cert.pem -pubkey -noout |
 *     openssl pkey -pubin -outform der |
 *     openssl dgst -sha256 -binary |
 *     openssl enc -base64
 */

export interface CertificatePin {
  hash: string   // Base64-encoded SHA-256 SPKI hash
  label: string
}

export const HUB_API_PINS: CertificatePin[] = [
  {
    hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    label: 'Hub API leaf certificate (placeholder — replace before production)',
  },
  {
    hash: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    label: 'CA intermediate backup pin (placeholder — replace before production)',
  },
]

export const MIN_TLS_VERSION = 'TLSv1.3' as const
export const LAST_ROTATED = '2026-06-12'

/**
 * Validates that all pins have been replaced from placeholders.
 * No-op in development. Throws immediately in production if any pin
 * appears to be a placeholder.
 *
 * MUST be called at app startup in app/_layout.tsx before any Hub API call.
 */
export function validatePins(): void {
  if (__DEV__) return
  const validBase64Pin = /^[A-Za-z0-9+/]{43}=$/
  for (const pin of HUB_API_PINS) {
    if (!validBase64Pin.test(pin.hash)) {
      throw new Error(`FATAL: Certificate pin "${pin.label}" has invalid hash format.`)
    }
    const uniqueChars = new Set(pin.hash.replace(/=+$/, '')).size
    if (uniqueChars < 4) {
      throw new Error(`FATAL: Certificate pin "${pin.label}" appears to be a placeholder.`)
    }
  }
}

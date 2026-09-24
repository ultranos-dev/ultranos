import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const CURRENT_VERSION = 'v1'
const PLACEHOLDER = '[Encrypted Content]'

/**
 * Reason a decrypt attempt failed. Distinguishes a genuine GCM authentication-tag
 * failure (possible tampering) from a malformed/unknown-version input so callers
 * can audit tampering specifically (Story 61.2 / P-CRYPTO-4).
 */
export type DecryptFailureReason =
  | 'MALFORMED' // missing colon / empty payload / too short to hold IV+tag
  | 'UNKNOWN_VERSION' // version prefix not recognised
  | 'AUTH_TAG_FAILURE' // GCM authentication failed — ciphertext/tag/key mismatch (tamper signal)

/**
 * Discriminated result of {@link decryptFieldResult}.
 * `ok: true` → `value` is the plaintext.
 * `ok: false` → `reason` explains why (never carries plaintext or key material).
 */
export type DecryptFieldResult =
  | { ok: true; value: string }
  | { ok: false; reason: DecryptFailureReason }

/**
 * Optional hook invoked by {@link decryptField} on any decrypt failure. Callers
 * (hub read paths) use this to emit an audit event for integrity failures.
 * The hook receives only the opaque failure reason — never PHI, ciphertext, or keys.
 */
export type OnIntegrityFailure = (reason: DecryptFailureReason) => void

/**
 * Encrypt a plaintext string using AES-256-GCM with a random IV.
 * Returns a versioned string: "v1:<base64(iv + authTag + ciphertext)>"
 *
 * The version prefix supports future key rotation — the decryptor
 * can select the correct key based on the version.
 */
export function encryptField(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Pack: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return `${CURRENT_VERSION}:${combined.toString('base64')}`
}

/**
 * Decrypt a versioned ciphertext string, returning a discriminated result.
 *
 * Unlike {@link decryptField}, this NEVER swallows a failure into a placeholder —
 * it distinguishes a GCM authentication-tag failure (a tamper signal) from a
 * malformed input or an unknown key version. Hub read paths use this (or the
 * `onIntegrityFailure` hook on {@link decryptField}) to audit integrity failures
 * with opaque reasons only (Story 61.2 / P-CRYPTO-4).
 *
 * The failure reason never carries plaintext, ciphertext, or key material.
 */
export function decryptFieldResult(
  encrypted: string,
  keyHex: string,
): DecryptFieldResult {
  const colonIndex = encrypted.indexOf(':')
  if (colonIndex === -1) return { ok: false, reason: 'MALFORMED' }

  const version = encrypted.slice(0, colonIndex)
  const payload = encrypted.slice(colonIndex + 1)

  if (version !== CURRENT_VERSION) return { ok: false, reason: 'UNKNOWN_VERSION' }
  if (!payload) return { ok: false, reason: 'MALFORMED' }

  const combined = Buffer.from(payload, 'base64')
  if (combined.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    return { ok: false, reason: 'MALFORMED' }
  }

  const iv = combined.subarray(0, IV_BYTES)
  const authTag = combined.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = combined.subarray(IV_BYTES + AUTH_TAG_BYTES)

  try {
    const key = Buffer.from(keyHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return { ok: true, value: decrypted.toString('utf8') }
  } catch {
    // createDecipheriv/decipher.final() throws on GCM auth-tag mismatch —
    // ciphertext, tag, IV, or key don't agree. This is the tamper signal.
    return { ok: false, reason: 'AUTH_TAG_FAILURE' }
  }
}

/**
 * Decrypt a versioned ciphertext string back to plaintext.
 *
 * Returns the "[Encrypted Content]" placeholder on any failure (wrong key,
 * tampered data, malformed input, unknown version) so the API response never
 * crashes and no ciphertext leaks into the UI — BUT, unlike the pre-61.2
 * behaviour, the failure is no longer silent: if an `onIntegrityFailure` hook is
 * provided it is invoked with the opaque failure reason so the caller can audit
 * the integrity failure (P-CRYPTO-4). The placeholder is preserved as a safe UI
 * display fallback.
 *
 * Callers that need to branch on success/failure should prefer
 * {@link decryptFieldResult} directly.
 */
export function decryptField(
  encrypted: string,
  keyHex: string,
  onIntegrityFailure?: OnIntegrityFailure,
): string {
  const result = decryptFieldResult(encrypted, keyHex)
  if (result.ok) return result.value
  // Signal the failure (tamper / malformed / unknown version) to the caller.
  // AUTH_TAG_FAILURE is the security-relevant case; the others are surfaced too
  // so an audit trail can distinguish corruption from tampering.
  onIntegrityFailure?.(result.reason)
  return PLACEHOLDER
}

/**
 * Generate a deterministic HMAC-SHA256 blind index for searchable encryption.
 * Used for equality lookups (e.g., national_id) without decrypting the stored value.
 *
 * The HMAC key MUST be different from the encryption key.
 */
export function generateBlindIndex(value: string, hmacKeyHex: string): string {
  return createHmac('sha256', Buffer.from(hmacKeyHex, 'hex'))
    .update(value)
    .digest('hex')
}

/**
 * Returns the encryption configuration — which DB columns use which encryption mode.
 *
 * randomizedFields: AES-256-GCM with random IV (non-deterministic). Cannot be searched.
 *
 * Note: national_id uses HMAC blind index for equality lookups (see generateBlindIndex)
 * but is not encrypted at rest in this config. Blind index generation is handled
 * directly in the patient router via generateBlindIndex().
 */
export function getEncryptionConfig() {
  return {
    randomizedFields: [
      'diagnosis',
      'dosage_instruction',
      'interaction_override',
      // medication_text is the free-text column (PHI). medication_display is a separate
      // column containing standardized drug names from formulary — NOT PHI, not encrypted.
      // See migration 005_medication_requests.sql for both column definitions.
      'medication_text',
      'soap_subjective',
      'soap_objective',
      'soap_assessment',
      'soap_plan',
      // AI scribe PHI fields (Story 24.1)
      'original_freeform_text',
      'ai_raw_response',
      // AllergyIntolerance substance (Tier-1, CLAUDE.md Rule #1 + Rule #4). The
      // allergy router documents substance_free_text as encrypted, and the
      // allergen display name (substance_text) is equally PHI; neither is used
      // in a query filter, so both are encrypted at rest. substance_code stays
      // plaintext for coded allergen matching.
      'substance_text',
      'substance_free_text',
      // Lab result tables (Story 12.3)
      'report_conclusion',
      'encrypted_content',
      // ServiceRequest (lab order) clinical PHI. Uniquely-named columns (migration
      // 056) so encryption does not collide with encounters.reason_code /
      // customer_ledger_entries.note. Never returned to Lab-Lite (data minimization).
      'order_reason_code',
      'order_note',
      // Paper prescription OCR metadata contains prescriber name and prescription date (Story 24.3)
      'ocr_metadata',
      // Patient PHI — encrypted copies for secure read (Story 16.2, Option A).
      // The unencrypted originals (name_local, name_latin, etc.) remain for ILIKE search.
      'name_local_enc',
      'name_latin_enc',
      'name_phonetic_enc',
      'birth_date_enc',
      // Patronymic name parts (Migration 020) — the *_enc columns are documented
      // as "AES-256-GCM encrypted copy ... source of truth for display". They were
      // omitted from this list, so they were being written in PLAINTEXT. Encrypt them.
      'name_given_enc',
      'name_father_enc',
      'name_grandfather_enc',
      'name_family_enc',
      // POS PHI (org-scoped sync). invoice_items holds Invoice line items whose
      // descriptions are medication names (patient↔drug linkage); ledger_note is a
      // patient-ledger free-text note. Both must be encrypted at rest on the Hub.
      // POS-unique column names so encryption stays scoped to POS (the non-PHI
      // JSONB `items`/`notes` on purchase_orders/goods_receipts/stock_* are NOT here).
      'invoice_items',
      'ledger_note',
    ] as const,
  }
}

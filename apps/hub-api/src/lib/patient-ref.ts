import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from './field-encryption'

/**
 * Patient reference identity helpers.
 *
 * Two conventions coexist in the system:
 *  - The REAL reference `Patient/<uuid>` — used by consent, encounters, and the
 *    clinical apps that legitimately know the patient's identity.
 *  - The data-minimized BLIND reference — an HMAC-SHA256 blind index of the raw
 *    patient UUID, used as the storage/lookup key for lab-produced, data-minimized
 *    resources (e.g. `diagnostic_reports.patient_ref`) so the row cannot be traced
 *    back to a patient without the server-side HMAC key.
 *
 * The HMAC key is a single global server secret (`FIELD_ENCRYPTION_HMAC_KEY`) and
 * MUST NEVER reach a client — so mapping a real id to its blind index can only
 * happen here, on the Hub. Clinician read paths therefore accept the real id
 * (so consent enforcement works) and blind-index it here before querying
 * data-minimized tables.
 */

/** Strip a leading `Patient/` FHIR-reference prefix, returning the raw UUID. */
export function extractPatientId(patientIdOrRef: string): string {
  return patientIdOrRef.replace(/^Patient\//, '')
}

/**
 * Map a real patient id (raw UUID or `Patient/<uuid>`) to the deterministic HMAC
 * blind index used as the `patient_ref` storage/lookup key on data-minimized
 * lab resources. Computed with the global server HMAC key.
 */
export function patientBlindRef(patientIdOrRef: string): string {
  const id = extractPatientId(patientIdOrRef)
  const { hmacKey } = getFieldEncryptionKeys()
  return generateBlindIndex(id, hmacKey)
}

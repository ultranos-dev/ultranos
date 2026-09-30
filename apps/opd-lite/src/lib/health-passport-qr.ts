/**
 * Parsing for a patient's Health Passport identity QR (from the Patient Lite
 * mobile app). The QR carries `{ pid, iat, exp, v, sig? }` — JWT-style short
 * names, never raw PHI. We read `pid` (the patient id) and reject an expired QR.
 *
 * A payload that is not JSON is treated as a raw patient id (e.g. a plain UUID),
 * mirroring the lab-lite verify scanner's tolerance.
 */
export type HealthPassportScan =
  | { ok: true; patientId: string }
  | { ok: false; reason: 'expired' | 'invalid' }

interface HealthPassportPayload {
  pid?: unknown
  exp?: unknown
}

/**
 * @param decodedText Raw text decoded from the scanned QR.
 * @param nowMs Current time in ms (injectable for testing).
 */
export function parseHealthPassportQr(
  decodedText: string,
  nowMs: number = Date.now(),
): HealthPassportScan {
  const raw = (decodedText ?? '').trim()
  if (!raw) return { ok: false, reason: 'invalid' }

  try {
    const parsed = JSON.parse(raw) as HealthPassportPayload
    // Only a JSON *object* is a Health Passport payload; a JSON primitive
    // (bare number/string) falls through to the raw-id path below.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (typeof parsed.exp === 'number' && nowMs / 1000 > parsed.exp) {
        return { ok: false, reason: 'expired' }
      }
      if (typeof parsed.pid === 'string' && parsed.pid.trim()) {
        return { ok: true, patientId: parsed.pid.trim() }
      }
      // A JSON object with no usable pid is not a valid passport.
      return { ok: false, reason: 'invalid' }
    }
  } catch {
    // Not JSON — treat the scanned text as a raw patient id.
  }

  return { ok: true, patientId: raw }
}

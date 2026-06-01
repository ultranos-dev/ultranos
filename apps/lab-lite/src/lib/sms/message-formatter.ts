/**
 * Story 49.2 — SMS Message Formatter
 *
 * Formats critical value SMS messages following the codified format:
 *   "[LabCode] CRITICAL: Pt [ID-code] [TestCode] [Value][Unit] — Reply CONFIRM [code]"
 *
 * Design constraints:
 * - Maximum 160 characters (single SMS segment)
 * - PHI guard: NEVER accepts or includes patient name, DOB, diagnosis, or demographics
 * - If truncation is needed, shorten the testCode display name — NEVER value or confirmCode
 *
 * Confirmation codes: 4-character alphanumeric (A-Z, 0-9) excluding confusable
 * characters (0/O, 1/I/L). ~35^4 ≈ 1.5M combinations, collision-resistant in 24h window.
 */

const SMS_MAX_CHARS = 160

// Characters excluded from confirmation codes to avoid confusability
const CONFIRM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export interface CriticalSmsParams {
  labCode: string           // short lab identifier e.g. "KBL-04"
  patientIdCode: string     // opaque short ID, NOT name e.g. "A7K9"
  testCode: string          // abbreviated test code e.g. "K+" for Potassium
  value: string             // critical value e.g. "7.2"
  unit: string              // unit e.g. "mmol/L"
  confirmCode: string       // 4-char alphanumeric code for reply confirmation
}

// Fields that must NEVER appear in SMS params — PHI guard
type ForbiddenFields = 'patientName' | 'dateOfBirth' | 'dob' | 'diagnosis' | 'fullName' | 'firstName' | 'lastName'
export type SafeCriticalSmsParams = Omit<CriticalSmsParams, ForbiddenFields>

/**
 * Format a critical value SMS message.
 *
 * PHI guard: if the input object contains any of the forbidden fields
 * (patientName, dateOfBirth, diagnosis etc.) this function throws.
 * Only opaque IDs and coded values are accepted.
 */
export function formatCriticalSms(params: CriticalSmsParams): string {
  // PHI guard — verify forbidden fields are not present in params object
  const forbidden: ForbiddenFields[] = [
    'patientName',
    'dateOfBirth',
    'dob',
    'diagnosis',
    'fullName',
    'firstName',
    'lastName',
  ]
  for (const field of forbidden) {
    if (field in (params as Record<string, unknown>)) {
      throw new Error(`PHI violation: '${field}' is not allowed in SMS params`)
    }
  }

  const { labCode, patientIdCode, value, unit, confirmCode } = params
  let testCode = params.testCode

  // Build the invariant suffix (value + unit + confirm code) — never truncated
  const suffix = ` ${value}${unit} \u2014 Reply CONFIRM ${confirmCode}`
  // Build the invariant prefix
  const prefix = `${labCode} CRITICAL: Pt ${patientIdCode} `

  // Available characters for testCode display
  const maxTestCode = SMS_MAX_CHARS - prefix.length - suffix.length

  if (maxTestCode <= 0) {
    throw new Error('SMS params too long: labCode + patientIdCode exceed character budget')
  }

  if (testCode.length > maxTestCode) {
    testCode = testCode.substring(0, maxTestCode)
  }

  const message = `${prefix}${testCode}${suffix}`

  if (message.length > SMS_MAX_CHARS) {
    throw new Error(`SMS message exceeds ${SMS_MAX_CHARS} characters after formatting`)
  }

  return message
}

/**
 * Generate a unique 4-character alphanumeric confirmation code.
 * Excludes confusable characters: 0, O, 1, I, L.
 */
export function generateConfirmCode(): string {
  let code = ''
  const array = new Uint32Array(4)

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for test environments
    for (let i = 0; i < 4; i++) {
      array[i] = Math.floor(Math.random() * 0xffffffff)
    }
  }

  for (let i = 0; i < 4; i++) {
    code += CONFIRM_CHARS[array[i] % CONFIRM_CHARS.length]
  }
  return code
}

/**
 * Generate a unique message ID for native adapter (no gateway-assigned ID).
 */
export function generateMessageId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 8)
  return `native-${ts}-${rand}`
}

/**
 * Validate that a confirmation code matches the expected format.
 * 4 characters, only characters from CONFIRM_CHARS.
 */
export function isValidConfirmCode(code: string): boolean {
  if (code.length !== 4) return false
  return code.split('').every((ch) => CONFIRM_CHARS.includes(ch))
}

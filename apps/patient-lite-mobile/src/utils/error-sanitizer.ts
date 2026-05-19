/**
 * Error sanitization for patient-facing error display.
 * Strips PHI, stack traces, and internal details. Returns only
 * a safe error category for UI display and issue reporting.
 */

export type ErrorCategory = 'STORAGE' | 'NETWORK' | 'RENDER' | 'UNKNOWN'

export interface SafeError {
  category: ErrorCategory
  type: string
}

const STORAGE_PATTERNS = [
  /quotaexceedederror/i,
  /\bdisk\s+(is\s+full|full|space)/i,
  /\bstorage\b/i,
  /\bsqlite\b/i,
  /sqlite_full/i,
  /\bsqlcipher\b/i,
  /\bindexeddb\b/i,
  /\bno space\b/i,
]

const NETWORK_PATTERNS = [
  /\bnetwork\b/i,
  /\btimeout\b/i,
  /\bfetch failed\b/i,
  /\beconnrefused\b/i,
  /\benotfound\b/i,
  /\boffline\b/i,
]

const KNOWN_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'DOMException',
  'QuotaExceededError',
  'AbortError',
  'NetworkError',
  'NotFoundError',
  'SecurityError',
  'InvalidStateError',
])

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  // DOMException and other Error-like objects (DOMException doesn't extend Error in Node.js)
  if (value != null && typeof (value as Record<string, unknown>).message === 'string') {
    const obj = value as Record<string, unknown>
    const err = new Error(obj.message as string)
    if (typeof obj.name === 'string') err.name = obj.name
    return err
  }
  if (typeof value === 'string') return new Error(value)
  return new Error('Unknown error')
}

function classifyError(error: Error): ErrorCategory {
  const message = error.message ?? ''
  const name = error.name ?? ''
  const combined = `${name} ${message}`

  for (const pattern of STORAGE_PATTERNS) {
    if (pattern.test(combined)) return 'STORAGE'
  }

  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.test(combined)) return 'NETWORK'
  }

  // RangeError / TypeError during render are typically render errors
  if (
    error instanceof RangeError ||
    error instanceof TypeError ||
    error instanceof ReferenceError
  ) {
    return 'RENDER'
  }

  return 'UNKNOWN'
}

/**
 * Sanitize an error for safe display to the patient.
 * - Strips stack traces
 * - Removes any string that could contain PHI
 * - Returns only the error type name (whitelisted) and a generic category
 */
export function sanitizeError(thrown: unknown): SafeError {
  const error = toError(thrown)
  const name = error.name ?? 'Error'
  return {
    category: classifyError(error),
    type: KNOWN_ERROR_NAMES.has(name) ? name : 'Error',
  }
}

/**
 * Returns true if the error is storage-related (quota, corruption, SQLite).
 */
export function isStorageError(thrown: unknown): boolean {
  return classifyError(toError(thrown)) === 'STORAGE'
}

/**
 * Log error in development only. Never logs in production.
 * Raw error content stays local to the developer's console.
 */
export function logErrorDev(error: Error, errorInfo?: { componentStack?: string }): void {
  if (__DEV__) {
    console.error('[ErrorBoundary]', error)
    if (errorInfo?.componentStack) {
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    }
  }
}

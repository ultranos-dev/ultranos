import { sanitizeError, isStorageError, logErrorDev } from '@/utils/error-sanitizer'
import type { SafeError } from '@/utils/error-sanitizer'

describe('error-sanitizer', () => {
  describe('sanitizeError', () => {
    it('returns STORAGE category for QuotaExceededError', () => {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
      const result = sanitizeError(err)
      expect(result.category).toBe('STORAGE')
      expect(result.type).toBe('QuotaExceededError')
    })

    it('returns STORAGE category for SQLite errors', () => {
      const err = new Error('SQLITE_FULL: database or disk is full')
      const result = sanitizeError(err)
      expect(result.category).toBe('STORAGE')
    })

    it('returns STORAGE category for generic storage message', () => {
      const err = new Error('Not enough storage space available')
      const result = sanitizeError(err)
      expect(result.category).toBe('STORAGE')
    })

    it('returns NETWORK category for network errors', () => {
      const err = new TypeError('Network request failed')
      const result = sanitizeError(err)
      expect(result.category).toBe('NETWORK')
    })

    it('returns NETWORK category for timeout errors', () => {
      const err = new Error('Request timeout exceeded')
      const result = sanitizeError(err)
      expect(result.category).toBe('NETWORK')
    })

    it('returns RENDER category for TypeError without network keywords', () => {
      const err = new TypeError('Cannot read properties of undefined')
      const result = sanitizeError(err)
      expect(result.category).toBe('RENDER')
    })

    it('returns RENDER category for RangeError', () => {
      const err = new RangeError('Maximum call stack size exceeded')
      const result = sanitizeError(err)
      expect(result.category).toBe('RENDER')
    })

    it('returns UNKNOWN for unclassifiable errors', () => {
      const err = new Error('Something unexpected happened')
      const result = sanitizeError(err)
      expect(result.category).toBe('UNKNOWN')
    })

    it('never includes stack trace in output', () => {
      const err = new Error('test error with stack')
      err.stack = 'Error: test\n  at Object.<anonymous> (/Users/patient/src/component.tsx:42:5)'
      const result = sanitizeError(err)
      expect(JSON.stringify(result)).not.toContain('stack')
      expect(JSON.stringify(result)).not.toContain('component.tsx')
    })

    it('strips PHI-like patterns — output contains only type and category', () => {
      // Error message might accidentally contain patient data
      const err = new Error('Failed to save record for John Doe DOB: 1990-01-15 MRN: P-12345')
      const result: SafeError = sanitizeError(err)
      // SafeError only has category + type — PHI never leaks
      expect(result).toEqual({
        category: 'UNKNOWN',
        type: 'Error',
      })
      expect(JSON.stringify(result)).not.toContain('John')
      expect(JSON.stringify(result)).not.toContain('1990')
      expect(JSON.stringify(result)).not.toContain('P-12345')
    })

    it('handles errors with missing name gracefully', () => {
      const err = new Error('no name')
      // @ts-expect-error testing edge case
      err.name = undefined
      const result = sanitizeError(err)
      expect(result.category).toBeDefined()
    })

    it('handles non-Error thrown values (string)', () => {
      const result = sanitizeError('something broke')
      expect(result.category).toBe('UNKNOWN')
      expect(result.type).toBe('Error')
    })

    it('handles non-Error thrown values (null)', () => {
      const result = sanitizeError(null)
      expect(result.category).toBe('UNKNOWN')
      expect(result.type).toBe('Error')
    })

    it('handles non-Error thrown values (undefined)', () => {
      const result = sanitizeError(undefined)
      expect(result.category).toBe('UNKNOWN')
      expect(result.type).toBe('Error')
    })

    it('whitelists known error names and replaces unknown ones', () => {
      class PatientRecordError extends Error {
        constructor() {
          super('test')
          this.name = 'PatientRecordError'
        }
      }
      const result = sanitizeError(new PatientRecordError())
      expect(result.type).toBe('Error') // Not 'PatientRecordError'
    })

    it('does not misclassify "database connection refused" as STORAGE', () => {
      const err = new Error('database connection refused')
      const result = sanitizeError(err)
      // "database" alone should not trigger STORAGE — pattern requires storage-specific context
      // This tests the tightened regex; the error contains no storage-specific keywords
      expect(result.category).not.toBe('STORAGE')
    })
  })

  describe('isStorageError', () => {
    it('returns true for storage-related errors', () => {
      expect(isStorageError(new Error('QuotaExceededError'))).toBe(true)
      expect(isStorageError(new Error('SQLITE_FULL'))).toBe(true)
    })

    it('returns false for non-storage errors', () => {
      expect(isStorageError(new Error('Component render failed'))).toBe(false)
      expect(isStorageError(new TypeError('undefined is not a function'))).toBe(false)
    })

    it('handles non-Error values', () => {
      expect(isStorageError(null)).toBe(false)
      expect(isStorageError('string error')).toBe(false)
    })
  })

  describe('logErrorDev', () => {
    it('logs to console.error in dev mode', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const err = new Error('test')
      logErrorDev(err)
      expect(spy).toHaveBeenCalledWith('[ErrorBoundary]', err)
      spy.mockRestore()
    })

    it('logs component stack when provided', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const err = new Error('test')
      logErrorDev(err, { componentStack: '<SomeComponent />' })
      expect(spy).toHaveBeenCalledWith('[ErrorBoundary] Component stack:', '<SomeComponent />')
      spy.mockRestore()
    })
  })
})

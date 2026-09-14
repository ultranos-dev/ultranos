import { describe, it, expect } from 'vitest'
import { classifySyncFailure } from '../failure-classifier.js'

describe('classifySyncFailure', () => {
  it('classifies conflicts (flag or text) first', () => {
    expect(classifySyncFailure(undefined, true)).toBe('conflict')
    expect(classifySyncFailure('Patient X has a conflict')).toBe('conflict')
  })

  it('classifies transport failures', () => {
    expect(classifySyncFailure('HTTP 403')).toBe('serverRejected')
    expect(classifySyncFailure('HTTP 500')).toBe('serverError')
    expect(classifySyncFailure('Failed to fetch')).toBe('networkError')
    expect(classifySyncFailure('request timeout')).toBe('networkError')
  })

  it('classifies encryption/key failures', () => {
    expect(classifySyncFailure('Decrypt error')).toBe('encryptionKey')
    expect(classifySyncFailure('No decryptFn configured for encrypted payload')).toBe('encryptionKey')
  })

  it('classifies Hub op-level rejection codes', () => {
    expect(classifySyncFailure('FORBIDDEN')).toBe('notPermitted')
    expect(classifySyncFailure('UNKNOWN_PRACTITIONER')).toBe('prescriberUnknown')
    expect(classifySyncFailure('MISSING_ORG_CONTEXT')).toBe('clinicNotSetUp')
    expect(classifySyncFailure('Unknown resource type: Foo')).toBe('unsupportedType')
    expect(classifySyncFailure('DUPLICATE_OPEN_ENCOUNTER')).toBe('duplicateVisit')
  })

  it('classifies database rejections as serverRejected', () => {
    expect(classifySyncFailure('invalid input syntax for type uuid: "x:cancelled:2"')).toBe('serverRejected')
    expect(classifySyncFailure('null value in column "org_id" violates not-null constraint')).toBe('serverRejected')
    expect(classifySyncFailure('Hub sync failed: 403')).toBe('serverRejected')
  })

  it('classifies internal/5xx as serverError and empty responses as noResponse', () => {
    expect(classifySyncFailure('Internal error')).toBe('serverError')
    expect(classifySyncFailure('Hub sync failed: 500')).toBe('serverError')
    expect(classifySyncFailure('Empty response from Hub')).toBe('noResponse')
  })

  it('falls back to syncFailed / unknown', () => {
    expect(classifySyncFailure('something unexpected')).toBe('syncFailed')
    expect(classifySyncFailure('')).toBe('unknown')
    expect(classifySyncFailure(undefined)).toBe('unknown')
  })

  it('never leaks a value embedded in a database error (PHI safety)', () => {
    const cat = classifySyncFailure('duplicate key value violates unique constraint; Key (medication_text)=(Insulin) exists')
    expect(cat).toBe('serverRejected')
    expect(cat).not.toContain('Insulin')
  })
})

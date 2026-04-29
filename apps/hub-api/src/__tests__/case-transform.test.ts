import { describe, it, expect } from 'vitest'
import {
  camelToSnake,
  snakeToCamel,
  toSnakeCase,
  toCamelCase,
} from '../lib/case-transform'

describe('camelToSnake', () => {
  it('converts simple camelCase to snake_case', () => {
    expect(camelToSnake('firstName')).toBe('first_name')
  })

  it('converts multiple uppercase letters', () => {
    expect(camelToSnake('createdAt')).toBe('created_at')
    expect(camelToSnake('hlcTimestamp')).toBe('hlc_timestamp')
  })

  it('handles already snake_case strings', () => {
    expect(camelToSnake('first_name')).toBe('first_name')
  })

  it('handles single-word strings', () => {
    expect(camelToSnake('name')).toBe('name')
  })

  it('handles empty strings', () => {
    expect(camelToSnake('')).toBe('')
  })

  it('handles consecutive uppercase (acronyms)', () => {
    expect(camelToSnake('soapNoteId')).toBe('soap_note_id')
  })

  it('handles strings starting with uppercase', () => {
    expect(camelToSnake('FirstName')).toBe('first_name')
  })

  it('handles all-caps acronyms correctly', () => {
    expect(camelToSnake('SOAPNote')).toBe('soap_note')
    expect(camelToSnake('patientID')).toBe('patient_id')
    expect(camelToSnake('FHIRResource')).toBe('fhir_resource')
    expect(camelToSnake('PHI')).toBe('phi')
  })
})

describe('snakeToCamel', () => {
  it('converts simple snake_case to camelCase', () => {
    expect(snakeToCamel('first_name')).toBe('firstName')
  })

  it('converts multiple underscores', () => {
    expect(snakeToCamel('created_at')).toBe('createdAt')
    expect(snakeToCamel('hlc_timestamp')).toBe('hlcTimestamp')
  })

  it('handles already camelCase strings', () => {
    expect(snakeToCamel('firstName')).toBe('firstName')
  })

  it('handles single-word strings', () => {
    expect(snakeToCamel('name')).toBe('name')
  })

  it('handles empty strings', () => {
    expect(snakeToCamel('')).toBe('')
  })
})

describe('toSnakeCase (deep object transform)', () => {
  it('transforms flat object keys from camelCase to snake_case', () => {
    const input = { firstName: 'Ali', birthDate: '1990-01-01' }
    expect(toSnakeCase(input)).toEqual({
      first_name: 'Ali',
      birth_date: '1990-01-01',
    })
  })

  it('transforms nested object keys', () => {
    const input = {
      patientInfo: {
        firstName: 'Ali',
        contactDetails: { phoneNumber: '+971501234567' },
      },
    }
    expect(toSnakeCase(input)).toEqual({
      patient_info: {
        first_name: 'Ali',
        contact_details: { phone_number: '+971501234567' },
      },
    })
  })

  it('transforms arrays of objects', () => {
    const input = [
      { firstName: 'Ali' },
      { firstName: 'Sara' },
    ]
    expect(toSnakeCase(input)).toEqual([
      { first_name: 'Ali' },
      { first_name: 'Sara' },
    ])
  })

  it('handles null and undefined', () => {
    expect(toSnakeCase(null)).toBeNull()
    expect(toSnakeCase(undefined)).toBeUndefined()
  })

  it('passes primitives through unchanged', () => {
    expect(toSnakeCase('hello')).toBe('hello')
    expect(toSnakeCase(42)).toBe(42)
    expect(toSnakeCase(true)).toBe(true)
  })

  it('preserves HLC timestamp strings (stored as strings per guardrails)', () => {
    const input = { hlcTimestamp: '1714300800000:0001:node1' }
    expect(toSnakeCase(input)).toEqual({
      hlc_timestamp: '1714300800000:0001:node1',
    })
  })
})

describe('toCamelCase (deep object transform)', () => {
  it('transforms flat object keys from snake_case to camelCase', () => {
    const input = { first_name: 'Ali', birth_date: '1990-01-01' }
    expect(toCamelCase(input)).toEqual({
      firstName: 'Ali',
      birthDate: '1990-01-01',
    })
  })

  it('transforms nested object keys', () => {
    const input = {
      patient_info: {
        first_name: 'Ali',
        contact_details: { phone_number: '+971501234567' },
      },
    }
    expect(toCamelCase(input)).toEqual({
      patientInfo: {
        firstName: 'Ali',
        contactDetails: { phoneNumber: '+971501234567' },
      },
    })
  })

  it('transforms arrays of objects', () => {
    const input = [
      { first_name: 'Ali' },
      { first_name: 'Sara' },
    ]
    expect(toCamelCase(input)).toEqual([
      { firstName: 'Ali' },
      { firstName: 'Sara' },
    ])
  })

  it('handles null and undefined', () => {
    expect(toCamelCase(null)).toBeNull()
    expect(toCamelCase(undefined)).toBeUndefined()
  })

  it('round-trips with toSnakeCase', () => {
    const original = {
      firstName: 'Ali',
      birthDate: '1990-01-01',
      isActive: true,
      hlcTimestamp: '1714300800000:0001:node1',
    }
    expect(toCamelCase(toSnakeCase(original))).toEqual(original)
  })
})

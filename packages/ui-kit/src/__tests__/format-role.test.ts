import { describe, it, expect } from 'vitest'
import { formatUserRole } from '../format-role'

describe('formatUserRole', () => {
  it('maps ADMIN to Administrator', () => {
    expect(formatUserRole('ADMIN')).toBe('Administrator')
  })

  it('maps DOCTOR to Doctor', () => {
    expect(formatUserRole('DOCTOR')).toBe('Doctor')
  })

  it('maps PHARMACIST to Pharmacist', () => {
    expect(formatUserRole('PHARMACIST')).toBe('Pharmacist')
  })

  it('maps LAB_TECH to Lab Technician', () => {
    expect(formatUserRole('LAB_TECH')).toBe('Lab Technician')
  })

  it('maps CLINICIAN to Clinician (legacy value)', () => {
    expect(formatUserRole('CLINICIAN')).toBe('Clinician')
  })

  it('maps SENIOR_TECH to Senior Technician', () => {
    expect(formatUserRole('SENIOR_TECH')).toBe('Senior Technician')
  })

  it('maps SUPERVISOR to Supervisor', () => {
    expect(formatUserRole('SUPERVISOR')).toBe('Supervisor')
  })

  it('maps LAB_MANAGER to Lab Manager', () => {
    expect(formatUserRole('LAB_MANAGER')).toBe('Lab Manager')
  })

  it('is case-insensitive', () => {
    expect(formatUserRole('admin')).toBe('Administrator')
    expect(formatUserRole('Doctor')).toBe('Doctor')
  })

  it('returns the raw value for unknown roles', () => {
    expect(formatUserRole('UNKNOWN_ROLE')).toBe('UNKNOWN_ROLE')
  })

  it('handles empty string gracefully', () => {
    expect(formatUserRole('')).toBe('')
  })
})

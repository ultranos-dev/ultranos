/**
 * Story 42.5 — Auto-Verification Rules Engine Tests
 * Task 11.1: auto-verify engine correctness
 */
import { describe, it, expect } from 'vitest'
import { evaluateAutoVerification } from '../lib/auto-verify'
import type { AbnormalityFlag } from '../types/authorization'

describe('evaluateAutoVerification', () => {
  const allPass = {
    abnormalityFlags: [] as AbnormalityFlag[],
    qcStatus: 'passing' as const,
    role: 'SENIOR_TECH' as const,
  }

  it('returns eligible when all criteria pass (SENIOR_TECH)', () => {
    const result = evaluateAutoVerification(
      allPass.abnormalityFlags,
      allPass.qcStatus,
      allPass.role,
    )
    expect(result.eligible).toBe(true)
    expect(result.reason).toBe('ALL_CRITERIA_MET')
    expect(result.criteria.noAbnormalFlags).toBe(true)
    expect(result.criteria.qcPassing).toBe(true)
    expect(result.criteria.roleEligible).toBe(true)
    expect(result.criteria.noCriticalValues).toBe(true)
  })

  it('returns eligible for SUPERVISOR role', () => {
    const result = evaluateAutoVerification([], 'passing', 'SUPERVISOR')
    expect(result.eligible).toBe(true)
  })

  it('returns eligible for LAB_MANAGER role', () => {
    const result = evaluateAutoVerification([], 'passing', 'LAB_MANAGER')
    expect(result.eligible).toBe(true)
  })

  it('returns NOT eligible for LAB_TECH role (insufficient role)', () => {
    const result = evaluateAutoVerification([], 'passing', 'LAB_TECH')
    expect(result.eligible).toBe(false)
    expect(result.criteria.roleEligible).toBe(false)
    expect(result.reason).toBe('CRITERIA_NOT_MET')
  })

  it('returns NOT eligible when any abnormal flag present (L)', () => {
    const result = evaluateAutoVerification(['L'], 'passing', 'SENIOR_TECH')
    expect(result.eligible).toBe(false)
    expect(result.criteria.noAbnormalFlags).toBe(false)
  })

  it('returns NOT eligible when any abnormal flag present (H)', () => {
    const result = evaluateAutoVerification(['H'], 'passing', 'SENIOR_TECH')
    expect(result.eligible).toBe(false)
    expect(result.criteria.noAbnormalFlags).toBe(false)
  })

  it('HARD BLOCK: critical flag LL — never eligible regardless of other criteria', () => {
    const result = evaluateAutoVerification(
      ['LL'],
      'passing',
      'SUPERVISOR',
    )
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('CRITICAL_VALUE_PRESENT')
    // criteria still evaluated but hard-blocked
    expect(result.criteria.noCriticalValues).toBe(false)
  })

  it('HARD BLOCK: critical flag HH — never eligible regardless of other criteria', () => {
    const result = evaluateAutoVerification(
      ['HH'],
      'passing',
      'LAB_MANAGER',
    )
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('CRITICAL_VALUE_PRESENT')
  })

  it('HARD BLOCK: mixed flags with HH — critical block wins', () => {
    const result = evaluateAutoVerification(
      ['L', 'HH'],
      'passing',
      'SUPERVISOR',
    )
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('CRITICAL_VALUE_PRESENT')
  })

  it('returns NOT eligible when QC is failing', () => {
    const result = evaluateAutoVerification([], 'failing', 'SENIOR_TECH')
    expect(result.eligible).toBe(false)
    expect(result.criteria.qcPassing).toBe(false)
    expect(result.reason).toBe('CRITERIA_NOT_MET')
  })

  it('returns NOT eligible when multiple criteria fail', () => {
    const result = evaluateAutoVerification(['H'], 'failing', 'LAB_TECH')
    expect(result.eligible).toBe(false)
    expect(result.criteria.noAbnormalFlags).toBe(false)
    expect(result.criteria.qcPassing).toBe(false)
    expect(result.criteria.roleEligible).toBe(false)
  })

  it('returns structured evaluation with all criteria present', () => {
    const result = evaluateAutoVerification([], 'passing', 'SENIOR_TECH')
    expect(result).toHaveProperty('eligible')
    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('criteria')
    expect(result.criteria).toHaveProperty('noAbnormalFlags')
    expect(result.criteria).toHaveProperty('qcPassing')
    expect(result.criteria).toHaveProperty('roleEligible')
    expect(result.criteria).toHaveProperty('noCriticalValues')
  })
})

import { describe, it, expect } from 'vitest'
import { buildNotificationContent, NON_PHI_PARAM_KEYS } from '@/lib/notification-content'

describe('buildNotificationContent', () => {
  it('maps ORDER_RECEIVED to Lab Lite with test category param', () => {
    const c = buildNotificationContent('ORDER_RECEIVED', { testCategory: 'Hemoglobin', orderId: 'o1' })
    expect(c.sourceApp).toBe('LAB_LITE')
    expect(c.subjectKey).toBe('ORDER_RECEIVED')
    expect(c.bodyKey).toBe('orderReceivedBody')
    expect(c.bodyParams.testCategory).toBe('Hemoglobin')
    expect(c.notesKey).toBe('orderReceivedNotes')
  })

  it('maps PRESCRIPTION_DISPENSED to Pharmacy Lite', () => {
    expect(buildNotificationContent('PRESCRIPTION_DISPENSED', {}).sourceApp).toBe('PHARMACY_LITE')
  })

  it('falls back to SYSTEM/default for unknown types', () => {
    const c = buildNotificationContent('TOTALLY_NEW_TYPE', {})
    expect(c.sourceApp).toBe('SYSTEM')
    expect(c.subjectKey).toBe('default')
  })

  it('never copies PHI-shaped payload keys into bodyParams', () => {
    const c = buildNotificationContent('LAB_RESULT_AVAILABLE', {
      testCategory: 'CBC', labName: 'Central',
      patientName: 'Jane Doe', diagnosis: 'X', resultValue: '12.3', nationalId: '123',
    })
    const keys = Object.keys(c.bodyParams)
    expect(keys).not.toContain('patientName')
    expect(keys).not.toContain('diagnosis')
    expect(keys).not.toContain('resultValue')
    expect(keys).not.toContain('nationalId')
    expect(keys.every(k => NON_PHI_PARAM_KEYS.includes(k as any))).toBe(true)
  })

  it('includes pathogen in bodyParams for outbreak type', () => {
    const c = buildNotificationContent('OUTBREAK_MODE_ACTIVATED', {
      pathogen: 'salmonella',
      patientName: 'John Smith',
      diagnosis: 'Confirmed case',
    })
    expect(c.bodyParams.pathogen).toBe('salmonella')
    expect(c.bodyParams).not.toHaveProperty('patientName')
    expect(c.bodyParams).not.toHaveProperty('diagnosis')
    const keys = Object.keys(c.bodyParams)
    expect(keys.every(k => NON_PHI_PARAM_KEYS.includes(k as any))).toBe(true)
  })

  it('returns defaultBody for unknown type', () => {
    const c = buildNotificationContent('TOTALLY_NEW_TYPE', {})
    expect(c.bodyKey).toBe('defaultBody')
  })

  it('maps KYC_MORE_INFO_REQUESTED to Admin', () => {
    const c = buildNotificationContent('KYC_MORE_INFO_REQUESTED', {})
    expect(c.sourceApp).toBe('ADMIN')
    expect(c.subjectKey).toBe('KYC_MORE_INFO_REQUESTED')
  })
})

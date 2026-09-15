import { describe, it, expect } from 'vitest'
import type { MedicationLabMapping, DispenseMonitoringEventDTO } from '../monitoring'

describe('monitoring shared types', () => {
  it('MedicationLabMapping is ATC-keyed', () => {
    const m: MedicationLabMapping = { atcCode: 'B01AA03', medicationDisplay: 'Warfarin', version: 1, requiredTests: [{ loincCode: '6301-6', testDisplay: 'INR', frequencyDays: 14, initialDelayDays: 3, priority: 'urgent' }] }
    expect(m.atcCode).toBe('B01AA03')
  })
  it('DispenseMonitoringEventDTO carries a blind patientRef, never a raw uuid field', () => {
    const e: DispenseMonitoringEventDTO = { dispensingEventId: 'd1', patientRef: 'Patient/abc', patientFirstName: 'Ali', patientAge: 40, atcCode: 'B01AA03', medicationDisplay: 'Warfarin', dispensedAt: '2026-09-15', orderingPractitionerRef: 'ref', hlcTimestamp: '1' }
    expect('patientId' in e).toBe(false)
  })
})

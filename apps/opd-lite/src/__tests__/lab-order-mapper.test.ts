import { describe, it, expect } from 'vitest'
import {
  mapInputToServiceRequest,
  readLabOrderDisplay,
  isLabOrderLocked,
  applyInputToServiceRequest,
  type LabOrderInput,
} from '@/lib/lab-order-mapper'

const ctx = { encounterId: 'enc1', patientId: 'pat1', practitionerRef: 'Practitioner/doc1' }
const baseInput: LabOrderInput = {
  testCode: '58410-2',
  testDisplay: 'Complete blood count (CBC) panel',
  priority: 'urgent',
  reasonText: 'Rule out anemia',
  specialInstructions: 'Fasting',
  labId: 'lab1',
  labName: 'Central Lab',
}

describe('readLabOrderDisplay', () => {
  it('projects the enriched view model from a ServiceRequest', () => {
    const d = readLabOrderDisplay(mapInputToServiceRequest(baseInput, ctx))
    expect(d).toMatchObject({
      testName: 'Complete blood count (CBC) panel',
      code: '58410-2',
      category: 'Hematology',
      priority: 'urgent',
      reason: 'Rule out anemia',
      specialInstructions: 'Fasting',
      labName: 'Central Lab',
      status: 'active',
      locked: false,
    })
  })

  it('defaults priority to routine and omits absent fields', () => {
    const d = readLabOrderDisplay(
      mapInputToServiceRequest({ testCode: '718-7', testDisplay: 'Hemoglobin' }, ctx),
    )
    expect(d.priority).toBe('routine')
    expect(d.reason).toBeUndefined()
    expect(d.labName).toBeUndefined()
    expect(d.category).toBe('Hematology')
  })

  it('leaves category undefined for an unknown code', () => {
    const d = readLabOrderDisplay(
      mapInputToServiceRequest({ testCode: '00000-0', testDisplay: 'Mystery' }, ctx),
    )
    expect(d.category).toBeUndefined()
  })
})

describe('isLabOrderLocked', () => {
  it('is false for an active order with no receivedAt', () => {
    expect(isLabOrderLocked(mapInputToServiceRequest(baseInput, ctx))).toBe(false)
  })

  it('is true once status is no longer active', () => {
    const sr = { ...mapInputToServiceRequest(baseInput, ctx), status: 'on-hold' as const }
    expect(isLabOrderLocked(sr)).toBe(true)
  })

  it('is true when receivedAt is set even if still active', () => {
    const base = mapInputToServiceRequest(baseInput, ctx)
    const sr = { ...base, _ultranos: { ...base._ultranos, receivedAt: '2026-09-12T00:00:00.000Z' } }
    expect(isLabOrderLocked(sr)).toBe(true)
  })
})

describe('applyInputToServiceRequest', () => {
  it('replaces editable fields while preserving identity, provenance, lab, and received state', () => {
    const existing = mapInputToServiceRequest(baseInput, ctx)
    existing._ultranos.receivedAt = '2026-09-12T00:00:00.000Z' // must survive an edit

    const updated = applyInputToServiceRequest(existing, {
      testCode: '2345-7',
      testDisplay: 'Glucose',
      priority: 'stat',
      reasonText: 'Hyperglycemia',
    })

    expect(updated.id).toBe(existing.id)
    expect(updated.authoredOn).toBe(existing.authoredOn)
    expect(updated._ultranos.createdAt).toBe(existing._ultranos.createdAt)
    expect(updated._ultranos.receivedAt).toBe('2026-09-12T00:00:00.000Z')
    expect(updated.performer).toEqual(existing.performer)
    expect(updated.code.text).toBe('Glucose')
    expect(updated.code.coding?.[0]?.code).toBe('2345-7')
    expect(updated.priority).toBe('stat')
    expect(updated.reasonCode?.[0]?.text).toBe('Hyperglycemia')
    expect(Number(updated.meta.versionId)).toBe(Number(existing.meta.versionId) + 1)
    expect(updated._ultranos.hlcTimestamp).not.toBe(existing._ultranos.hlcTimestamp)
  })

  it('drops optional fields that are cleared in the edit', () => {
    const existing = mapInputToServiceRequest(baseInput, ctx)
    const updated = applyInputToServiceRequest(existing, {
      testCode: '718-7',
      testDisplay: 'Hemoglobin',
    })
    expect(updated.reasonCode).toBeUndefined()
    expect(updated._ultranos.specialInstructions).toBeUndefined()
    expect(updated.priority).toBeUndefined()
  })
})

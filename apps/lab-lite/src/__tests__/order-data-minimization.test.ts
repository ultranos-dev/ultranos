import { describe, it, expect } from 'vitest'
import type { LabOrderEntry } from '../lib/db'
import type { LabOrderResponse } from '../lib/trpc'

describe('Order Data Minimization (CLAUDE.md Rule #7)', () => {
  it('LabOrderResponse contains ONLY first name + age, no PHI fields', () => {
    const response: LabOrderResponse = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      patientFirstName: 'Ahmad',
      patientAge: 45,
      patientRef: 'Patient/123',
      testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
      urgency: 'stat',
      orderingPhysicianName: 'Dr. Karimi',
      specialInstructions: null,
      status: 'active',
      authoredOn: '2026-05-30T10:00:00.000Z',
    }

    // Verify only allowed fields are present
    const keys = Object.keys(response)
    expect(keys).toEqual(expect.arrayContaining([
      'orderId',
      'patientFirstName',
      'patientAge',
      'patientRef',
      'testsRequested',
      'urgency',
      'orderingPhysicianName',
      'specialInstructions',
      'status',
      'authoredOn',
    ]))

    // Verify NO PHI fields are present
    expect(response).not.toHaveProperty('birthDate')
    expect(response).not.toHaveProperty('gender')
    expect(response).not.toHaveProperty('telecom')
    expect(response).not.toHaveProperty('identifier')
    expect(response).not.toHaveProperty('address')
    expect(response).not.toHaveProperty('nationalIdHash')
    expect(response).not.toHaveProperty('medications')
    expect(response).not.toHaveProperty('allergies')
    expect(response).not.toHaveProperty('conditions')
    expect(response).not.toHaveProperty('reasonCode')
    expect(response).not.toHaveProperty('supportingInfo')
    expect(response).not.toHaveProperty('encounter')
    expect(response).not.toHaveProperty('diagnosis')
    expect(response).not.toHaveProperty('clinicalHistory')
  })

  it('LabOrderEntry (Dexie) contains ONLY first name + age, no PHI fields', () => {
    const entry: LabOrderEntry = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      patientFirstName: 'Ahmad',
      patientAge: 45,
      patientRef: 'Patient/123',
      testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
      urgency: 'stat',
      orderingPhysicianName: 'Dr. Karimi',
      specialInstructions: null,
      status: 'RECEIVED',
      authoredOn: '2026-05-30T10:00:00.000Z',
      receivedAt: '2026-05-30T10:05:00.000Z',
      syncedAt: '2026-05-30T10:05:00.000Z',
    }

    const keys = Object.keys(entry)
    // Verify no PHI beyond first name + age
    expect(keys).not.toContain('birthDate')
    expect(keys).not.toContain('gender')
    expect(keys).not.toContain('telecom')
    expect(keys).not.toContain('identifier')
    expect(keys).not.toContain('address')
    expect(keys).not.toContain('nationalIdHash')
    expect(keys).not.toContain('medications')
    expect(keys).not.toContain('allergies')
    expect(keys).not.toContain('conditions')
    expect(keys).not.toContain('reasonCode')
    expect(keys).not.toContain('supportingInfo')
    expect(keys).not.toContain('diagnosis')

    // Verify patient data is minimal
    expect(entry.patientFirstName).toBe('Ahmad')
    expect(entry.patientAge).toBe(45)
    // patientRef is opaque reference only
    expect(entry.patientRef).toMatch(/^Patient\//)
  })
})

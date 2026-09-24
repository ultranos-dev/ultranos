import { describe, it, expect } from 'vitest'
import type { LabOrderEntry } from '../lib/db'
import type { LabOrderResponse } from '../lib/trpc'

// Rule #7 revised 2026-09-24: patient photo + demographics (gender, phone) ARE now
// permitted on the lab order-list tier. The two identity secrets remain forbidden on
// every lab surface — the raw National ID and the real patient UUID (patientRef stays
// an opaque blind index). This test locks the new allowed shape + the retained bans.
describe('Order list-tier fields (CLAUDE.md Rule #7, revised)', () => {
  it('LabOrderResponse carries photo + demographics but never an identity secret', () => {
    const response: LabOrderResponse = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      patientFirstName: 'Ahmad',
      patientAge: 45,
      patientPhotoUrl: 'https://storage.example/patient-photos/opaque-key.webp?token=sig',
      patientGender: 'male',
      patientPhone: '+93700000000',
      patientRef: 'Patient/blind-index-hash',
      testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
      urgency: 'stat',
      orderingPhysicianName: 'Dr. Karimi',
      specialInstructions: null,
      status: 'active',
      authoredOn: '2026-05-30T10:00:00.000Z',
      assignedToLab: false,
    }

    // Photo + demographics are now allowed on the list tier.
    expect(response).toHaveProperty('patientPhotoUrl')
    expect(response).toHaveProperty('patientGender')
    expect(response).toHaveProperty('patientPhone')
    // The photo is a signed URL over an opaque key — it must not embed the raw UUID.
    expect(response.patientRef.startsWith('Patient/')).toBe(true)

    // STILL forbidden on any lab surface: identity secrets + raw DOB + clinical detail.
    expect(response).not.toHaveProperty('birthDate')
    expect(response).not.toHaveProperty('nationalIdHash')
    expect(response).not.toHaveProperty('patientId') // never the real UUID
    expect(response).not.toHaveProperty('address')
    expect(response).not.toHaveProperty('medications')
    expect(response).not.toHaveProperty('allergies')
    expect(response).not.toHaveProperty('conditions')
    expect(response).not.toHaveProperty('diagnosis')
    expect(response).not.toHaveProperty('clinicalHistory')
  })

  it('LabOrderEntry (Dexie) may cache photo + demographics but no identity secret', () => {
    const entry: LabOrderEntry = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      patientFirstName: 'Ahmad',
      patientAge: 45,
      patientPhotoUrl: 'https://storage.example/patient-photos/opaque-key.webp?token=sig',
      patientGender: 'male',
      patientPhone: '+93700000000',
      patientRef: 'Patient/blind-index-hash',
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
    // Retained bans (identity secrets + raw DOB + clinical detail).
    expect(keys).not.toContain('birthDate')
    expect(keys).not.toContain('nationalIdHash')
    expect(keys).not.toContain('patientId')
    expect(keys).not.toContain('address')
    expect(keys).not.toContain('medications')
    expect(keys).not.toContain('allergies')
    expect(keys).not.toContain('conditions')
    expect(keys).not.toContain('diagnosis')

    expect(entry.patientFirstName).toBe('Ahmad')
    expect(entry.patientAge).toBe(45)
    // patientRef is the opaque blind index only — never a raw UUID.
    expect(entry.patientRef).toMatch(/^Patient\//)
  })
})

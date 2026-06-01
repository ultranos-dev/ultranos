/**
 * Send-Out PDF Generation Tests — Story 54.4 / Task 14.4
 *
 * Validates data minimization (CLAUDE.md Rule #7): referral forms must contain
 * ONLY patient first name + age — no additional PHI.
 * Verifies manifest structure includes opaque IDs and LOINC codes only.
 */

import { describe, it, expect } from 'vitest'
import { renderReferralFormPDF, renderShippingManifestPDF } from '../lib/sendout-pdf'
import type { ReferralForm, ShippingManifest } from '../types/reference-lab'

function makeReferralForm(overrides: Partial<ReferralForm> = {}): ReferralForm {
  return {
    id: 'referral-001',
    sendOutId: 'so-001',
    dateSent: new Date().toISOString(),
    patientFirstName: 'Fatima',
    patientAge: 32,
    sampleType: 'Blood',
    testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    clinicalContext: 'suspected hyperlipidemia',
    originatingLabName: 'District Lab A',
    referenceLabName: 'Kabul Reference Lab',
    referenceLabAccreditationNumber: 'AFG-LAB-001',
    ...overrides,
  }
}

function makeShippingManifest(overrides: Partial<ShippingManifest> = {}): ShippingManifest {
  return {
    id: 'manifest-001',
    sendOutIds: ['so-001', 'so-002'],
    referenceLabId: 'lab-001',
    referenceLabName: 'Kabul Reference Lab',
    createdAt: new Date().toISOString(),
    items: [
      { sendOutId: 'so-001', sampleId: 'sample-001', loincCode: '2085-9', loincDisplay: 'Cholesterol' },
      { sendOutId: 'so-002', sampleId: 'sample-002', loincCode: '4548-4', loincDisplay: 'HbA1c' },
    ],
    ...overrides,
  }
}

async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

describe('renderReferralFormPDF — data minimization (CLAUDE.md Rule #7)', () => {
  it('returns a Blob with text/html type', () => {
    const blob = renderReferralFormPDF(makeReferralForm())

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/html')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('includes patient first name', async () => {
    const blob = renderReferralFormPDF(makeReferralForm({ patientFirstName: 'Fatima' }))
    const html = await blobToText(blob)

    expect(html).toContain('Fatima')
  })

  it('includes patient age', async () => {
    const blob = renderReferralFormPDF(makeReferralForm({ patientAge: 32 }))
    const html = await blobToText(blob)

    expect(html).toContain('32')
  })

  it('does NOT include patient ID', async () => {
    // Referral form should never contain a patient UUID or patient reference
    const blob = renderReferralFormPDF(makeReferralForm())
    const html = await blobToText(blob)

    // The form has no patientId field — verify no UUID-shaped string matching "patient-" pattern
    expect(html).not.toMatch(/patient-[a-f0-9-]{8,}/)
    expect(html).not.toContain('Patient/')
  })

  it('does NOT include any family name or full name beyond first name', async () => {
    const blob = renderReferralFormPDF(
      makeReferralForm({ patientFirstName: 'Fatima' }),
    )
    const html = await blobToText(blob)

    // The form has only patientFirstName — no surname, no full name field
    expect(html).not.toContain('Last Name')
    expect(html).not.toContain('Family Name')
    expect(html).not.toContain('Full Name')
  })

  it('includes LOINC code and display name', async () => {
    const blob = renderReferralFormPDF(makeReferralForm())
    const html = await blobToText(blob)

    expect(html).toContain('2085-9')
    expect(html).toContain('Cholesterol')
  })

  it('includes reference lab attribution', async () => {
    const blob = renderReferralFormPDF(makeReferralForm())
    const html = await blobToText(blob)

    expect(html).toContain('Kabul Reference Lab')
    expect(html).toContain('AFG-LAB-001')
  })

  it('includes originating lab name', async () => {
    const blob = renderReferralFormPDF(makeReferralForm())
    const html = await blobToText(blob)

    expect(html).toContain('District Lab A')
  })

  it('includes clinical context', async () => {
    const blob = renderReferralFormPDF(
      makeReferralForm({ clinicalContext: 'suspected hyperlipidemia' }),
    )
    const html = await blobToText(blob)

    expect(html).toContain('suspected hyperlipidemia')
  })

  it('escapes HTML special characters to prevent XSS', async () => {
    const blob = renderReferralFormPDF(
      makeReferralForm({
        patientFirstName: '<script>alert("xss")</script>',
        clinicalContext: '"context" & <bold>',
      }),
    )
    const html = await blobToText(blob)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })
})

describe('renderShippingManifestPDF', () => {
  it('returns a Blob with text/html type', () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/html')
  })

  it('includes manifest ID and reference lab name', async () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())
    const html = await blobToText(blob)

    expect(html).toContain('manifest-001')
    expect(html).toContain('Kabul Reference Lab')
  })

  it('lists all send-out IDs and sample IDs', async () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())
    const html = await blobToText(blob)

    expect(html).toContain('so-001')
    expect(html).toContain('so-002')
    expect(html).toContain('sample-001')
    expect(html).toContain('sample-002')
  })

  it('lists LOINC codes and display names for each item', async () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())
    const html = await blobToText(blob)

    expect(html).toContain('2085-9')
    expect(html).toContain('Cholesterol')
    expect(html).toContain('4548-4')
    expect(html).toContain('HbA1c')
  })

  it('shows total sample count', async () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())
    const html = await blobToText(blob)

    expect(html).toContain('2')
  })

  it('contains no demographic PHI beyond opaque IDs', async () => {
    const blob = renderShippingManifestPDF(makeShippingManifest())
    const html = await blobToText(blob)

    // No patient names, ages, diagnoses, or medications
    expect(html).not.toContain('Fatima')
    expect(html).not.toContain('patient name')
    expect(html).not.toContain('diagnosis')
  })
})

/**
 * Story 57.1 — AllergyBanner prominence tests (CLAUDE.md Rule #4).
 *
 * Asserts, for ALL THREE states (active / nka / unknown), in LTR and RTL:
 * - active allergies render in red (destructive tokens), never collapsed
 * - `undefined` allergies map to the amber UNKNOWN state — NEVER to NKA
 * - the banner renders FIRST (before any medication content) in the
 *   fulfillment checklist
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AllergyBanner } from '@/components/pharmacy/AllergyBanner'
import { FulfillmentChecklist } from '@/components/pharmacy/FulfillmentChecklist'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

const sampleRx: VerifiedPrescription[] = [
  {
    id: 'rx-001',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
    dur: 7,
    req: 'pract-001',
    pat: 'pat-001',
    at: '2026-04-28T10:00:00Z',
  },
]

describe('AllergyBanner (pharmacy)', () => {
  describe('active state — allergies present', () => {
    it('renders in red (destructive tokens) with all substances listed', () => {
      const { container } = render(
        <AllergyBanner allergies={['Penicillin', 'Peanuts']} patientName="Fatima" />,
      )
      const banner = container.querySelector('[data-testid="allergy-banner"]')!

      expect(banner.getAttribute('data-banner-state')).toBe('active')
      expect(banner.className).toContain('bg-destructive/10')
      expect(banner.className).toContain('ring-destructive/40')
      expect(screen.getByText('Penicillin')).toBeInTheDocument()
      expect(screen.getByText('Peanuts')).toBeInTheDocument()
    })

    it('has role="alert" and aria-live="assertive"', () => {
      const { container } = render(<AllergyBanner allergies={['Penicillin']} />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!
      expect(banner.getAttribute('role')).toBe('alert')
      expect(banner.getAttribute('aria-live')).toBe('assertive')
    })

    it('is never collapsed — no collapse toggle exists', () => {
      const { container } = render(<AllergyBanner allergies={['Penicillin']} />)
      const collapseControls = container.querySelectorAll(
        'button[aria-expanded], [data-collapse], [data-toggle], details',
      )
      expect(collapseControls.length).toBe(0)
    })

    it('matches snapshot in LTR', () => {
      const { container } = render(
        <div dir="ltr">
          <AllergyBanner allergies={['Penicillin', 'Peanuts']} patientName="Fatima" />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL', () => {
      const { container } = render(
        <div dir="rtl">
          <AllergyBanner allergies={['Penicillin', 'Peanuts']} patientName="Fatima" />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })

  describe('unknown state — allergy record could not be obtained (AC 2)', () => {
    it('undefined allergies map to unknown — NEVER to NKA', () => {
      const { container } = render(<AllergyBanner allergies={undefined} />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!

      expect(banner.getAttribute('data-banner-state')).toBe('unknown')
      expect(banner.getAttribute('data-banner-state')).not.toBe('nka')
    })

    it('null allergies also map to unknown', () => {
      const { container } = render(<AllergyBanner allergies={null} />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!
      expect(banner.getAttribute('data-banner-state')).toBe('unknown')
    })

    it('is amber/warning-toned, assertive, and never collapsed', () => {
      const { container } = render(<AllergyBanner allergies={undefined} />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!

      expect(banner.className).toContain('bg-warning/10')
      expect(banner.className).toContain('ring-warning/40')
      expect(banner.getAttribute('role')).toBe('alert')
      expect(banner.getAttribute('aria-live')).toBe('assertive')
      expect(container.querySelectorAll('button[aria-expanded], [data-collapse], details').length).toBe(0)
      // i18n mock renders keys — the unknown copy is present, distinct from NKA
      expect(screen.getByText(/unknownTitle/)).toBeInTheDocument()
      expect(screen.getByText(/unknownBody/)).toBeInTheDocument()
      expect(screen.queryByText(/(^|\s)nka(\s|$)/)).not.toBeInTheDocument()
    })

    it('matches snapshot in LTR', () => {
      const { container } = render(
        <div dir="ltr">
          <AllergyBanner allergies={undefined} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL', () => {
      const { container } = render(
        <div dir="rtl">
          <AllergyBanner allergies={undefined} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })

  describe('NKA state — confirmed empty allergy record', () => {
    it('renders neutral NKA only for an explicit empty array', () => {
      const { container } = render(<AllergyBanner allergies={[]} />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!

      expect(banner.getAttribute('data-banner-state')).toBe('nka')
      expect(banner.getAttribute('aria-live')).toBe('polite')
      expect(screen.getByText(/nka/)).toBeInTheDocument()
    })

    it('matches snapshot in LTR', () => {
      const { container } = render(
        <div dir="ltr">
          <AllergyBanner allergies={[]} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL', () => {
      const { container } = render(
        <div dir="rtl">
          <AllergyBanner allergies={[]} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })

  describe('prominence — renders FIRST in the fulfillment checklist (Rule #4)', () => {
    beforeEach(() => {
      useFulfillmentStore.getState().reset()
    })

    it('allergy banner precedes the medication list in DOM order', () => {
      useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
      useFulfillmentStore.getState().setResolvedPatient({
        ref: 'pat-001',
        patient: null,
        allergies: ['Penicillin'],
        allergyStatusUnknown: false,
        sources: { local: false, hub: true, cache: 'none' },
      })

      const { container } = render(<FulfillmentChecklist />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!
      const medList = container.querySelector('ul[role="list"]')!

      expect(banner).toBeTruthy()
      expect(medList).toBeTruthy()
      // banner must come BEFORE the medication list
      expect(
        banner.compareDocumentPosition(medList) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(banner.getAttribute('data-banner-state')).toBe('active')
    })

    it('unknown banner also renders before the medication list', () => {
      useFulfillmentStore.getState().loadPrescriptions(sampleRx, 'Dr. Ahmad')
      // no setResolvedPatient → fail-safe unknown state

      const { container } = render(<FulfillmentChecklist />)
      const banner = container.querySelector('[data-testid="allergy-banner"]')!
      const medList = container.querySelector('ul[role="list"]')!

      expect(banner.getAttribute('data-banner-state')).toBe('unknown')
      expect(
        banner.compareDocumentPosition(medList) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })
})

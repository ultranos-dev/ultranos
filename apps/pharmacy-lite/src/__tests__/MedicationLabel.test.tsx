import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { FulfillmentItem } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

// Import component — does not exist yet (RED phase)
import { MedicationLabel } from '@/components/pharmacy/MedicationLabel'

function makeItem(overrides: Partial<VerifiedPrescription> = {}): FulfillmentItem {
  return {
    prescription: {
      id: 'rx-001',
      med: 'AMX500',
      medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7,
      req: 'pract-001',
      pat: 'pat-001',
      at: '2026-04-28T10:00:00Z',
      ...overrides,
    },
    selected: true,
    brandName: 'Amoxil',
    batchLot: 'LOT-2026-04A',
  }
}

describe('MedicationLabel', () => {
  // AC 3: Patient Label view with clear, low-literacy instructions
  describe('AC 3: Low-literacy patient label', () => {
    it('renders medication name prominently', () => {
      render(<MedicationLabel item={makeItem()} />)
      expect(screen.getByTestId('label-med-name')).toHaveTextContent('Amoxicillin 500mg Capsule')
    })

    it('renders brand name when provided', () => {
      render(<MedicationLabel item={makeItem()} />)
      expect(screen.getByTestId('label-brand-name')).toHaveTextContent('Amoxil')
    })

    it('renders dosage quantity and unit', () => {
      render(<MedicationLabel item={makeItem()} />)
      expect(screen.getByTestId('label-dosage')).toHaveTextContent(/1 capsule/)
    })

    it('renders duration', () => {
      render(<MedicationLabel item={makeItem()} />)
      expect(screen.getByTestId('label-duration')).toHaveTextContent(/7 days/)
    })

    it('renders dosage timing icons for morning (Sun icon)', () => {
      // 3x daily should include morning icon
      render(<MedicationLabel item={makeItem({ dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' } })} />)
      expect(screen.getByTestId('timing-icon-morning')).toBeInTheDocument()
    })

    it('renders dosage timing icons for noon (Food icon)', () => {
      // 3x daily should include noon icon
      render(<MedicationLabel item={makeItem({ dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' } })} />)
      expect(screen.getByTestId('timing-icon-noon')).toBeInTheDocument()
    })

    it('renders dosage timing icons for night (Moon icon)', () => {
      // 3x daily should include night icon
      render(<MedicationLabel item={makeItem({ dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' } })} />)
      expect(screen.getByTestId('timing-icon-night')).toBeInTheDocument()
    })

    it('renders only morning and night icons for 2x daily', () => {
      render(<MedicationLabel item={makeItem({ dos: { qty: 1, unit: 'tablet', freqN: 2, per: 1, perU: 'd' } })} />)
      expect(screen.getByTestId('timing-icon-morning')).toBeInTheDocument()
      expect(screen.getByTestId('timing-icon-night')).toBeInTheDocument()
      expect(screen.queryByTestId('timing-icon-noon')).not.toBeInTheDocument()
    })

    it('renders only morning icon for 1x daily', () => {
      render(<MedicationLabel item={makeItem({ dos: { qty: 1, unit: 'tablet', freqN: 1, per: 1, perU: 'd' } })} />)
      expect(screen.getByTestId('timing-icon-morning')).toBeInTheDocument()
      expect(screen.queryByTestId('timing-icon-noon')).not.toBeInTheDocument()
      expect(screen.queryByTestId('timing-icon-night')).not.toBeInTheDocument()
    })

    it('renders batch/lot number when provided', () => {
      render(<MedicationLabel item={makeItem()} />)
      expect(screen.getByTestId('label-batch')).toHaveTextContent('LOT-2026-04A')
    })

    it('omits batch/lot when empty', () => {
      const item = makeItem()
      item.batchLot = ''
      render(<MedicationLabel item={item} />)
      expect(screen.queryByTestId('label-batch')).not.toBeInTheDocument()
    })
  })

  // AC 5: RTL support for patient instructions
  describe('AC 5: RTL support', () => {
    it('renders with dir="auto" for bidirectional text support', () => {
      render(<MedicationLabel item={makeItem()} />)
      const label = screen.getByTestId('medication-label')
      expect(label.getAttribute('dir')).toBe('auto')
    })

    it('renders correctly in RTL mode when dir is set', () => {
      render(<MedicationLabel item={makeItem()} dir="rtl" />)
      const label = screen.getByTestId('medication-label')
      expect(label.getAttribute('dir')).toBe('rtl')
    })
  })

  // Print support
  describe('Print support', () => {
    it('has a print-friendly class on the label container', () => {
      render(<MedicationLabel item={makeItem()} />)
      const label = screen.getByTestId('medication-label')
      expect(label.className).toContain('print-label')
    })
  })

  // RTL snapshot tests (CLAUDE.md requirement)
  describe('RTL snapshot tests', () => {
    it('matches snapshot in LTR mode', () => {
      const { container } = render(
        <div dir="ltr">
          <MedicationLabel item={makeItem()} dir="ltr" />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL mode', () => {
      const { container } = render(
        <div dir="rtl">
          <MedicationLabel item={makeItem()} dir="rtl" locale="ar" />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })

  // Localization
  describe('Localization', () => {
    it('renders Arabic timing labels when locale is ar', () => {
      render(<MedicationLabel item={makeItem()} locale="ar" />)
      expect(screen.getByText('صباح')).toBeInTheDocument()
      expect(screen.getByText('ظهر')).toBeInTheDocument()
      expect(screen.getByText('مساء')).toBeInTheDocument()
    })
  })
})

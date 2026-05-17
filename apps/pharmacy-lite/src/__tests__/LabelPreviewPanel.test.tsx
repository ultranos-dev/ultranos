import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FulfillmentItem } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

import { LabelPreviewPanel } from '@/components/pharmacy/LabelPreviewPanel'

function makeItem(overrides: Partial<VerifiedPrescription> = {}, fulfillmentOverrides: Partial<FulfillmentItem> = {}): FulfillmentItem {
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
      at: '2026-05-12T10:00:00Z',
      ...overrides,
    },
    selected: true,
    brandName: 'Amoxil',
    batchLot: 'LOT-2026-04A',
    ...fulfillmentOverrides,
  }
}

describe('LabelPreviewPanel', () => {
  describe('Task 1: Label preview step (AC #1, #5)', () => {
    it('renders a MedicationLabel for each dispensed item', () => {
      const items = [
        makeItem(),
        makeItem(
          { id: 'rx-002', medT: 'Ibuprofen 400mg Tablet' },
          { brandName: 'Brufen', batchLot: 'LOT-2026-05B' },
        ),
      ]
      render(<LabelPreviewPanel items={items} />)

      const labels = screen.getAllByTestId('medication-label')
      expect(labels).toHaveLength(2)
    })

    it('renders medication name on each label', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.getByTestId('label-med-name')).toHaveTextContent('Amoxicillin 500mg Capsule')
    })

    it('renders pharmacy name on each label when provided', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} pharmacyName="Al-Noor Pharmacy" />)

      expect(screen.getByTestId('label-pharmacy-name')).toHaveTextContent('Al-Noor Pharmacy')
    })

    it('renders dispensing date on each label', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} dispensingDate="2026-05-12" />)

      expect(screen.getByTestId('label-date')).toBeInTheDocument()
    })

    it('renders batch/lot number on labels', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.getByTestId('label-batch')).toHaveTextContent('LOT-2026-04A')
    })

    it('renders empty state when no items provided', () => {
      render(<LabelPreviewPanel items={[]} />)
      expect(screen.getByText(/no labels to preview/i)).toBeInTheDocument()
    })

    it('renders frequency text on labels', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.getByTestId('label-dosage')).toHaveTextContent('3× daily')
    })
  })

  describe('Task 2: Language selection (AC #2, #3)', () => {
    it('renders a language selector dropdown', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.getByTestId('language-selector')).toBeInTheDocument()
    })

    it('defaults to English when no patient language provided', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      const select = screen.getByTestId('language-selector') as HTMLSelectElement
      expect(select.value).toBe('en')
    })

    it('defaults to patient preferred language when provided', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} patientLanguage="ar" />)

      const select = screen.getByTestId('language-selector') as HTMLSelectElement
      expect(select.value).toBe('ar')
    })

    it('re-renders labels in Arabic when language is switched', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      const select = screen.getByTestId('language-selector')
      fireEvent.change(select, { target: { value: 'ar' } })

      // Arabic timing labels should appear
      expect(screen.getByText('صباح')).toBeInTheDocument()
    })

    it('re-renders labels in Dari when language is switched', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      const select = screen.getByTestId('language-selector')
      fireEvent.change(select, { target: { value: 'fa' } })

      // Dari timing labels should appear
      expect(screen.getByText('صبح')).toBeInTheDocument()
    })

    it('sets dir="rtl" when Arabic is selected', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} patientLanguage="ar" />)

      const labels = screen.getAllByTestId('medication-label')
      expect(labels[0]!.getAttribute('dir')).toBe('rtl')
    })

    it('sets dir="rtl" when Dari is selected', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} patientLanguage="fa" />)

      const labels = screen.getAllByTestId('medication-label')
      expect(labels[0]!.getAttribute('dir')).toBe('rtl')
    })

    it('sets dir="ltr" when English is selected', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      const labels = screen.getAllByTestId('medication-label')
      expect(labels[0]!.getAttribute('dir')).toBe('ltr')
    })
  })

  describe('Close button', () => {
    it('renders a close button when onClose is provided', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} onClose={() => {}} />)

      expect(screen.getByTestId('close-label-preview-btn')).toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('close-label-preview-btn'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not render close button when onClose is not provided', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.queryByTestId('close-label-preview-btn')).not.toBeInTheDocument()
    })
  })

  describe('Task 3: Print functionality (AC #4)', () => {
    it('renders a "Print All Labels" button', () => {
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      expect(screen.getByTestId('print-all-labels-btn')).toBeInTheDocument()
    })

    it('calls window.print when "Print All Labels" is clicked', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
      const items = [makeItem()]
      render(<LabelPreviewPanel items={items} />)

      fireEvent.click(screen.getByTestId('print-all-labels-btn'))
      expect(printSpy).toHaveBeenCalledTimes(1)

      printSpy.mockRestore()
    })

    it('does not render print button when no items', () => {
      render(<LabelPreviewPanel items={[]} />)
      expect(screen.queryByTestId('print-all-labels-btn')).not.toBeInTheDocument()
    })
  })

  describe('Snapshot tests', () => {
    it('matches snapshot in English', () => {
      const items = [makeItem()]
      const { container } = render(
        <LabelPreviewPanel items={items} pharmacyName="Test Pharmacy" dispensingDate="2026-05-12" />,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in Arabic', () => {
      const items = [makeItem()]
      const { container } = render(
        <LabelPreviewPanel items={items} patientLanguage="ar" pharmacyName="صيدلية النور" dispensingDate="2026-05-12" />,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in Dari', () => {
      const items = [makeItem()]
      const { container } = render(
        <LabelPreviewPanel items={items} patientLanguage="fa" pharmacyName="داروخانه نور" dispensingDate="2026-05-12" />,
      )
      expect(container).toMatchSnapshot()
    })
  })
})

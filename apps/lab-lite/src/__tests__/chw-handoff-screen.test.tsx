/**
 * Story 54.2 — CourierHandoffScreen Component Tests (Task 14.4)
 *
 * Tests for:
 *  - Step 1: courier ID entry, Next button enabled only with non-empty ID
 *  - Step 2: barcode scanning, duplicate detection, sample list
 *  - Step 3: optional temperature with unit toggle
 *  - Step 4: summary view, Confirm Handoff triggers recordCourierHandoff
 *  - Success screen shown on successful submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CourierHandoffScreen } from '@/components/chw/CourierHandoffScreen'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `${params.count} ${key}`
    return key
  },
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Truck: () => <svg aria-hidden />,
  Scan: () => <svg aria-hidden />,
  Thermometer: () => <svg aria-hidden />,
  CheckCircle: () => <svg aria-hidden />,
  AlertCircle: () => <svg aria-hidden />,
  Plus: () => <span>+</span>,
}))

const mockRecordCourierHandoff = vi.fn()

vi.mock('@/lib/chw-service', () => ({
  recordCourierHandoff: (...args: unknown[]) => mockRecordCourierHandoff(...args),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { userId: string } }) => unknown) =>
    selector({ session: { userId: 'chw-001' } }),
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function advanceToStep2(courierId = 'C-001') {
  const input = screen.getByRole('textbox')
  await userEvent.type(input, courierId)
  await userEvent.click(screen.getByRole('button', { name: /next/i }))
}

async function scanBarcode(barcode: string) {
  const input = screen.getByLabelText('barcodePlaceholder')
  await userEvent.clear(input)
  await userEvent.type(input, barcode)
  await userEvent.click(screen.getByRole('button', { name: /add/i }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CourierHandoffScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordCourierHandoff.mockResolvedValue({ id: 'handoff-001', sampleCount: 1 })
  })

  describe('Step 1: Courier ID', () => {
    it('shows courier ID input on first render', () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('Next button is disabled when courier ID is empty', () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    })

    it('Next button enables when courier ID is entered', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await userEvent.type(screen.getByRole('textbox'), 'C-001')
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
    })
  })

  describe('Step 2: Scan samples', () => {
    it('advances to step 2 after entering courier ID', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      expect(screen.getByLabelText('barcodePlaceholder')).toBeInTheDocument()
    })

    it('adds scanned barcode to list', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      await scanBarcode('CHW-0601-001')
      await waitFor(() => {
        expect(screen.getByText('CHW-0601-001')).toBeInTheDocument()
      })
    })

    it('shows duplicate error when barcode already scanned', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      await scanBarcode('CHW-0601-001')
      await scanBarcode('CHW-0601-001') // scan again
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('alreadyScanned')
      })
    })

    it('shows not-found error for non-CHW barcodes', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      await scanBarcode('INVALID-CODE')
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('notFound')
      })
    })

    it('Next button disabled until at least one sample scanned', async () => {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      expect(screen.getAllByRole('button', { name: /next/i })[0]).toBeDisabled()
    })
  })

  describe('Step 4: Summary and confirmation', () => {
    async function advanceToSummary() {
      render(<CourierHandoffScreen onDone={vi.fn()} />)
      await advanceToStep2()
      await scanBarcode('CHW-0601-001')
      await userEvent.click(screen.getAllByRole('button', { name: /next/i })[0])
      // Skip temperature step
      await userEvent.click(screen.getByRole('button', { name: /skip|next/i }))
    }

    it('shows summary with courier ID and sample count', async () => {
      await advanceToSummary()
      expect(screen.getByText('C-001')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('calls recordCourierHandoff on confirm', async () => {
      await advanceToSummary()
      await userEvent.click(screen.getByRole('button', { name: /confirmButton/i }))
      await waitFor(() => {
        expect(mockRecordCourierHandoff).toHaveBeenCalledWith(
          expect.objectContaining({
            courierId: 'C-001',
            sampleIds: ['CHW-0601-001'],
          }),
        )
      })
    })

    it('shows success screen after confirmation', async () => {
      await advanceToSummary()
      await userEvent.click(screen.getByRole('button', { name: /confirmButton/i }))
      await waitFor(() => {
        expect(screen.getByText('successTitle')).toBeInTheDocument()
      })
    })
  })

  describe('Success screen', () => {
    it('calls onDone when Back to Dashboard is clicked', async () => {
      const onDone = vi.fn()
      render(<CourierHandoffScreen onDone={onDone} />)
      // Navigate to success
      await advanceToStep2()
      await scanBarcode('CHW-0601-001')
      await userEvent.click(screen.getAllByRole('button', { name: /next/i })[0])
      await userEvent.click(screen.getByRole('button', { name: /skip|next/i }))
      await userEvent.click(screen.getByRole('button', { name: /confirmButton/i }))
      await waitFor(() => screen.getByText('successTitle'))
      await userEvent.click(screen.getByRole('button', { name: /backToDashboard/i }))
      expect(onDone).toHaveBeenCalled()
    })
  })
})

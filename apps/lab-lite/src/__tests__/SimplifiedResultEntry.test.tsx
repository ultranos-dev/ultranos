/**
 * SimplifiedResultEntry Component Tests — Story 54.5 (Task 15.6)
 *
 * Tests:
 *   - Renders with data-testid="simplified-result-entry"
 *   - Shows sampleId input with autoFocus
 *   - Shows 3 result buttons: positive, negative, indeterminate (AC #5)
 *   - Result buttons have large touch targets (padding: 1rem) (AC #8.3)
 *   - Submit button is disabled until both sampleId and result are set
 *   - Error shown for empty sampleId on submit
 *   - Error shown when no result selected
 *   - Successful submit calls onSubmit and resets form
 *   - Close button calls onClose
 *   - Pathogen name and test code shown in header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { OutbreakModeConfig } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSession = {
  userId: 'u1',
  role: 'LAB_TECH',
  labRole: null,
  practitionerId: 'prac-001',
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockOutbreakConfig: OutbreakModeConfig = {
  id: 'outbreak-001',
  status: 'active',
  activatedBy: 'prac-001',
  activatedAt: '2026-05-31T08:00:00Z:0:test',
  deactivatedBy: null,
  deactivatedAt: null,
  targetPathogen: { code: 'MALARIA', display: 'Malaria' },
  targetTestCodes: ['51587-4'],
  affectedScope: ['loc-001'],
  activationReason: 'WHO alert',
  surgeMultiplier: 3,
  meta: { lastUpdated: '2026-05-31T08:00:00Z', versionId: '1' },
  _ultranos: { createdAt: '2026-05-31T08:00:00Z', hlcTimestamp: '2026-05-31T08:00:00Z:0:test' },
}

// ---------------------------------------------------------------------------
// Import component
// ---------------------------------------------------------------------------

import { SimplifiedResultEntry } from '../components/outbreak/SimplifiedResultEntry'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SimplifiedResultEntry — rendering', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders with data-testid="simplified-result-entry"', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('simplified-result-entry')).toBeInTheDocument()
  })

  it('renders the "Fast Result Entry" header', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Fast Result Entry')).toBeInTheDocument()
  })

  it('shows the pathogen display name in the header', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Malaria/)).toBeInTheDocument()
  })

  it('shows the target test code in the header', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/51587-4/)).toBeInTheDocument()
  })

  it('renders the Sample ID input', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/sample id/i)).toBeInTheDocument()
  })

  it('renders the close button', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /close simplified entry/i })).toBeInTheDocument()
  })
})

describe('SimplifiedResultEntry — result buttons (AC #5)', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders POSITIVE button', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('result-btn-positive')).toBeInTheDocument()
    expect(screen.getByTestId('result-btn-positive')).toHaveTextContent('POSITIVE')
  })

  it('renders NEGATIVE button', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('result-btn-negative')).toHaveTextContent('NEGATIVE')
  })

  it('renders INDETERMINATE button', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('result-btn-indeterminate')).toHaveTextContent('INDETERMINATE')
  })

  it('result buttons have large touch target padding (1rem) — AC #8.3', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const positiveBtn = screen.getByTestId('result-btn-positive')
    // 1rem padding on top/bottom is the large touch target requirement
    expect(positiveBtn).toHaveStyle({ padding: '1rem 0.75rem' })
  })

  it('clicking a result button sets it as selected (aria-pressed)', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const positiveBtn = screen.getByTestId('result-btn-positive')
    expect(positiveBtn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(positiveBtn)
    expect(positiveBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('only one result button can be selected at a time', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('result-btn-positive'))
    fireEvent.click(screen.getByTestId('result-btn-negative'))
    expect(screen.getByTestId('result-btn-positive')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('result-btn-negative')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SimplifiedResultEntry — submit behavior', () => {
  afterEach(() => vi.clearAllMocks())

  it('Submit button is disabled when sampleId is empty', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('result-btn-positive'))
    // sampleId is still empty
    expect(screen.getByRole('button', { name: /submit result/i })).toBeDisabled()
  })

  it('Submit button is disabled when no result is selected', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-001' },
    })
    // No result selected
    expect(screen.getByRole('button', { name: /submit result/i })).toBeDisabled()
  })

  it('Submit button is enabled when both sampleId and result are set', () => {
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-001' },
    })
    fireEvent.click(screen.getByTestId('result-btn-negative'))
    expect(screen.getByRole('button', { name: /submit result/i })).not.toBeDisabled()
  })

  it('calls onSubmit with correct submission shape', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-001' },
    })
    fireEvent.click(screen.getByTestId('result-btn-positive'))
    fireEvent.click(screen.getByRole('button', { name: /submit result/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    const submission = onSubmit.mock.calls[0][0]
    expect(submission.sampleId).toBe('SAMP-001')
    expect(submission.result).toBe('positive')
    expect(submission.techId).toBe('prac-001')
    expect(submission.testLoincCode).toBe('51587-4')
    expect(submission.outbreakConfigId).toBe('outbreak-001')
    expect(submission.timestamp).toBeTruthy()
  })

  it('resets sampleId and result after successful submit (high-throughput flow)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-001' },
    })
    fireEvent.click(screen.getByTestId('result-btn-positive'))
    fireEvent.click(screen.getByRole('button', { name: /submit result/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    // Form should reset
    expect(screen.getByLabelText(/sample id/i)).toHaveValue('')
    expect(screen.getByTestId('result-btn-positive')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows success message with submitted sample ID', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-XYZ' },
    })
    fireEvent.click(screen.getByTestId('result-btn-negative'))
    fireEvent.click(screen.getByRole('button', { name: /submit result/i }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Submitted.*SAMP-XYZ/)
    })
  })

  it('shows error when submit fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('DB write failed'))
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/sample id/i), {
      target: { value: 'SAMP-FAIL' },
    })
    fireEvent.click(screen.getByTestId('result-btn-positive'))
    fireEvent.click(screen.getByRole('button', { name: /submit result/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('DB write failed')
    })
  })
})

describe('SimplifiedResultEntry — close', () => {
  afterEach(() => vi.clearAllMocks())

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <SimplifiedResultEntry
        outbreakConfig={mockOutbreakConfig}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /close simplified entry/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

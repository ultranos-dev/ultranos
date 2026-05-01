import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MetadataForm } from '../components/MetadataForm'
import { LOINC_CATEGORIES } from '../lib/loinc-categories'
import type { OcrSuggestion } from '../lib/trpc'

const defaultProps = {
  onSubmit: vi.fn(),
  disabled: false,
}

describe('MetadataForm', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders test category dropdown with all LOINC categories', () => {
    render(<MetadataForm {...defaultProps} />)
    const select = screen.getByLabelText(/test category/i)
    expect(select).toBeDefined()

    // All LOINC categories should appear as options
    for (const cat of LOINC_CATEGORIES) {
      expect(screen.getByText(cat.label)).toBeDefined()
    }
  })

  it('renders sample collection date picker', () => {
    render(<MetadataForm {...defaultProps} />)
    expect(screen.getByLabelText(/collection date/i)).toBeDefined()
  })

  it('calls onSubmit with category code and collection date when valid', async () => {
    render(<MetadataForm {...defaultProps} />)

    // Select a test category
    fireEvent.change(screen.getByLabelText(/test category/i), {
      target: { value: '58410-2' },
    })

    // Enter collection date
    fireEvent.change(screen.getByLabelText(/collection date/i), {
      target: { value: '2026-04-28' },
    })

    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        loincCode: '58410-2',
        loincDisplay: 'Blood Work \u2014 CBC',
        collectionDate: '2026-04-28',
        ocrMetadataVerified: undefined,
        ocrSuggestions: undefined,
      })
    })
  })

  it('shows validation error when test category is not selected', async () => {
    render(<MetadataForm {...defaultProps} />)

    // Enter collection date but skip category
    fireEvent.change(screen.getByLabelText(/collection date/i), {
      target: { value: '2026-04-28' },
    })

    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      expect(screen.getByText(/please select a test category/i)).toBeDefined()
    })
    expect(defaultProps.onSubmit).not.toHaveBeenCalled()
  })

  it('shows validation error when collection date is empty', async () => {
    render(<MetadataForm {...defaultProps} />)

    // Select category but skip date
    fireEvent.change(screen.getByLabelText(/test category/i), {
      target: { value: '58410-2' },
    })

    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      expect(screen.getByText(/enter.*collection date/i)).toBeDefined()
    })
    expect(defaultProps.onSubmit).not.toHaveBeenCalled()
  })

  it('disables form controls when disabled prop is true', () => {
    render(<MetadataForm {...defaultProps} disabled={true} />)
    const select = screen.getByLabelText(/test category/i) as HTMLSelectElement
    const dateInput = screen.getByLabelText(/collection date/i) as HTMLInputElement
    expect(select.disabled).toBe(true)
    expect(dateInput.disabled).toBe(true)
  })

  it('maps each category label to its LOINC code in the dropdown value', () => {
    render(<MetadataForm {...defaultProps} />)
    const select = screen.getByLabelText(/test category/i) as HTMLSelectElement

    // Each option's value should be the LOINC code
    const options = Array.from(select.querySelectorAll('option')).filter(
      (o) => o.value !== '',
    )
    expect(options.length).toBe(LOINC_CATEGORIES.length)
    for (let i = 0; i < LOINC_CATEGORIES.length; i++) {
      expect(options[i]!.value).toBe(LOINC_CATEGORIES[i]!.code)
      expect(options[i]!.textContent).toBe(LOINC_CATEGORIES[i]!.label)
    }
  })
})

// ── Story 12.6: OCR Metadata Tests ──────────────────────────

describe('MetadataForm — OCR auto-population', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const highConfidenceSuggestions: OcrSuggestion[] = [
    { field: 'loincCode', value: '57698-3', confidence: 92 },
    { field: 'collectionDate', value: '2026-04-10', confidence: 90 },
  ]

  const lowConfidenceSuggestions: OcrSuggestion[] = [
    { field: 'loincCode', value: '57698-3', confidence: 60 },
    { field: 'collectionDate', value: '2026-04-10', confidence: 70 },
  ]

  it('auto-fills fields when OCR confidence >= 85% (AC 2, 4)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={highConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1200 }}
      />,
    )

    const select = screen.getByLabelText(/test category/i) as HTMLSelectElement
    const dateInput = screen.getByLabelText(/collection date/i) as HTMLInputElement

    expect(select.value).toBe('57698-3')
    expect(dateInput.value).toBe('2026-04-10')
  })

  it('leaves fields blank when OCR confidence < 85% (AC 4)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={lowConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 800 }}
      />,
    )

    const select = screen.getByLabelText(/test category/i) as HTMLSelectElement
    const dateInput = screen.getByLabelText(/collection date/i) as HTMLInputElement

    expect(select.value).toBe('')
    expect(dateInput.value).toBe('')
  })

  it('shows "OCR could not determine" for low-confidence fields (AC 4)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={lowConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 800 }}
      />,
    )

    const hints = screen.getAllByText(/OCR could not determine/i)
    expect(hints.length).toBe(2) // one for category, one for date
  })

  it('displays confidence badges next to OCR-populated fields (AC 3)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={highConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1200 }}
      />,
    )

    const categoryBadge = screen.getByTestId('confidence-badge-category')
    const dateBadge = screen.getByTestId('confidence-badge-date')

    expect(categoryBadge.textContent).toContain('High confidence')
    expect(categoryBadge.textContent).toContain('92%')
    expect(dateBadge.textContent).toContain('High confidence')
    expect(dateBadge.textContent).toContain('90%')
  })

  it('displays medium/low confidence badges correctly (AC 3)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={lowConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 800 }}
      />,
    )

    const categoryBadge = screen.getByTestId('confidence-badge-category')
    const dateBadge = screen.getByTestId('confidence-badge-date')

    expect(categoryBadge.textContent).toContain('Medium confidence')
    expect(dateBadge.textContent).toContain('Medium confidence')
  })

  it('shows OCR loading indicator (AC 8)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrStatus={{ loading: true, available: false }}
      />,
    )

    expect(screen.getByText(/analyzing document with OCR/i)).toBeDefined()
  })

  it('shows OCR unavailable notice on fallback (AC 7)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrStatus={{ loading: false, available: false }}
      />,
    )

    expect(screen.getByText(/OCR unavailable/i)).toBeDefined()
  })

  it('shows OCR processing time on completion (AC 8)', () => {
    render(
      <MetadataForm
        {...defaultProps}
        ocrSuggestions={highConfidenceSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 2500 }}
      />,
    )

    expect(screen.getByText(/2\.5s/)).toBeDefined()
  })
})

describe('MetadataForm — Confirmation Gate (Story 12.6)', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const ocrSuggestions: OcrSuggestion[] = [
    { field: 'loincCode', value: '58410-2', confidence: 92 },
    { field: 'collectionDate', value: '2026-04-10', confidence: 90 },
  ]

  it('shows confirmation checkbox when OCR suggestions are present (AC 5)', () => {
    render(
      <MetadataForm
        onSubmit={vi.fn()}
        ocrSuggestions={ocrSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1000 }}
      />,
    )

    expect(screen.getByTestId('ocr-confirm-checkbox')).toBeDefined()
    expect(screen.getByText(/I have reviewed and confirm/i)).toBeDefined()
  })

  it('does not show confirmation checkbox without OCR suggestions', () => {
    render(<MetadataForm onSubmit={vi.fn()} />)

    expect(screen.queryByTestId('ocr-confirm-checkbox')).toBeNull()
  })

  it('blocks submission without confirmation when OCR is present (AC 5)', async () => {
    const onSubmit = vi.fn()
    render(
      <MetadataForm
        onSubmit={onSubmit}
        ocrSuggestions={ocrSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1000 }}
      />,
    )

    // Fields are auto-filled, but don't check the confirmation box
    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      expect(screen.getByText(/review and confirm/i)).toBeDefined()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('allows submission after confirmation checkbox is checked (AC 5)', async () => {
    const onSubmit = vi.fn()
    render(
      <MetadataForm
        onSubmit={onSubmit}
        ocrSuggestions={ocrSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1000 }}
      />,
    )

    // Check the confirmation box
    fireEvent.click(screen.getByTestId('ocr-confirm-checkbox'))

    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          loincCode: '58410-2',
          collectionDate: '2026-04-10',
          ocrMetadataVerified: true,
          ocrSuggestions,
        }),
      )
    })
  })

  it('includes ocrSuggestions in submitted values for audit (AC 6)', async () => {
    const onSubmit = vi.fn()
    render(
      <MetadataForm
        onSubmit={onSubmit}
        ocrSuggestions={ocrSuggestions}
        ocrStatus={{ loading: false, available: true, processingTimeMs: 1000 }}
      />,
    )

    fireEvent.click(screen.getByTestId('ocr-confirm-checkbox'))
    fireEvent.click(screen.getByText(/submit/i))

    await waitFor(() => {
      const call = onSubmit.mock.calls[0][0]
      expect(call.ocrSuggestions).toEqual(ocrSuggestions)
      expect(call.ocrMetadataVerified).toBe(true)
    })
  })
})

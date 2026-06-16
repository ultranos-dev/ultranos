import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import { enrichDrug } from '@/lib/trpc'

// Mock medication search to return an ATC-coded result
vi.mock('@/lib/medication-search', () => ({
  searchMedications: vi.fn().mockResolvedValue([
    {
      item: { code: 'J01CA04', display: 'Amoxicillin', form: 'Capsule 500mg', strength: '' },
      matches: undefined,
    },
  ]),
}))

vi.mock('@/lib/trpc', () => ({
  searchDrugCatalog: vi.fn(),
  enrichDrug: vi.fn(),
}))

const mockEnrichDrug = vi.mocked(enrichDrug)

async function selectAmoxicillin() {
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'amox' } })
  // Wait for debounced search + result render
  await waitFor(() => screen.getByText('Amoxicillin'))
  fireEvent.mouseDown(screen.getByText('Amoxicillin'))
  // Wait for medication to be selected (Pharmopedia link is the selection signal)
  await waitFor(() => screen.getByRole('link', { name: /pharmopedia/i }))
}

describe('PrescriptionEntry — Pharmopedia deep link', () => {
  it('shows "Open in Pharmopedia" link after drug selection', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectAmoxicillin()
    const link = screen.getByRole('link', { name: /pharmopedia/i })
    expect(link).toHaveAttribute('href', 'pharmopedia://drug/J01CA04')
  })

  it('does not show "Open in Pharmopedia" before drug selection', () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /pharmopedia/i })).toBeNull()
  })
})

describe('PrescriptionEntry — enrich form', () => {
  beforeEach(() => { mockEnrichDrug.mockReset() })

  it('does not show enrich form when canEnrich is false (default)', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectAmoxicillin()
    expect(screen.queryByPlaceholderText(/english name override/i)).toBeNull()
  })

  it('shows enrich form when canEnrich is true', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()
    expect(screen.getByPlaceholderText(/english name override/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/dari name/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /save name/i })).toBeTruthy()
  })

  it('calls enrichDrug with correct ATC code and localNames on submit', async () => {
    mockEnrichDrug.mockResolvedValueOnce(undefined)
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Amox local' },
    })
    fireEvent.change(screen.getByPlaceholderText(/dari name/i), {
      target: { value: 'آموکسیسیلین' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(mockEnrichDrug).toHaveBeenCalledWith('J01CA04', {
      localNames: { en: 'Amox local', prs: 'آموکسیسیلین' },
    }))
  })

  it('shows "Saved" confirmation after successful enrich', async () => {
    mockEnrichDrug.mockResolvedValueOnce(undefined)
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Amox local' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => screen.getByText(/saved/i))
  })

  it('shows error message when enrichDrug throws', async () => {
    mockEnrichDrug.mockRejectedValueOnce(new Error('Network error'))
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/dari name/i), {
      target: { value: 'آموکسیسیلین' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => screen.getByText(/failed to save local name/i))
  })

  it('clears enrich form when medication is cleared', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Some name' },
    })

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    // After clearing, the drug is deselected — enrich form gone
    expect(screen.queryByPlaceholderText(/english name override/i)).toBeNull()
  })
})

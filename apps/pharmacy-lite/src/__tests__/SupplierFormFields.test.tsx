import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — at top level before component imports
// ---------------------------------------------------------------------------

const mockCreateSupplier = vi.fn().mockResolvedValue({ id: 'sup-new' })
const mockUpdateSupplier = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/procurement/supplier-service', () => ({
  createSupplier: (...a: unknown[]) => mockCreateSupplier(...a),
  updateSupplier: (...a: unknown[]) => mockUpdateSupplier(...a),
}))

// next-intl is globally mocked in setup.ts (key passthrough), no local override needed.

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { SupplierForm } from '@/components/pharmacy/procurement/SupplierForm'
import type { Supplier } from '@/lib/procurement/types'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseSupplier: Supplier = {
  id: 'sup-1',
  name: 'Al-Shifa Pharma',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
}

const enrichedSupplier: Supplier = {
  ...baseSupplier,
  supplierCode: 'SUP-001',
  taxId: 'TAX-123',
  minOrderValue: 50000,
  rating: 4,
  notes: 'Preferred supplier',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateSupplier.mockResolvedValue({ id: 'sup-new' })
  mockUpdateSupplier.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(props: { supplier?: Supplier; onSaved?: () => void; onCancel?: () => void }) {
  return render(
    <SupplierForm
      supplier={props.supplier}
      onSaved={props.onSaved ?? vi.fn()}
      onCancel={props.onCancel ?? vi.fn()}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests — new enrichment field labels render
// ---------------------------------------------------------------------------

describe('SupplierForm — enrichment field labels', () => {
  it('renders supplierCode label', () => {
    renderForm({})
    expect(screen.getByText('supplierCode')).toBeInTheDocument()
  })

  it('renders taxId label', () => {
    renderForm({})
    expect(screen.getByText('taxId')).toBeInTheDocument()
  })

  it('renders minOrderValue label', () => {
    renderForm({})
    expect(screen.getByText('minOrderValue')).toBeInTheDocument()
  })

  it('renders rating label', () => {
    renderForm({})
    expect(screen.getByText('rating')).toBeInTheDocument()
  })

  it('renders notes label', () => {
    renderForm({})
    expect(screen.getByText('notes')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — edit mode pre-fills enrichment fields from supplier prop
// ---------------------------------------------------------------------------

describe('SupplierForm — edit mode pre-fills enrichment fields', () => {
  it('pre-fills supplierCode from supplier prop', () => {
    renderForm({ supplier: enrichedSupplier })
    const input = screen.getByPlaceholderText('supplierCode') as HTMLInputElement
    expect(input.value).toBe('SUP-001')
  })

  it('pre-fills taxId from supplier prop', () => {
    renderForm({ supplier: enrichedSupplier })
    const input = screen.getByPlaceholderText('taxId') as HTMLInputElement
    expect(input.value).toBe('TAX-123')
  })

  it('pre-fills minOrderValue from supplier prop (as string)', () => {
    renderForm({ supplier: enrichedSupplier })
    const input = screen.getByPlaceholderText('e.g. 10000') as HTMLInputElement
    expect(input.value).toBe('50000')
  })

  it('pre-fills rating from supplier prop (as string)', () => {
    renderForm({ supplier: enrichedSupplier })
    const input = screen.getByPlaceholderText('1–5') as HTMLInputElement
    expect(input.value).toBe('4')
  })

  it('pre-fills notes textarea from supplier prop', () => {
    renderForm({ supplier: enrichedSupplier })
    const textarea = screen.getByPlaceholderText('notes') as HTMLTextAreaElement
    expect(textarea.value).toBe('Preferred supplier')
  })
})

// ---------------------------------------------------------------------------
// Tests — create mode passes enrichment fields to createSupplier
// ---------------------------------------------------------------------------

describe('SupplierForm — create mode sends enrichment fields', () => {
  it('calls createSupplier with all 5 enrichment fields when provided', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSaved })

    // Fill required name
    await user.type(screen.getByPlaceholderText('supplierName'), 'Test Supplier')

    // Fill enrichment fields
    await user.type(screen.getByPlaceholderText('supplierCode'), 'CODE-99')
    await user.type(screen.getByPlaceholderText('taxId'), 'TX-99')
    await user.type(screen.getByPlaceholderText('e.g. 10000'), '20000')
    await user.type(screen.getByPlaceholderText('1–5'), '3')
    await user.type(screen.getByPlaceholderText('notes'), 'Good supplier')

    await user.click(screen.getByRole('button', { name: 'createSupplier' }))

    await waitFor(() => {
      expect(mockCreateSupplier).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierCode: 'CODE-99',
          taxId: 'TX-99',
          minOrderValue: 20000,
          rating: 3,
          notes: 'Good supplier',
        }),
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('omits enrichment fields when left blank (no undefined keys passed as non-undefined)', async () => {
    const user = userEvent.setup()
    renderForm({})

    await user.type(screen.getByPlaceholderText('supplierName'), 'Minimal Supplier')
    await user.click(screen.getByRole('button', { name: 'createSupplier' }))

    await waitFor(() => {
      const callArg = mockCreateSupplier.mock.calls[0][0] as Record<string, unknown>
      expect(callArg.supplierCode).toBeUndefined()
      expect(callArg.taxId).toBeUndefined()
      expect(callArg.minOrderValue).toBeUndefined()
      expect(callArg.rating).toBeUndefined()
      expect(callArg.notes).toBeUndefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Tests — edit mode passes enrichment fields to updateSupplier
// ---------------------------------------------------------------------------

describe('SupplierForm — edit mode sends enrichment fields', () => {
  it('calls updateSupplier with enrichment fields from pre-filled values', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderForm({ supplier: enrichedSupplier, onSaved })

    await user.click(screen.getByRole('button', { name: 'updateSupplier' }))

    await waitFor(() => {
      expect(mockUpdateSupplier).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({
          supplierCode: 'SUP-001',
          taxId: 'TAX-123',
          minOrderValue: 50000,
          rating: 4,
          notes: 'Preferred supplier',
        }),
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })
})

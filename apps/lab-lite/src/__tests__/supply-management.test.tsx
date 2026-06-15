/**
 * SupplyManagement component tests — Story 51.5
 *
 * Tests: role gate, supply list rendering, add/delete/quick-stock flows,
 * negative-value validation, error banner on save failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react'
import type { SupplyItem } from '@/lib/db'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted before const declarations; vi.hoisted() ensures
// the mock functions are available when the factories run (avoids TDZ errors).
const { mockGetAllSupplyItems, mockPutSupplyItem, mockUpdateSupplyItem, mockDeleteSupplyItem } =
  vi.hoisted(() => ({
    mockGetAllSupplyItems: vi.fn(),
    mockPutSupplyItem: vi.fn(),
    mockUpdateSupplyItem: vi.fn(),
    mockDeleteSupplyItem: vi.fn(),
  }))

vi.mock('@/lib/db', () => ({
  getAllSupplyItems: mockGetAllSupplyItems,
  putSupplyItem: mockPutSupplyItem,
  updateSupplyItem: mockUpdateSupplyItem,
  deleteSupplyItem: mockDeleteSupplyItem,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Plus: () => <svg data-testid="plus-icon" />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  Trash2: () => <svg data-testid="trash-icon" />,
  X: () => <svg data-testid="x-icon" />,
  Check: () => <svg data-testid="check-icon" />,
  AlertTriangle: () => <svg data-testid="alert-icon" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, type, variant, disabled, ...rest }: React.ComponentPropsWithRef<'button'> & { variant?: string }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
}))

vi.mock('@ultranos/shared-types', () => ({
  LabRole: {
    LAB_TECH: 'LAB_TECH',
    SENIOR_TECH: 'SENIOR_TECH',
    SUPERVISOR: 'SUPERVISOR',
    LAB_MANAGER: 'LAB_MANAGER',
  },
}))

import { SupplyManagement } from '@/components/readiness/SupplyManagement'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const mockUseAuthSessionStore = vi.mocked(useAuthSessionStore)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupplyItem(overrides: Partial<SupplyItem> = {}): SupplyItem {
  return {
    id: `supply-${Math.random().toString(36).slice(2)}`,
    name: 'CBC Reagent',
    category: 'Reagent',
    currentStock: 100,
    unit: 'tests',
    reorderThreshold: 20,
    criticalThreshold: 5,
    dailyUsageEstimate: 5,
    lastUpdated: '2026-06-09T10:00:00.000Z',
    updatedBy: 'tech-001',
    ...overrides,
  }
}

function setRole(role: string | null) {
  mockUseAuthSessionStore.mockImplementation(
    (selector: (s: { session: { labRole: string; practitionerId: string } | null }) => unknown) =>
      selector(
        role
          ? { session: { labRole: role, practitionerId: 'tech-abc12345' } }
          : { session: null },
      ),
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  setRole('SUPERVISOR')
  mockGetAllSupplyItems.mockResolvedValue([])
  mockPutSupplyItem.mockResolvedValue(undefined)
  mockUpdateSupplyItem.mockResolvedValue(undefined)
  mockDeleteSupplyItem.mockResolvedValue(undefined)
})

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Role gate
// ---------------------------------------------------------------------------

describe('SupplyManagement role gate', () => {
  it('shows access denied for LAB_TECH role', async () => {
    setRole('LAB_TECH')
    render(<SupplyManagement />)
    expect(screen.getByText('rag.supply.accessDenied')).toBeDefined()
    expect(screen.queryByText('rag.supply.manageTitle')).toBeNull()
  })

  it('shows access denied for SENIOR_TECH role', async () => {
    setRole('SENIOR_TECH')
    render(<SupplyManagement />)
    expect(screen.getByText('rag.supply.accessDenied')).toBeDefined()
  })

  it('renders management view for SUPERVISOR role', async () => {
    setRole('SUPERVISOR')
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('rag.supply.manageTitle')).toBeDefined())
  })

  it('renders management view for LAB_MANAGER role', async () => {
    setRole('LAB_MANAGER')
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('rag.supply.manageTitle')).toBeDefined())
  })

  it('shows access denied when session is null', async () => {
    setRole(null)
    render(<SupplyManagement />)
    expect(screen.getByText('rag.supply.accessDenied')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Supply list rendering
// ---------------------------------------------------------------------------

describe('SupplyManagement list view', () => {
  it('shows empty state when no items exist', async () => {
    mockGetAllSupplyItems.mockResolvedValue([])
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('rag.supply.empty')).toBeDefined())
  })

  it('renders supply items in table', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      makeSupplyItem({ name: 'CBC Reagent', category: 'Reagent', currentStock: 100, unit: 'tests' }),
      makeSupplyItem({ name: 'Urine Strips', category: 'Consumable', currentStock: 50, unit: 'strips' }),
    ])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getByText('CBC Reagent')).toBeDefined()
      expect(screen.getByText('Urine Strips')).toBeDefined()
    })
  })

  it('renders edit and delete buttons for each item', async () => {
    mockGetAllSupplyItems.mockResolvedValue([makeSupplyItem({ id: 'supply-1' })])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getAllByTestId('pencil-icon').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('trash-icon').length).toBeGreaterThan(0)
    })
  })

  it('calls getAllSupplyItems on mount', async () => {
    render(<SupplyManagement />)
    await waitFor(() => expect(mockGetAllSupplyItems).toHaveBeenCalledTimes(1))
  })
})

// ---------------------------------------------------------------------------
// Add supply flow
// ---------------------------------------------------------------------------

describe('SupplyManagement add supply', () => {
  it('shows add form when "Add Supply" button is clicked', async () => {
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.manageTitle'))
    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.addSupply'))
    })
    expect(screen.getByText('rag.supply.addTitle')).toBeDefined()
  })

  it('calls putSupplyItem and reloads list on valid form submit', async () => {
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.manageTitle'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.addSupply'))
    })

    // Fill required fields
    const nameInput = screen.getByRole('textbox', { name: /rag\.supply\.fieldName/i })
    fireEvent.change(nameInput, { target: { value: 'New Reagent' } })

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } }) // currentStock
    fireEvent.change(inputs[1], { target: { value: '10' } }) // reorderThreshold

    const unitInput = screen.getAllByRole('textbox').find(
      (el) => el.getAttribute('aria-required') === 'true' && el.getAttribute('value') === '',
    ) ?? screen.getAllByRole('textbox')[1]
    // Use aria-required=true textboxes: name + unit
    const requiredTextboxes = screen.getAllByRole('textbox').filter(
      (el) => el.getAttribute('aria-required') === 'true',
    )
    // requiredTextboxes[1] is the unit field
    if (requiredTextboxes[1]) {
      fireEvent.change(requiredTextboxes[1], { target: { value: 'mL' } })
    }

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    await waitFor(() => expect(mockPutSupplyItem).toHaveBeenCalledTimes(1))
    // Should reload the list
    expect(mockGetAllSupplyItems).toHaveBeenCalledTimes(2) // mount + after save
  })

  it('shows validation error when name is empty', async () => {
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.manageTitle'))
    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.addSupply'))
    })

    // Submit without filling name
    await act(async () => {
      const form = document.querySelector('form')!
      fireEvent.submit(form)
    })

    expect(screen.getAllByText('rag.supply.errorRequired').length).toBeGreaterThan(0)
    expect(mockPutSupplyItem).not.toHaveBeenCalled()
  })

  it('shows validation error for negative stock value', async () => {
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.manageTitle'))
    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.addSupply'))
    })

    const nameInput = screen.getByRole('textbox', { name: /rag\.supply\.fieldName/i })
    fireEvent.change(nameInput, { target: { value: 'Bad Reagent' } })

    const stockInput = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(stockInput, { target: { value: '-5' } })

    await act(async () => {
      const form = document.querySelector('form')!
      fireEvent.submit(form)
    })

    expect(screen.getAllByText('rag.supply.errorNumber').length).toBeGreaterThan(0)
    expect(mockPutSupplyItem).not.toHaveBeenCalled()
  })

  it('shows error banner when putSupplyItem rejects', async () => {
    mockPutSupplyItem.mockRejectedValue(new Error('IndexedDB error'))
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.manageTitle'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.addSupply'))
    })

    // Fill valid form
    const nameInput = screen.getByRole('textbox', { name: /rag\.supply\.fieldName/i })
    fireEvent.change(nameInput, { target: { value: 'Good Reagent' } })
    const spinbuttons = screen.getAllByRole('spinbutton')
    fireEvent.change(spinbuttons[0], { target: { value: '50' } })
    fireEvent.change(spinbuttons[1], { target: { value: '10' } })
    const requiredTextboxes = screen.getAllByRole('textbox').filter(
      (el) => el.getAttribute('aria-required') === 'true',
    )
    if (requiredTextboxes[1]) {
      fireEvent.change(requiredTextboxes[1], { target: { value: 'mL' } })
    }

    await act(async () => {
      const form = document.querySelector('form')!
      fireEvent.submit(form)
    })

    await waitFor(() =>
      expect(screen.getByText('rag.supply.errorSave')).toBeDefined(),
    )
  })
})

// ---------------------------------------------------------------------------
// Delete flow
// ---------------------------------------------------------------------------

describe('SupplyManagement delete flow', () => {
  it('shows delete confirmation dialog when delete button is clicked', async () => {
    const item = makeSupplyItem({ id: 'supply-1', name: 'Reagent To Delete' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('Reagent To Delete'))

    const deleteBtn = screen.getByRole('button', {
      name: /rag\.supply\.deleteAriaLabel/i,
    })
    await act(async () => { fireEvent.click(deleteBtn) })

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('rag.supply.deleteConfirmTitle')).toBeDefined()
  })

  it('calls deleteSupplyItem on confirm and reloads list', async () => {
    const item = makeSupplyItem({ id: 'supply-del-1', name: 'Delete Me' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('Delete Me'))

    const deleteBtn = screen.getByRole('button', {
      name: /rag\.supply\.deleteAriaLabel/i,
    })
    await act(async () => { fireEvent.click(deleteBtn) })

    const confirmBtn = screen.getByText('rag.supply.deleteConfirm')
    await act(async () => { fireEvent.click(confirmBtn) })

    await waitFor(() => expect(mockDeleteSupplyItem).toHaveBeenCalledWith('supply-del-1'))
    expect(mockGetAllSupplyItems).toHaveBeenCalledTimes(2) // mount + after delete
  })

  it('cancels delete when cancel button is clicked', async () => {
    const item = makeSupplyItem({ id: 'supply-1', name: 'Keep Me' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('Keep Me'))

    const deleteBtn = screen.getByRole('button', {
      name: /rag\.supply\.deleteAriaLabel/i,
    })
    await act(async () => { fireEvent.click(deleteBtn) })
    expect(screen.getByRole('dialog')).toBeDefined()

    const cancelBtn = screen.getByText('rag.supply.cancel')
    await act(async () => { fireEvent.click(cancelBtn) })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockDeleteSupplyItem).not.toHaveBeenCalled()
  })

  it('closes delete dialog when ESC is pressed', async () => {
    const item = makeSupplyItem({ id: 'supply-1', name: 'ESC Me' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('ESC Me'))

    const deleteBtn = screen.getByRole('button', {
      name: /rag\.supply\.deleteAriaLabel/i,
    })
    await act(async () => { fireEvent.click(deleteBtn) })
    expect(screen.getByRole('dialog')).toBeDefined()

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockDeleteSupplyItem).not.toHaveBeenCalled()
  })

  it('shows error banner when deleteSupplyItem rejects', async () => {
    mockDeleteSupplyItem.mockRejectedValue(new Error('delete failed'))
    const item = makeSupplyItem({ id: 'supply-1', name: 'Fail Delete' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('Fail Delete'))

    const deleteBtn = screen.getByRole('button', {
      name: /rag\.supply\.deleteAriaLabel/i,
    })
    await act(async () => { fireEvent.click(deleteBtn) })
    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.deleteConfirm'))
    })

    await waitFor(() =>
      expect(screen.getByText('rag.supply.errorDelete')).toBeDefined(),
    )
  })
})

// ---------------------------------------------------------------------------
// Quick stock update
// ---------------------------------------------------------------------------

describe('SupplyManagement quick stock update', () => {
  it('shows inline editor when "Update stock" link is clicked', async () => {
    const item = makeSupplyItem({ id: 'supply-1', currentStock: 50, unit: 'mL' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.updateStock'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.updateStock'))
    })

    const stockInput = screen.getByRole('spinbutton', {
      name: /rag\.supply\.quickStockAriaLabel/i,
    })
    expect(stockInput).toBeDefined()
    expect((stockInput as HTMLInputElement).value).toBe('50')
  })

  it('calls updateSupplyItem with new value on confirm', async () => {
    const item = makeSupplyItem({ id: 'supply-quick-1', currentStock: 50, unit: 'mL' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.updateStock'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.updateStock'))
    })

    const stockInput = screen.getByRole('spinbutton', {
      name: /rag\.supply\.quickStockAriaLabel/i,
    })
    fireEvent.change(stockInput, { target: { value: '75' } })

    const confirmBtn = screen.getByRole('button', { name: /rag\.supply\.confirm/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    await waitFor(() =>
      expect(mockUpdateSupplyItem).toHaveBeenCalledWith(
        'supply-quick-1',
        expect.objectContaining({ currentStock: 75 }),
      ),
    )
  })

  it('does not call updateSupplyItem when value is negative', async () => {
    const item = makeSupplyItem({ id: 'supply-1', currentStock: 50 })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.updateStock'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.updateStock'))
    })

    const stockInput = screen.getByRole('spinbutton', {
      name: /rag\.supply\.quickStockAriaLabel/i,
    })
    fireEvent.change(stockInput, { target: { value: '-10' } })

    const confirmBtn = screen.getByRole('button', { name: /rag\.supply\.confirm/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    expect(mockUpdateSupplyItem).not.toHaveBeenCalled()
  })

  it('cancels inline edit without saving when X is clicked', async () => {
    const item = makeSupplyItem({ id: 'supply-1', currentStock: 50 })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => screen.getByText('rag.supply.updateStock'))

    await act(async () => {
      fireEvent.click(screen.getByText('rag.supply.updateStock'))
    })

    const cancelBtn = screen.getByRole('button', { name: /rag\.supply\.cancel/i })
    await act(async () => { fireEvent.click(cancelBtn) })

    expect(mockUpdateSupplyItem).not.toHaveBeenCalled()
    // Back to list view — update link visible again
    expect(screen.getByText('rag.supply.updateStock')).toBeDefined()
  })
})

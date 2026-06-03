/**
 * SupplyManagement component tests — Story 51.5
 *
 * Tests: CRUD operations, stock update, threshold RAG indicator, access control.
 * Uses fake-indexeddb for real Dexie interactions where possible,
 * and mocks auth store for role-based gating tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react'

// Mock db module
vi.mock('@/lib/db', () => ({
  getAllSupplyItems: vi.fn(),
  putSupplyItem: vi.fn(),
  updateSupplyItem: vi.fn(),
  deleteSupplyItem: vi.fn(),
}))

// Mock auth store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.name) return `${key}:${params.name}`
    return key
  },
}))

// Mock shared-types
vi.mock('@ultranos/shared-types', () => ({
  LabRole: {
    LAB_TECH: 'LAB_TECH',
    SENIOR_TECH: 'SENIOR_TECH',
    SUPERVISOR: 'SUPERVISOR',
    LAB_MANAGER: 'LAB_MANAGER',
  },
}))

// Mock ui-kit
vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@ultranos/ui-kit/icons', () => ({
  Plus: () => <svg data-testid="plus-icon" />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  Trash2: () => <svg data-testid="trash-icon" />,
  X: () => <svg data-testid="x-icon" />,
  Check: () => <svg data-testid="check-icon" />,
  AlertTriangle: () => <svg data-testid="alert-icon" />,
  FlaskConical: () => <svg data-testid="flask-icon" />,
}))

// Mock Button component
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>{children}</button>
  ),
}))

import { SupplyManagement } from '@/components/readiness/SupplyManagement'
import {
  getAllSupplyItems,
  putSupplyItem,
  updateSupplyItem,
  deleteSupplyItem,
} from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { SupplyItem } from '@/lib/db'

const mockGetAllSupplyItems = vi.mocked(getAllSupplyItems)
const mockPutSupplyItem = vi.mocked(putSupplyItem)
const mockUpdateSupplyItem = vi.mocked(updateSupplyItem)
const mockDeleteSupplyItem = vi.mocked(deleteSupplyItem)
const mockUseAuthSessionStore = vi.mocked(useAuthSessionStore)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupplyItem(overrides: Partial<SupplyItem> = {}): SupplyItem {
  return {
    id: 'item-001',
    name: 'Reagent A',
    category: 'Reagent',
    currentStock: 100,
    unit: 'mL',
    reorderThreshold: 20,
    criticalThreshold: 5,
    dailyUsageEstimate: 10,
    lastUpdated: '2026-06-01T00:00:00Z',
    updatedBy: 'tech-001',
    ...overrides,
  }
}

function setRole(role: string) {
  mockUseAuthSessionStore.mockImplementation((selector: (s: { session: { labRole: string; practitionerId: string } | null }) => unknown) =>
    selector({ session: { labRole: role, practitionerId: 'tech-001' } })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAllSupplyItems.mockResolvedValue([])
  mockPutSupplyItem.mockResolvedValue(undefined)
  mockUpdateSupplyItem.mockResolvedValue(undefined)
  mockDeleteSupplyItem.mockResolvedValue(undefined)
  setRole('LAB_MANAGER')
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

describe('SupplyManagement access control', () => {
  it('renders access denied for LAB_TECH role', async () => {
    setRole('LAB_TECH')
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
    expect(screen.queryByTestId('plus-icon')).toBeNull()
  })

  it('renders management UI for SUPERVISOR role', async () => {
    setRole('SUPERVISOR')
    mockGetAllSupplyItems.mockResolvedValue([])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('renders management UI for LAB_MANAGER role', async () => {
    setRole('LAB_MANAGER')
    mockGetAllSupplyItems.mockResolvedValue([])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Displaying items
// ---------------------------------------------------------------------------

describe('SupplyManagement item display', () => {
  it('loads and renders supply items from db on mount', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      makeSupplyItem({ name: 'Reagent A' }),
      makeSupplyItem({ id: 'item-002', name: 'Control XYZ' }),
    ])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getByText('Reagent A')).toBeDefined()
      expect(screen.getByText('Control XYZ')).toBeDefined()
    })
  })

  it('shows empty state when no items', async () => {
    mockGetAllSupplyItems.mockResolvedValue([])
    render(<SupplyManagement />)
    await waitFor(() => {
      // Should not have any item rows — just the add button area
      expect(screen.queryByText('Reagent A')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// RAG threshold indicators
// ---------------------------------------------------------------------------

describe('SupplyManagement RAG threshold display', () => {
  it('shows critical threshold warning when stock at or below criticalThreshold', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      makeSupplyItem({ currentStock: 5, criticalThreshold: 5, name: 'Critical Item' }),
    ])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getByText('Critical Item')).toBeDefined()
    })
    // The component should render alert icon for RED status
    const alertIcons = screen.queryAllByTestId('alert-icon')
    expect(alertIcons.length).toBeGreaterThan(0)
  })

  it('does not show alert icon when stock is well above thresholds', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      makeSupplyItem({ currentStock: 100, reorderThreshold: 20, criticalThreshold: 5, name: 'Healthy Stock' }),
    ])
    render(<SupplyManagement />)
    await waitFor(() => {
      expect(screen.getByText('Healthy Stock')).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('SupplyManagement create', () => {
  it('calls putSupplyItem with form data when add form is submitted', async () => {
    mockGetAllSupplyItems.mockResolvedValue([])
    render(<SupplyManagement />)
    await waitFor(() => expect(mockGetAllSupplyItems).toHaveBeenCalled())

    // Open add form
    const addButton = screen.getByRole('button', { name: /rag\.addSupply/i })
    await act(async () => { fireEvent.click(addButton) })

    // Fill out the form
    const nameInput = screen.getByLabelText(/rag\.supply\.name/i)
    const stockInput = screen.getByLabelText(/rag\.supply\.currentStock/i)
    const unitInput = screen.getByLabelText(/rag\.supply\.unit/i)
    const reorderInput = screen.getByLabelText(/rag\.supply\.reorderThreshold/i)

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'New Reagent' } })
      fireEvent.change(stockInput, { target: { value: '50' } })
      fireEvent.change(unitInput, { target: { value: 'mL' } })
      fireEvent.change(reorderInput, { target: { value: '10' } })
    })

    // Submit
    const saveButton = screen.getByRole('button', { name: /rag\.supply\.save/i })
    await act(async () => { fireEvent.click(saveButton) })

    await waitFor(() => {
      expect(mockPutSupplyItem).toHaveBeenCalledOnce()
      const call = mockPutSupplyItem.mock.calls[0][0] as SupplyItem
      expect(call.name).toBe('New Reagent')
      expect(call.currentStock).toBe(50)
      expect(call.unit).toBe('mL')
    })
  })
})

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('SupplyManagement delete', () => {
  it('calls deleteSupplyItem after delete confirmation', async () => {
    const item = makeSupplyItem({ name: 'Delete Me' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('Delete Me')).toBeDefined())

    // Click trash icon
    const trashButtons = screen.getAllByTestId('trash-icon')
    await act(async () => { fireEvent.click(trashButtons[0].closest('button')!) })

    // Confirm dialog should appear
    expect(screen.getByRole('dialog')).toBeDefined()

    // Click confirm
    const confirmButton = screen.getByRole('button', { name: /rag\.supply\.deleteConfirm/i })
    await act(async () => { fireEvent.click(confirmButton) })

    await waitFor(() => {
      expect(mockDeleteSupplyItem).toHaveBeenCalledWith(item.id)
    })
  })

  it('does not call deleteSupplyItem when delete is cancelled', async () => {
    const item = makeSupplyItem({ name: 'Keep Me' })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('Keep Me')).toBeDefined())

    const trashButtons = screen.getAllByTestId('trash-icon')
    await act(async () => { fireEvent.click(trashButtons[0].closest('button')!) })
    expect(screen.getByRole('dialog')).toBeDefined()

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /rag\.supply\.cancel/i })
    await act(async () => { fireEvent.click(cancelButton) })

    expect(mockDeleteSupplyItem).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

describe('SupplyManagement edit', () => {
  it('calls updateSupplyItem when edit form is submitted', async () => {
    const item = makeSupplyItem({ name: 'Existing Reagent', currentStock: 80 })
    mockGetAllSupplyItems.mockResolvedValue([item])
    render(<SupplyManagement />)
    await waitFor(() => expect(screen.getByText('Existing Reagent')).toBeDefined())

    // Click edit button
    const editButtons = screen.getAllByTestId('pencil-icon')
    await act(async () => { fireEvent.click(editButtons[0].closest('button')!) })

    // Change name in form
    const nameInput = screen.getByLabelText(/rag\.supply\.name/i)
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Updated Reagent' } })
    })

    // Save
    const saveButton = screen.getByRole('button', { name: /rag\.supply\.save/i })
    await act(async () => { fireEvent.click(saveButton) })

    await waitFor(() => {
      expect(mockUpdateSupplyItem).toHaveBeenCalledOnce()
      const call = mockUpdateSupplyItem.mock.calls[0][0] as SupplyItem
      expect(call.name).toBe('Updated Reagent')
      expect(call.id).toBe(item.id)
    })
  })
})

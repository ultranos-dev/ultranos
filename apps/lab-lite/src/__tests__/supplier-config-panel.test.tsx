/**
 * Story 48.2 — Component tests for SupplierConfigPanel
 * Task 10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { SupplierConfig, ReagentInventoryEntry } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock i18n
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'title': 'Supplier Configuration',
      'addSupplier': 'Add Supplier',
      'noSuppliers': 'No suppliers configured.',
      'noSupplier': 'No supplier',
      'name': 'Supplier Name',
      'leadTimeDays': 'Lead Time (days)',
      'contactInfo': 'Contact Info',
      'notes': 'Notes',
      'save': 'Save',
      'saving': 'Saving...',
      'cancel': 'Cancel',
      'edit': 'Edit',
      'validation.nameRequired': 'Supplier name is required.',
      'validation.leadTimeRange': 'Lead time must be 1–365 days.',
      'reagent': 'Reagent',
      'defaultSupplier': 'Default Supplier',
      'mappingTitle': 'Reagent–Supplier Mapping',
      'assignSupplier': 'Assign supplier',
      'leadTime': '{days} day lead time',
    }
    return map[key] ?? key
  },
}))

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockSuppliers: SupplierConfig[] = []
const mockReagents: ReagentInventoryEntry[] = []
const mockMappings: { reagentId: string; supplierId: string }[] = []

const mockAddSupplier = vi.fn(async (entry: Omit<SupplierConfig, 'id'>) => {
  const id = mockSuppliers.length + 1
  mockSuppliers.push({ ...entry, id })
  return id
})
const mockUpdateSupplier = vi.fn()
const mockDeleteSupplier = vi.fn(async (id: number) => {
  const idx = mockSuppliers.findIndex((s) => s.id === id)
  if (idx >= 0) mockSuppliers.splice(idx, 1)
})
const mockSetReagentSupplier = vi.fn()
const mockRemoveReagentSupplier = vi.fn()

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getAllSuppliers: vi.fn(async () => [...mockSuppliers]),
    getAllReagents: vi.fn(async () => [...mockReagents]),
    getAllReagentSupplierMappings: vi.fn(async () => [...mockMappings]),
    addSupplier: mockAddSupplier,
    updateSupplier: mockUpdateSupplier,
    deleteSupplier: mockDeleteSupplier,
    setReagentSupplier: mockSetReagentSupplier,
    removeReagentSupplier: mockRemoveReagentSupplier,
  }
})

// Mock uuid
vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }))

// ---------------------------------------------------------------------------
// Import component
// ---------------------------------------------------------------------------

const { SupplierConfigPanel } = await import('../components/scheduler/SupplierConfigPanel')

beforeEach(() => {
  mockSuppliers.length = 0
  mockReagents.length = 0
  mockMappings.length = 0
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SupplierConfigPanel', () => {
  it('renders empty state when no suppliers', async () => {
    render(<SupplierConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText('No suppliers configured.')).toBeDefined()
    })
  })

  it('renders Add Supplier button', async () => {
    render(<SupplierConfigPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('add-supplier')).toBeDefined()
    })
  })

  it('shows supplier form when Add Supplier clicked', async () => {
    render(<SupplierConfigPanel />)
    await waitFor(() => screen.getByTestId('add-supplier'))
    fireEvent.click(screen.getByTestId('add-supplier'))
    expect(screen.getByLabelText('Supplier Name')).toBeDefined()
    expect(screen.getByLabelText('Lead Time (days)')).toBeDefined()
  })

  it('validates empty supplier name', async () => {
    render(<SupplierConfigPanel />)
    await waitFor(() => screen.getByTestId('add-supplier'))
    fireEvent.click(screen.getByTestId('add-supplier'))

    // Clear name and submit
    const nameInput = screen.getByLabelText('Supplier Name')
    fireEvent.change(nameInput, { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(screen.getByText('Supplier name is required.')).toBeDefined()
    })
    expect(mockAddSupplier).not.toHaveBeenCalled()
  })

  it('validates lead time out of range', async () => {
    render(<SupplierConfigPanel />)
    await waitFor(() => screen.getByTestId('add-supplier'))
    fireEvent.click(screen.getByTestId('add-supplier'))

    const nameInput = screen.getByLabelText('Supplier Name')
    fireEvent.change(nameInput, { target: { value: 'Test Supplier' } })

    const leadInput = screen.getByLabelText('Lead Time (days)')
    fireEvent.change(leadInput, { target: { value: '400' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(screen.getByText('Lead time must be 1–365 days.')).toBeDefined()
    })
  })

  it('renders existing suppliers', async () => {
    mockSuppliers.push({
      id: 1,
      supplierId: 's1',
      supplierName: 'MedSupply Co',
      leadTimeDays: 21,
      contactInfo: '+93-700-111111',
      notes: 'Reliable',
      updatedAt: new Date().toISOString(),
    })
    render(<SupplierConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText('MedSupply Co')).toBeDefined()
    })
  })

  it('shows edit form when Edit clicked', async () => {
    mockSuppliers.push({
      id: 1,
      supplierId: 's1',
      supplierName: 'MedSupply Co',
      leadTimeDays: 21,
      contactInfo: '',
      notes: '',
      updatedAt: new Date().toISOString(),
    })
    render(<SupplierConfigPanel />)
    await waitFor(() => screen.getByTestId('edit-supplier-1'))
    fireEvent.click(screen.getByTestId('edit-supplier-1'))
    expect(screen.getByDisplayValue('MedSupply Co')).toBeDefined()
  })

  it('calls deleteSupplier when delete clicked', async () => {
    mockSuppliers.push({
      id: 1,
      supplierId: 's1',
      supplierName: 'Old Supplier',
      leadTimeDays: 10,
      contactInfo: '',
      notes: '',
      updatedAt: new Date().toISOString(),
    })
    render(<SupplierConfigPanel />)
    await waitFor(() => screen.getByTestId('delete-supplier-1'))
    fireEvent.click(screen.getByTestId('delete-supplier-1'))
    await waitFor(() => {
      expect(mockDeleteSupplier).toHaveBeenCalledWith(1)
    })
  })

  it('renders reagent-supplier mapping table when both exist', async () => {
    mockSuppliers.push({
      id: 1,
      supplierId: 's1',
      supplierName: 'Kabul Med',
      leadTimeDays: 30,
      contactInfo: '',
      notes: '',
      updatedAt: new Date().toISOString(),
    })
    mockReagents.push({
      id: 1,
      reagentId: 'r1',
      name: 'Glucose Strips',
      lotNumber: 'LOT001',
      openDate: '2026-01-01',
      expiryDate: '2026-12-31',
      expectedTests: 200,
      testsPerformed: 0,
      unit: 'strips',
      costPerUnit: 100,
      status: 'ACTIVE' as import('../lib/db').ReagentStatus,
      disposalDate: null,
      disposalReason: null,
      disposalNotes: null,
      remainingAtDisposal: null,
      linkedTestCode: '14749-6',
      hlcTimestamp: '',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending' as import('../lib/db').ReagentSyncStatus,
    })
    render(<SupplierConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText('Reagent–Supplier Mapping')).toBeDefined()
      expect(screen.getByText('Glucose Strips')).toBeDefined()
    })
  })
})

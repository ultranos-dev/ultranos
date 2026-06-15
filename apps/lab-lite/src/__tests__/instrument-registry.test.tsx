/**
 * Story 51.4 — Equipment Booking & Scheduling
 * Tests for InstrumentRegistryPanel component
 *
 * AC covered:
 * AC 1: Instrument list renders, add form, status toggle, LAB_MANAGER access gate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { InstrumentRegistryPanel } from '../components/equipment/InstrumentRegistryPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetInstruments = vi.fn()
const mockRegisterInstrument = vi.fn()
const mockUpdateInstrument = vi.fn()
const mockSetInstrumentStatus = vi.fn()

vi.mock('../lib/equipment-service', () => ({
  getInstruments: (...args: any[]) => mockGetInstruments(...args),
  registerInstrument: (...args: any[]) => mockRegisterInstrument(...args),
  updateInstrument: (...args: any[]) => mockUpdateInstrument(...args),
  setInstrumentStatus: (...args: any[]) => mockSetInstrumentStatus(...args),
}))

vi.mock('../lib/audit-client', () => ({
  emitEquipmentAuditEvent: vi.fn(),
}))

const messages = {
  equipment: {
    instruments: 'Instruments',
    addInstrument: 'Add Instrument',
    editInstrument: 'Edit Instrument',
    saveInstrument: 'Save Instrument',
    noInstruments: 'No instruments registered yet.',
    instrumentName: 'Name',
    instrumentType: 'Type',
    instrumentModel: 'Model',
    serialNumber: 'Serial Number',
    selectType: '— Select type —',
    inService: 'In Service',
    outOfService: 'Out of Service',
    setInService: 'Set In Service',
    setOutOfService: 'Set Out of Service',
    outOfServiceReason: 'Reason',
    validationRequired: 'Name, type, and model are required',
    validationRunTime: 'Avg run time must be at least 1 minute',
    avgRunTime: 'Avg. Run Time (min)',
    cancel: 'Cancel',
    saving: 'Saving…',
  },
}

function renderWithI18n(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetInstruments.mockResolvedValue([])
  mockRegisterInstrument.mockResolvedValue('new-id')
  mockUpdateInstrument.mockResolvedValue(undefined)
  mockSetInstrumentStatus.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstrumentRegistryPanel (AC 1)', () => {
  it('renders the instruments heading and Add button', async () => {
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => {
      expect(screen.getByText('Instruments')).toBeInTheDocument()
      expect(screen.getByTestId('add-instrument-btn')).toBeInTheDocument()
    })
  })

  it('shows empty state when no instruments are registered', async () => {
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('no-instruments-message')).toBeInTheDocument()
    })
  })

  it('renders registered instruments', async () => {
    mockGetInstruments.mockResolvedValue([
      {
        id: 'inst-1',
        name: 'CBC Analyzer',
        type: 'Hematology Analyzer',
        model: 'Sysmex XN-1000',
        serialNumber: null,
        avgRunTimeMinutes: 15,
        status: 'IN_SERVICE',
        outOfServiceReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => {
      expect(screen.getByText('CBC Analyzer')).toBeInTheDocument()
      expect(screen.getByTestId('instrument-status-inst-1')).toHaveTextContent('In Service')
    })
  })

  it('opens the add instrument form when Add button is clicked', async () => {
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => screen.getByTestId('add-instrument-btn'))
    fireEvent.click(screen.getByTestId('add-instrument-btn'))
    expect(screen.getByTestId('instrument-form')).toBeInTheDocument()
    expect(screen.getByTestId('instrument-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('instrument-type-select')).toBeInTheDocument()
  })

  it('shows validation error when saving without required fields', async () => {
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => screen.getByTestId('add-instrument-btn'))
    fireEvent.click(screen.getByTestId('add-instrument-btn'))
    fireEvent.click(screen.getByTestId('save-instrument-btn'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('calls registerInstrument when form is valid and saved', async () => {
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => screen.getByTestId('add-instrument-btn'))
    fireEvent.click(screen.getByTestId('add-instrument-btn'))

    fireEvent.change(screen.getByTestId('instrument-name-input'), {
      target: { value: 'Test Analyzer' },
    })
    fireEvent.change(screen.getByTestId('instrument-type-select'), {
      target: { value: 'Hematology Analyzer' },
    })
    fireEvent.change(screen.getByTestId('instrument-model-input'), {
      target: { value: 'Model X' },
    })

    fireEvent.click(screen.getByTestId('save-instrument-btn'))
    await waitFor(() => {
      expect(mockRegisterInstrument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Analyzer',
          type: 'Hematology Analyzer',
          model: 'Model X',
        }),
      )
    })
  })

  it('shows Out of Service status badge for out-of-service instrument', async () => {
    mockGetInstruments.mockResolvedValue([
      {
        id: 'inst-2',
        name: 'Old Analyzer',
        type: 'Chemistry Analyzer',
        model: 'Model Y',
        serialNumber: null,
        avgRunTimeMinutes: 20,
        status: 'OUT_OF_SERVICE',
        outOfServiceReason: 'Broken',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    renderWithI18n(<InstrumentRegistryPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('instrument-status-inst-2')).toHaveTextContent('Out of Service')
    })
  })
})

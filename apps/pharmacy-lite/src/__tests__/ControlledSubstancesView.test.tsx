import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Hoisted mock factories
const { mockReverse, mockToArray, mockOrderBy, mockWhere } = vi.hoisted(() => {
  const mockToArray = vi.fn()
  const mockReverse = vi.fn().mockReturnValue({ toArray: mockToArray })
  const mockOrderBy = vi.fn().mockReturnValue({ reverse: mockReverse })
  const mockBetween = vi.fn().mockReturnValue({ reverse: mockReverse })
  const mockAboveOrEqual = vi.fn().mockReturnValue({ reverse: mockReverse })
  const mockBelowOrEqual = vi.fn().mockReturnValue({ reverse: mockReverse })
  const mockWhere = vi.fn().mockReturnValue({
    between: mockBetween,
    aboveOrEqual: mockAboveOrEqual,
    belowOrEqual: mockBelowOrEqual,
  })
  return { mockReverse, mockToArray, mockOrderBy, mockWhere }
})

vi.mock('@/lib/db', () => ({
  db: {
    dispenses: {
      orderBy: mockOrderBy,
      where: mockWhere,
    },
  },
}))

vi.mock('@/lib/procurement/stock-count-service', () => ({
  getControlledSubstanceBalances: vi.fn().mockResolvedValue([]),
}))

import { ControlledSubstancesView } from '@/components/pharmacy/ControlledSubstancesView'

// Helper: minimal LocalMedicationDispense with controlledSubstanceSchedule
function makeDispense(
  id: string,
  schedule: string | undefined,
  medicationDisplay: string,
) {
  return {
    id,
    resourceType: 'MedicationDispense' as const,
    status: 'completed' as const,
    subject: { reference: `Patient/${id}` },
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:ultranos:medication',
          code: `code-${id}`,
          display: medicationDisplay,
        },
      ],
      text: medicationDisplay,
    },
    meta: { lastUpdated: '2026-09-08T10:00:00.000Z', versionId: '1' },
    _ultranos: {
      hlcTimestamp: '2026-09-08T10:00:00.000Z:0:node1',
      createdAt: '2026-09-08T10:00:00.000Z',
      isOfflineCreated: false,
      ...(schedule !== undefined ? { controlledSubstanceSchedule: schedule } : {}),
    },
  }
}

describe('ControlledSubstancesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToArray.mockResolvedValue([])
  })

  it('shows only the controlled dispense (with schedule) and hides the non-controlled one', async () => {
    const controlled = makeDispense('c1', 'II', 'Morphine 10mg')
    const nonControlled = makeDispense('nc1', undefined, 'Amoxicillin 500mg')

    mockToArray.mockResolvedValue([controlled, nonControlled])

    render(<ControlledSubstancesView />)

    // The controlled row must appear with the schedule value
    await waitFor(() => {
      expect(screen.getByText('II')).toBeInTheDocument()
    })

    // The non-controlled medication must NOT appear (filtered out)
    expect(screen.queryByText('Amoxicillin 500mg')).not.toBeInTheDocument()

    // The controlled medication appears
    expect(screen.getByText('Morphine 10mg')).toBeInTheDocument()
  })

  it('displays schedule value III for a Schedule III dispense', async () => {
    const controlled = makeDispense('c2', 'III', 'Codeine 30mg')
    mockToArray.mockResolvedValue([controlled])

    render(<ControlledSubstancesView />)

    await waitFor(() => {
      expect(screen.getByText('III')).toBeInTheDocument()
    })
    expect(screen.getByText('Codeine 30mg')).toBeInTheDocument()
  })

  it('shows empty state when no controlled dispenses exist (only non-controlled)', async () => {
    const nonControlled = makeDispense('nc2', undefined, 'Ibuprofen 400mg')
    mockToArray.mockResolvedValue([nonControlled])

    render(<ControlledSubstancesView />)

    // After filtering, zero records → empty state key renders
    await waitFor(() => {
      // i18n mock returns key literals; 'noRecords' is the empty state title key
      expect(screen.getByText('noRecords')).toBeInTheDocument()
    })
    expect(screen.queryByText('Ibuprofen 400mg')).not.toBeInTheDocument()
  })

  it('shows empty state when db returns no dispenses at all', async () => {
    mockToArray.mockResolvedValue([])

    render(<ControlledSubstancesView />)

    await waitFor(() => {
      expect(screen.getByText('noRecords')).toBeInTheDocument()
    })
  })
})

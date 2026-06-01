/**
 * Story 54.2 — SamplesCollectedLog Component Tests (Task 14.5)
 *
 * Tests for:
 *  - Today's samples are shown
 *  - Each row shows: type badge, label number, firstName + age ONLY (data minimization)
 *  - No edit or delete buttons rendered (append-only)
 *  - Empty state when no samples
 *  - Count badge shows correct count
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SamplesCollectedLog } from '@/components/chw/SamplesCollectedLog'
import type { CHWSampleCollection } from '@/types/chw-mode'

// ---------------------------------------------------------------------------
// Mocks — must be defined before vi.mock factory (use vi.hoisted)
// ---------------------------------------------------------------------------

const { mockGetTodayCHWSamples } = vi.hoisted(() => ({
  mockGetTodayCHWSamples: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `${params.count} ${key}`
    if (params?.age !== undefined) return `${params.age} yrs`
    return key
  },
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Clock: () => <svg data-testid="clock-icon" aria-hidden />,
}))

vi.mock('@/lib/db', () => ({
  getTodayCHWSamples: mockGetTodayCHWSamples,
}))

const twoSamples: CHWSampleCollection[] = [
  {
    id: 'sample-001',
    patientRef: 'Patient/pat-001',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    sampleType: 'blood',
    labelNumber: 'CHW-0601-001',
    collectedBy: 'chw-001',
    collectedAt: '2026-06-01T08:00:00.000Z-0-node1',
    syncStatus: 'pending',
  },
  {
    id: 'sample-002',
    patientRef: 'Patient/pat-002',
    patientFirstName: 'Fatima',
    patientAge: 22,
    sampleType: 'urine',
    labelNumber: 'CHW-0601-002',
    collectedBy: 'chw-001',
    collectedAt: '2026-06-01T09:00:00.000Z-0-node1',
    syncStatus: 'pending',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SamplesCollectedLog', () => {
  it('renders all samples from today', async () => {
    mockGetTodayCHWSamples.mockResolvedValue(twoSamples)
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByText('CHW-0601-001')).toBeInTheDocument()
      expect(screen.getByText('CHW-0601-002')).toBeInTheDocument()
    })
  })

  it('shows count badge with correct number', async () => {
    mockGetTodayCHWSamples.mockResolvedValue(twoSamples)
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('displays firstName and age ONLY — no last name or DOB (data minimization, AC #10)', async () => {
    mockGetTodayCHWSamples.mockResolvedValue(twoSamples)
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByText(/Ahmad/)).toBeInTheDocument()
      expect(screen.getByText(/Fatima/)).toBeInTheDocument()
    })
    // Patient ref should never appear
    expect(screen.queryByText('Patient/pat-001')).not.toBeInTheDocument()
    expect(screen.queryByText('Patient/pat-002')).not.toBeInTheDocument()
  })

  it('shows empty state when no samples collected', async () => {
    mockGetTodayCHWSamples.mockResolvedValue([])
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByText('empty')).toBeInTheDocument()
    })
  })

  it('does NOT render edit or delete buttons (append-only, AC #5)', async () => {
    mockGetTodayCHWSamples.mockResolvedValue(twoSamples)
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByText('CHW-0601-001')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /edit|delete|remove/i })).not.toBeInTheDocument()
  })

  it('renders list with proper accessibility role', async () => {
    mockGetTodayCHWSamples.mockResolvedValue(twoSamples)
    render(<SamplesCollectedLog />)
    await waitFor(() => {
      expect(screen.getByRole('list')).toBeInTheDocument()
    })
  })
})

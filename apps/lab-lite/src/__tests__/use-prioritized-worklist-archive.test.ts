/**
 * use-prioritized-worklist-archive.test.ts
 *
 * Archive feature: the worklist has an Active/Archived status filter.
 * - Active shelf shows pipeline-active samples that are NOT archived.
 * - Archived shelf shows samples flagged archived === true.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act, waitFor } from '@testing-library/react'
import { getDb } from '../lib/db'
import type { FhirSpecimen } from '@ultranos/shared-types'

vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

function makeSpecimen(
  id: string,
  opts: { pipelineStatus?: FhirSpecimen['_ultranos']['pipelineStatus']; archived?: boolean } = {},
): FhirSpecimen {
  const { pipelineStatus = 'received', archived } = opts
  return {
    id,
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: `Patient/p-${id}` },
    receivedTime: '2026-09-20T08:00:00.000Z',
    request: [{ reference: `ServiceRequest/o-${id}` }],
    meta: { lastUpdated: '2026-09-20T08:00:00.000Z', versionId: '1' },
    _ultranos: {
      labSampleId: `LAB-20260920-00${id}`,
      hlcTimestamp: 'hlc-ts',
      createdAt: '2026-09-20T08:00:00.000Z',
      isOfflineCreated: false,
      pipelineStatus,
      sampleCondition: 'acceptable',
      ...(archived !== undefined ? { archived } : {}),
    },
  } as FhirSpecimen
}

describe('usePrioritizedWorklist — Active/Archived filter', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.orders.clear()
    await db.verified_patients.clear()
    await db.priorityOverrides.clear()
    vi.restoreAllMocks()

    await db.samples.bulkPut([
      makeSpecimen('1'), // active, not archived
      makeSpecimen('2', { archived: false }), // active, explicitly not archived
      makeSpecimen('3', { archived: true }), // archived
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to the active shelf and excludes archived samples', async () => {
    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.statusFilter).toBe('active')
    expect(result.current.samples).toHaveLength(2)
    expect(result.current.samples.map((s) => s.sampleId).sort()).toEqual(['1', '2'])
  })

  it('shows only archived samples when statusFilter is switched to archived', async () => {
    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setStatusFilter('archived')
    })

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples[0]!.sampleId).toBe('3')
  })

  it('setArchived moves a sample off the active shelf', async () => {
    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.samples).toHaveLength(2)

    await act(async () => {
      await result.current.setArchived('1', true)
    })

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples.map((s) => s.sampleId)).toEqual(['2'])

    const stored = await getDb().samples.get('1')
    expect(stored!._ultranos.archived).toBe(true)
  })
})

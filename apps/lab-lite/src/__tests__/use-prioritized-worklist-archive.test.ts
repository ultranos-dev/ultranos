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
  opts: {
    pipelineStatus?: FhirSpecimen['_ultranos']['pipelineStatus']
    archived?: boolean
    patientFirstName?: string
    patientAge?: number
    orderedTests?: Array<{ loincCode: string; loincDisplay: string }>
  } = {},
): FhirSpecimen {
  const { pipelineStatus = 'received', archived, patientFirstName, patientAge, orderedTests } = opts
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
      ...(patientFirstName ? { patientFirstName } : {}),
      ...(patientAge !== undefined ? { patientAge } : {}),
      ...(orderedTests ? { orderedTests } : {}),
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
    await db.archived_samples.clear()
    vi.restoreAllMocks()

    await db.samples.bulkPut([makeSpecimen('1'), makeSpecimen('2'), makeSpecimen('3')])
    // Archive state is authoritative in the dedicated table (survives re-hydration).
    await db.archived_samples.put({ sampleId: '3', archivedAt: '2026-09-20T08:00:00.000Z' })
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

    // Authoritative archive state is the dedicated table (durable across re-hydration).
    const archivedRow = await getDb().archived_samples.get('1')
    expect(archivedRow).toBeDefined()
  })

  it('archive state persists even when the specimen row is re-hydrated without the flag', async () => {
    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setArchived('1', true)
    })
    await waitFor(() => expect(result.current.samples.map((s) => s.sampleId)).toEqual(['2']))

    // Simulate a boot re-hydration overwriting the specimen row WITHOUT archived.
    await getDb().samples.put(makeSpecimen('1'))

    act(() => result.current.setStatusFilter('archived'))
    // '1' and '3' are archived (per the table), regardless of the wiped row flag.
    await waitFor(() => expect(result.current.samples.map((s) => s.sampleId).sort()).toEqual(['1', '3']))
  })
})

describe('usePrioritizedWorklist — patient/test resolution from specimen stamp', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.orders.clear()
    await db.verified_patients.clear()
    await db.priorityOverrides.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves name/age/test from the specimen stamp when the order row is gone', async () => {
    // No order row seeded — the stamp is the only source (durable offline-first path).
    await getDb().samples.put(
      makeSpecimen('99', {
        patientFirstName: 'Layla',
        patientAge: 29,
        orderedTests: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
      }),
    )

    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    const s = result.current.samples[0]!
    expect(s.patientRef.firstName).toBe('Layla')
    expect(s.patientRef.age).toBe(29)
    expect(s.loincDisplay).toBe('CBC')
  })
})

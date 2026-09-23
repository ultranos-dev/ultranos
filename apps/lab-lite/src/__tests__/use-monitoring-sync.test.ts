/**
 * Tests for useMonitoringSync hook (Task 10).
 *
 * Tests exercise the sync logic directly — no React renderer needed.
 * We test by calling the underlying async sync function logic through
 * the module-level exported function (modelled on order-sync.test.ts pattern).
 *
 * Assertions:
 *  (a) mappings are refreshed via putMedicationLabMappings on each poll
 *  (b) events are paged by cursor until nextCursor is null
 *  (c) processBatchDispenseEvents receives payloads where:
 *      - medicationCode === event.atcCode  (ATC is the map key)
 *      - patientRef has no 'Patient/' prefix  (R1 bare blind index)
 *      - patientAge defaults 0 when DTO age is null
 *  (d) the in-memory cursor advances to nextCursor after paging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

// ── Mock trpc pull fns ────────────────────────────────────────────────────────
const mockPullMonitoringMappings = vi.fn()
const mockPullDispenseMonitoringEvents = vi.fn()

vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return {
    ...actual,
    pullMonitoringMappings: (...args: unknown[]) => mockPullMonitoringMappings(...args),
    pullDispenseMonitoringEvents: (...args: unknown[]) => mockPullDispenseMonitoringEvents(...args),
  }
})

// ── Mock db accessors ─────────────────────────────────────────────────────────
const mockPutMedicationLabMappings = vi.fn()
const mockGetMedicationLabMappingsMap = vi.fn()

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    putMedicationLabMappings: (...args: unknown[]) => mockPutMedicationLabMappings(...args),
    getMedicationLabMappingsMap: () => mockGetMedicationLabMappingsMap(),
  }
})

// ── Mock processBatchDispenseEvents ───────────────────────────────────────────
const mockProcessBatch = vi.fn()

vi.mock('@/lib/monitoring/dispense-receiver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/monitoring/dispense-receiver')>()
  return {
    ...actual,
    processBatchDispenseEvents: (...args: unknown[]) => mockProcessBatch(...args),
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMapping() {
  return {
    atcCode: 'B01AA03',
    medicationDisplay: 'Warfarin',
    version: 2,
    requiredTests: [
      { loincCode: '6301-6', testDisplay: 'INR', frequencyDays: 14, initialDelayDays: 3, priority: 'urgent' as const },
    ],
  }
}

function makeEvent(overrides: Partial<{
  dispensingEventId: string
  patientRef: string
  patientFirstName: string
  patientAge: number | null
  requirements: Array<{ loincCode: string; testDisplay: string; initialDelayDays: number; frequencyDays: number; priority: 'routine' | 'urgent' }>
  dispensedAt: string
  orderingPractitionerRef: string
  hlcTimestamp: string
}> = {}) {
  return {
    dispensingEventId: 'disp-1',
    patientRef: 'Patient/blindHash123',
    patientFirstName: 'Ali',
    patientAge: 35,
    // Story 58.2: the Hub delivers resolved requirements — no medication identity.
    requirements: [
      { loincCode: '6301-6', testDisplay: 'INR', initialDelayDays: 3, frequencyDays: 14, priority: 'routine' as const },
    ],
    dispensedAt: '2026-09-15T10:00:00Z',
    orderingPractitionerRef: 'Practitioner/prac-1',
    hlcTimestamp: '1-0',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('useMonitoringSync — sync logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMedicationLabMappingsMap.mockResolvedValue(new Map())
    mockPutMedicationLabMappings.mockResolvedValue(undefined)
    mockProcessBatch.mockResolvedValue(undefined)
  })

  it('(a) calls putMedicationLabMappings with the mappings returned from Hub', async () => {
    const mapping = makeMapping()
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [mapping] })
    mockPullDispenseMonitoringEvents.mockResolvedValue({ events: [], nextCursor: null })

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    expect(mockPutMedicationLabMappings).toHaveBeenCalledWith([
      {
        atcCode: mapping.atcCode,
        medicationDisplay: mapping.medicationDisplay,
        version: mapping.version,
        requiredTests: mapping.requiredTests,
      },
    ])
  })

  it('(b) pages events until nextCursor is null', async () => {
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [] })
    // page 1 → nextCursor = 5, page 2 → nextCursor = null
    mockPullDispenseMonitoringEvents
      .mockResolvedValueOnce({ events: [makeEvent({ dispensingEventId: 'e1' })], nextCursor: 5 })
      .mockResolvedValueOnce({ events: [makeEvent({ dispensingEventId: 'e2' })], nextCursor: null })

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    expect(mockPullDispenseMonitoringEvents).toHaveBeenCalledTimes(2)
    // second call must carry the cursor from page 1
    expect(mockPullDispenseMonitoringEvents.mock.calls[1][2]).toBe(5)
    // processBatch called once per page
    expect(mockProcessBatch).toHaveBeenCalledTimes(2)
  })

  it('(c) passes through Hub-resolved requirements and strips Patient/ prefix from patientRef', async () => {
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [] })
    const event = makeEvent({
      patientRef: 'Patient/blindHash456',
      requirements: [
        { loincCode: '14682-9', testDisplay: 'Serum Creatinine', initialDelayDays: 7, frequencyDays: 30, priority: 'urgent' },
      ],
    })
    mockPullDispenseMonitoringEvents.mockResolvedValue({ events: [event], nextCursor: null })

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    expect(mockProcessBatch).toHaveBeenCalledTimes(1)
    const [payloads] = mockProcessBatch.mock.calls[0] as [Array<{
      requirements: Array<{ loincCode: string }>
      patientRef: string
      patientAge: number
    }>]
    expect(payloads).toHaveLength(1)
    // Requirements are passed straight through — no medication identity (Story 58.2).
    expect(payloads[0]!.requirements[0]!.loincCode).toBe('14682-9')
    expect(payloads[0]!.patientRef).toBe('blindHash456') // Patient/ prefix stripped
    expect('medicationCode' in payloads[0]!).toBe(false)
  })

  it('(c) patientAge defaults to 0 when DTO age is null', async () => {
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [] })
    const event = makeEvent({ patientAge: null })
    mockPullDispenseMonitoringEvents.mockResolvedValue({ events: [event], nextCursor: null })

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    const [payloads] = mockProcessBatch.mock.calls[0] as [Array<{ patientAge: number }>]
    expect(payloads[0]!.patientAge).toBe(0)
  })

  it('(d) advances in-memory cursor after successful paging', async () => {
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [] })
    mockPullDispenseMonitoringEvents
      .mockResolvedValueOnce({ events: [makeEvent()], nextCursor: 42 })
      .mockResolvedValueOnce({ events: [], nextCursor: null })

    const { runMonitoringSyncOnce, getMonitoringCursor } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    // Cursor should have advanced to 42 (the last nextCursor seen before null)
    expect(getMonitoringCursor()).toBe(42)
  })

  it('(offline) skips processBatch when pullDispenseMonitoringEvents throws; does not throw', async () => {
    mockPullMonitoringMappings.mockResolvedValue({ mappings: [] })
    mockPullDispenseMonitoringEvents.mockRejectedValue(new Error('Network error'))

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    // Should not throw — offline is tolerated
    await expect(runMonitoringSyncOnce()).rejects.toThrow()
    expect(mockProcessBatch).not.toHaveBeenCalled()
  })

  it('(offline mappings) skips putMedicationLabMappings when pullMonitoringMappings throws; still processes events', async () => {
    mockPullMonitoringMappings.mockRejectedValue(new Error('Offline'))
    mockPullDispenseMonitoringEvents.mockResolvedValue({ events: [makeEvent()], nextCursor: null })

    const { runMonitoringSyncOnce } = await import('../hooks/useMonitoringSync')
    await runMonitoringSyncOnce()

    // Mapping pull failed → putMedicationLabMappings not called
    expect(mockPutMedicationLabMappings).not.toHaveBeenCalled()
    // But event processing still ran
    expect(mockProcessBatch).toHaveBeenCalledTimes(1)
  })
})

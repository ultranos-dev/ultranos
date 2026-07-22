import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// sync-pull.ts runs side-effecting imports at module load — stub the ones that
// touch the network/DB. We keep the REAL @ultranos/sync-engine so the HLC
// newer-wins guard in pullPractitionerEncounters is genuinely exercised.
vi.mock('@/lib/hub-url', () => ({
  getHubTrpcUrl: () => 'http://test',
  getHubBaseUrl: () => 'http://test',
}))
vi.mock('@/lib/hlc', () => ({ hlc: { receive: vi.fn(), now: () => ({}) } }))

const auditPhiAccess = vi.fn()
vi.mock('@/lib/audit', () => ({
  auditPhiAccess,
  AuditAction: { READ: 'READ' },
}))

const encountersGet = vi.fn()
const encountersPut = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { encounters: { get: encountersGet, put: encountersPut } },
}))

const listEncountersByPractitionerFromHub = vi.fn()
vi.mock('@/lib/trpc', () => ({ listEncountersByPractitionerFromHub }))

const { pullPractitionerEncounters } = await import('../lib/sync-pull')

const PATIENT_ID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
const OLDER_HLC = '000001700000000:00000:node-1'
const NEWER_HLC = '000001700000100:00000:node-1'

function flatEncounter(hlc: string, id = 'enc-1', status = 'finished') {
  return {
    id,
    subjectId: PATIENT_ID,
    status,
    classCode: 'AMB',
    periodStart: '2026-06-25T10:00:00Z',
    hlcTimestamp: hlc,
    lastUpdated: '2026-06-25T10:00:00Z',
  }
}

/** One page of results. */
function page(encounters: unknown[], nextCursor: string | null = null) {
  return { encounters, nextCursor }
}

const token = () => 'jwt-token'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  encountersGet.mockResolvedValue(undefined)
  encountersPut.mockResolvedValue(undefined)
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
})

describe('pullPractitionerEncounters', () => {
  it('inserts encounters that have no local copy', async () => {
    listEncountersByPractitionerFromHub.mockResolvedValue(page([flatEncounter(OLDER_HLC)]))

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(encountersPut).toHaveBeenCalledTimes(1)
    // Written in nested-FHIR shape so local dashboard queries match.
    const written = encountersPut.mock.calls[0]![0] as Record<string, any>
    expect(written.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(auditPhiAccess).toHaveBeenCalledWith(
      'READ',
      'Encounter',
      'enc-1',
      PATIENT_ID,
      { source: 'sync-pull-practitioner' },
    )
  })

  it('pages through every cursor page until nextCursor is null', async () => {
    listEncountersByPractitionerFromHub
      .mockResolvedValueOnce(page([flatEncounter(OLDER_HLC, 'enc-1')], 'cursor-1'))
      .mockResolvedValueOnce(page([flatEncounter(OLDER_HLC, 'enc-2')], 'cursor-2'))
      .mockResolvedValueOnce(page([flatEncounter(OLDER_HLC, 'enc-3')], null))

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(3)
    expect(listEncountersByPractitionerFromHub).toHaveBeenCalledTimes(3)
    // Cursor advances across pages: undefined → cursor-1 → cursor-2.
    expect(listEncountersByPractitionerFromHub.mock.calls[0]![1]).toBeUndefined()
    expect(listEncountersByPractitionerFromHub.mock.calls[1]![1]).toBe('cursor-1')
    expect(listEncountersByPractitionerFromHub.mock.calls[2]![1]).toBe('cursor-2')
  })

  it('skips a remote encounter that is not newer than the local copy (preserves unsynced edits)', async () => {
    encountersGet.mockResolvedValue({ id: 'enc-1', _ultranos: { hlcTimestamp: NEWER_HLC } })
    listEncountersByPractitionerFromHub.mockResolvedValue(page([flatEncounter(OLDER_HLC)]))

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(0)
    expect(encountersPut).not.toHaveBeenCalled()
  })

  it('applies a remote encounter that is strictly newer than the local copy', async () => {
    encountersGet.mockResolvedValue({ id: 'enc-1', _ultranos: { hlcTimestamp: OLDER_HLC } })
    listEncountersByPractitionerFromHub.mockResolvedValue(page([flatEncounter(NEWER_HLC)]))

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(1)
    expect(encountersPut).toHaveBeenCalledTimes(1)
  })

  it('returns early without fetching when offline', async () => {
    setOnline(false)

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(0)
    expect(listEncountersByPractitionerFromHub).not.toHaveBeenCalled()
  })

  it('stops paging on a fetch error but keeps what was already applied', async () => {
    listEncountersByPractitionerFromHub
      .mockResolvedValueOnce(page([flatEncounter(OLDER_HLC, 'enc-1')], 'cursor-1'))
      .mockRejectedValueOnce(new Error('Hub API error: 500'))

    const result = await pullPractitionerEncounters(token)

    expect(result.changesApplied).toBe(1)
    expect(result.errors).toEqual(['Hub API error: 500'])
    expect(listEncountersByPractitionerFromHub).toHaveBeenCalledTimes(2)
  })
})

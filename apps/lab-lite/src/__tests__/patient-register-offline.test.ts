import { describe, it, expect, vi, beforeEach } from 'vitest'

// Story 60.3, Task 3 — lab-lite offline registration drain + provisional-ref
// reconciliation. Mirrors the specimen-sync test's fully-mocked-db pattern.

const REG_ENTRY = {
  id: 'PatientRegistration-Patient/local-xyz-1',
  resourceType: 'PatientRegistration',
  resourceId: 'Patient/local-xyz',
  status: 'pending',
  payload: { nameLocal: 'Sara', nameGiven: 'Sara', gender: 'female', birthYearOnly: true, birthYear: 1995, consent: { method: 'WRITTEN', language: 'en', version: '1.0' } },
  createdAt: 't', lastAttemptAt: null, retryCount: 0,
}

const update = vi.fn()

// In-memory table doubles keyed for the reconcile sweep.
function makeTable(rows: Record<string, any>, refField: string, keyField: string) {
  return {
    _rows: rows,
    get: async (k: string) => rows[k],
    put: async (r: any) => { rows[r[keyField]] = r },
    delete: async (k: string) => { delete rows[k] },
    where: (field: string) => ({
      equals: (val: string) => ({
        toArray: async () => Object.values(rows).filter((r: any) => {
          if (field.includes('.')) {
            const [a, b] = field.split('.')
            return r?.[a!]?.[b!] === val
          }
          return r?.[field] === val
        }),
      }),
    }),
    __refField: refField,
  }
}

const patients: Record<string, any> = { 'Patient/local-xyz': { id: 'Patient/local-xyz', name: [{ given: ['Sara'] }], _ultranos: { mpiPending: true, isOfflineCreated: true, nameLocal: 'Sara' } } }
const samples: Record<string, any> = { 'sample-1': { id: 'sample-1', subject: { reference: 'Patient/local-xyz' } } }
const orders: Record<string, any> = { 'order-1': { orderId: 'order-1', patientRef: 'Patient/local-xyz' } }
const patientVerifications: Record<string, any> = {}
const verified_patients: Record<string, any> = {}

const fakeQueue = {
  where: () => ({ equals: () => ({ filter: (fn: any) => ({ toArray: async () => [REG_ENTRY].filter(fn) }) }) }),
  update,
}

const tables: Record<string, any> = {
  patients: makeTable(patients, 'id', 'id'),
  samples: makeTable(samples, 'subject.reference', 'id'),
  orders: makeTable(orders, 'patientRef', 'orderId'),
  patientVerifications: makeTable(patientVerifications, 'patientRef', 'id'),
  verified_patients: makeTable(verified_patients, 'patientId', 'patientId'),
}

vi.mock('@/lib/db', () => ({
  getDb: () => ({ syncQueue: fakeQueue, table: (name: string) => tables[name] }),
  putPatient: async (p: any) => { patients[p.id] = p },
  enqueueSyncEvent: vi.fn(),
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub' }))
vi.mock('@/lib/hlc', () => ({ hlcNow: () => 'hlc-1' }))
vi.mock('@ultranos/sync-engine', () => ({
  classifySyncFailure: (raw: string) => (raw?.includes('HTTP 4') ? 'serverRejected' : 'unknown'),
}))

const { drainPatientRegistrationQueue, reconcileProvisionalLabRef, isProvisionalRef } =
  await import('../lib/patient-register-offline')

describe('lab offline patient registration', () => {
  beforeEach(() => { vi.clearAllMocks(); (global as any).fetch = vi.fn() })

  it('recognises a provisional ref', () => {
    expect(isProvisionalRef('Patient/local-abc')).toBe(true)
    expect(isProvisionalRef('Patient/hmac-real')).toBe(false)
  })

  it('drains to lab.registerPatient and reconciles the provisional ref to the Hub blind ref', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { ref: 'Patient/hmac-real-123' } } } }),
    })

    const res = await drainPatientRegistrationQueue(async () => 'tok')

    expect(global.fetch).toHaveBeenCalledWith('http://hub/lab.registerPatient', expect.objectContaining({ method: 'POST' }))
    // Reconciled: provisional patient row re-keyed to the Hub ref, flags cleared.
    expect(patients['Patient/local-xyz']).toBeUndefined()
    expect(patients['Patient/hmac-real-123']).toBeDefined()
    expect(patients['Patient/hmac-real-123']._ultranos.mpiPending).toBeUndefined()
    // Sample + order re-pointed at the Hub ref.
    expect(samples['sample-1'].subject.reference).toBe('Patient/hmac-real-123')
    expect(orders['order-1'].patientRef).toBe('Patient/hmac-real-123')
    // Queue entry marked synced.
    expect(update).toHaveBeenCalledWith(REG_ENTRY.id, { status: 'synced' })
    expect(res).toEqual({ synced: 1, failed: 0 })
  })

  it('reconcileProvisionalLabRef is a no-op when refs are equal', async () => {
    const touched = await reconcileProvisionalLabRef('Patient/same', 'Patient/same')
    expect(touched).toBe(0)
  })
})

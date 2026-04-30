import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'

// Mock the sync-engine crypto module
vi.mock('@ultranos/sync-engine', async () => {
  const actual = await vi.importActual<typeof import('@ultranos/sync-engine')>('@ultranos/sync-engine')
  return {
    ...actual,
    verifySignature: vi.fn(),
  }
})

import { verifySignature } from '@ultranos/sync-engine'
import { verifyPrescriptionQr } from '@/lib/prescription-verify'
import type { SignedPrescriptionBundle } from '@/lib/prescription-types'

const mockVerify = vi.mocked(verifySignature)

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function makeBundle(overrides?: Partial<SignedPrescriptionBundle>): SignedPrescriptionBundle {
  const payload = JSON.stringify([
    {
      id: 'rx-001',
      med: 'AMX500',
      medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7,
      req: 'pract-001',
      pat: 'pat-001',
      at: '2026-04-28T10:00:00Z',
    },
  ])

  return {
    payload,
    sig: uint8ToBase64(new Uint8Array(64).fill(1)),
    pub: uint8ToBase64(new Uint8Array(32).fill(2)),
    issued_at: '2026-04-28T10:00:00Z',
    expiry: '2026-05-28T10:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.practitionerKeys.clear()
})

describe('verifyPrescriptionQr', () => {
  it('returns parse_error for invalid JSON', async () => {
    const result = await verifyPrescriptionQr('not-json')
    expect(result.status).toBe('parse_error')
  })

  it('returns parse_error for incomplete bundle', async () => {
    const result = await verifyPrescriptionQr(JSON.stringify({ payload: 'x' }))
    expect(result.status).toBe('parse_error')
  })

  it('returns expired when prescription is past expiry', async () => {
    const bundle = makeBundle({ expiry: '2020-01-01T00:00:00Z' })
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('expired')
    if (result.status === 'expired') {
      expect(result.expiry).toBe('2020-01-01T00:00:00Z')
    }
  })

  it('returns invalid_signature when verification fails (AC 3: Fraud Warning)', async () => {
    mockVerify.mockResolvedValue(false)
    const bundle = makeBundle()
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('invalid_signature')
  })

  it('returns invalid_signature when crypto throws', async () => {
    mockVerify.mockRejectedValue(new Error('crypto error'))
    const bundle = makeBundle()
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('invalid_signature')
  })

  it('returns unknown_clinician when public key not in local cache', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('unknown_clinician')
  })

  it('returns verified with prescriptions when signature valid and key in cache (AC 2, 5)', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    // Seed local practitioner key cache
    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: '2026-04-01T00:00:00Z',
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.prescriptions).toHaveLength(1)
      expect(result.prescriptions[0]!.medN).toBe('Amoxicillin')
      expect(result.practitionerName).toBe('Dr. Ahmad')
    }
  })

  it('calls verifySignature with correct arguments', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: '2026-04-01T00:00:00Z',
    })

    await verifyPrescriptionQr(JSON.stringify(bundle))

    expect(mockVerify).toHaveBeenCalledWith(
      bundle.payload,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
    )
  })

  it('works entirely offline without Hub connectivity (AC 5)', async () => {
    // No fetch calls should be made during verification
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: '2026-04-01T00:00:00Z',
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

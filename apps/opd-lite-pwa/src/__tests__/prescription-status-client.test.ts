import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkPrescriptionStatus,
  completePrescription,
} from '@/lib/prescription-status-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

function mockTrpcResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ result: { data: { json: data } } }),
  }
}

describe('checkPrescriptionStatus', () => {
  it('calls the correct tRPC endpoint with prescription ID and auth', async () => {
    mockFetch.mockResolvedValue(
      mockTrpcResponse({
        prescriptionId: 'rx-001',
        status: 'AVAILABLE',
        medicationDisplay: 'Amoxicillin 500mg',
        authoredOn: '2026-04-20T10:00:00Z',
        dispensedAt: null,
      }),
    )

    const result = await checkPrescriptionStatus('rx-001', 'token-abc')

    expect(result.status).toBe('AVAILABLE')
    expect(result.prescriptionId).toBe('rx-001')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('medication.getStatus')
    expect(calledUrl).toContain('rx-001')

    const fetchOpts = mockFetch.mock.calls[0]![1] as RequestInit
    expect(fetchOpts.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token-abc',
      }),
    )
  })

  it('returns FULFILLED status correctly', async () => {
    mockFetch.mockResolvedValue(
      mockTrpcResponse({
        prescriptionId: 'rx-002',
        status: 'FULFILLED',
        medicationDisplay: 'Ibuprofen 400mg',
        authoredOn: '2026-04-18T10:00:00Z',
        dispensedAt: '2026-04-19T14:00:00Z',
      }),
    )

    const result = await checkPrescriptionStatus('rx-002', 'token-abc')
    expect(result.status).toBe('FULFILLED')
    expect(result.dispensedAt).toBe('2026-04-19T14:00:00Z')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ error: { message: 'Prescription not found' } }),
    })

    await expect(checkPrescriptionStatus('rx-bad', 'token-abc')).rejects.toThrow(
      'Prescription not found',
    )
  })

  it('throws on network failure (offline)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(checkPrescriptionStatus('rx-001', 'token-abc')).rejects.toThrow(
      'Failed to fetch',
    )
  })
})

describe('completePrescription', () => {
  it('sends POST with auth header', async () => {
    mockFetch.mockResolvedValue(
      mockTrpcResponse({
        success: true,
        prescriptionId: 'rx-001',
        previousStatus: 'AVAILABLE',
        newStatus: 'FULFILLED',
        dispensedAt: '2026-04-29T12:00:00Z',
      }),
    )

    const result = await completePrescription('rx-001', 'token-abc')

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('FULFILLED')

    const fetchOpts = mockFetch.mock.calls[0]![1] as RequestInit
    expect(fetchOpts.method).toBe('POST')
    expect(fetchOpts.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token-abc',
      }),
    )
  })

  it('throws on conflict (already dispensed)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: { message: 'Prescription cannot be fulfilled' },
        }),
    })

    await expect(completePrescription('rx-002', 'token-abc')).rejects.toThrow(
      'Prescription cannot be fulfilled',
    )
  })
})

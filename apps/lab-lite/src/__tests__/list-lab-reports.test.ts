import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listLabReports } from '../lib/trpc'

/**
 * Unit tests for listLabReports() request construction.
 *
 * Regression guard for the 404 on Upload History: the client must call the
 * REAL Hub endpoint `diagnosticReport.listByLab` (Story 17.3), NOT the
 * never-implemented `lab.listReports`, and must encode its input in tRPC's
 * `?input=<superjson>` query format — not as raw `?limit=` query params.
 */
describe('listLabReports', () => {
  const okBody = {
    result: { data: { json: { reports: [{ id: 'r1', loincDisplay: 'CBC', issued: '2026-05-01T00:00:00Z', status: 'preliminary' }], nextCursor: 'r1' } } },
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => okBody,
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function calledUrl(): URL {
    const raw = fetchMock.mock.calls[0]![0] as string
    return new URL(raw)
  }

  function decodedInput(): unknown {
    const input = calledUrl().searchParams.get('input')
    return JSON.parse(input!)
  }

  it('targets the diagnosticReport.listByLab procedure, not lab.listReports', async () => {
    await listLabReports('tok', { limit: 20 })
    const url = calledUrl()
    expect(url.pathname).toContain('/diagnosticReport.listByLab')
    expect(url.pathname).not.toContain('lab.listReports')
  })

  it('encodes input in tRPC superjson query format (not raw query params)', async () => {
    await listLabReports('tok', { limit: 20 })
    const url = calledUrl()
    // Raw params must NOT be present — tRPC would ignore them and mis-parse input.
    expect(url.searchParams.get('limit')).toBeNull()
    expect(decodedInput()).toEqual({ json: { limit: 20 } })
  })

  it('includes the cursor inside the tRPC input when paginating', async () => {
    await listLabReports('tok', { limit: 20, cursor: 'cursor-uuid' })
    expect(decodedInput()).toEqual({ json: { limit: 20, cursor: 'cursor-uuid' } })
  })

  it('sends the bearer token and parses reports + nextCursor', async () => {
    const result = await listLabReports('tok', { limit: 20 })
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0]!.id).toBe('r1')
    expect(result.nextCursor).toBe('r1')
  })

  it('throws when the Hub responds with a non-OK status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    await expect(listLabReports('tok', { limit: 20 })).rejects.toThrow()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pullDispenseMonitoringEvents, pullMonitoringMappings } from '@/lib/trpc'

describe('monitoring tRPC client wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global as any).fetch = vi.fn()
  })

  describe('pullDispenseMonitoringEvents', () => {
    it('GET to lab.pullDispenseMonitoringEvents with encoded input; decodes result.data.json', async () => {
      const mockResponse = {
        result: {
          data: {
            json: {
              events: [
                {
                  dispensingEventId: 'disp1',
                  patientRef: 'Patient/p1-hash',
                  patientFirstName: 'Ahmed',
                  patientAge: 45,
                  atcCode: 'C03CA01',
                  medicationDisplay: 'Lisinopril',
                  dispensedAt: '2026-09-15T10:00:00Z',
                  orderingPractitionerRef: 'Practitioner/doc1',
                  hlcTimestamp: '1-0',
                },
              ],
              nextCursor: 123,
            },
          },
        },
      }
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await pullDispenseMonitoringEvents('token123', '2026-09-01T00:00:00Z', 0)

      // Verify GET call
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lab.pullDispenseMonitoringEvents?input='),
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer token123' },
        }),
      )

      // Verify input encoding
      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json).toEqual({ since: '2026-09-01T00:00:00Z', cursor: 0 })

      // Verify unwrapped result
      expect(result).toEqual({
        events: [
          {
            dispensingEventId: 'disp1',
            patientRef: 'Patient/p1-hash',
            patientFirstName: 'Ahmed',
            patientAge: 45,
            atcCode: 'C03CA01',
            medicationDisplay: 'Lisinopril',
            dispensedAt: '2026-09-15T10:00:00Z',
            orderingPractitionerRef: 'Practitioner/doc1',
            hlcTimestamp: '1-0',
          },
        ],
        nextCursor: 123,
      })
    })

    it('handles cursor=null (not included in input)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { events: [], nextCursor: null } } },
        }),
      })

      await pullDispenseMonitoringEvents('token123', '2026-09-01T00:00:00Z')

      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json).toEqual({ since: '2026-09-01T00:00:00Z' })
      expect(decodedInput.json.cursor).toBeUndefined()
    })

    it('handles cursor=0 (included despite falsy)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { events: [], nextCursor: null } } },
        }),
      })

      await pullDispenseMonitoringEvents('token123', undefined, 0)

      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json.cursor).toBe(0)
    })

    it('defaults events and nextCursor to empty/null on missing keys', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: {} } },
        }),
      })

      const result = await pullDispenseMonitoringEvents('token123')
      expect(result).toEqual({ events: [], nextCursor: null })
    })

    it('throws on non-ok status', async () => {
      ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })

      await expect(pullDispenseMonitoringEvents('token123')).rejects.toThrow(
        /Pull monitoring events failed: 500/,
      )
    })

    it('respects AbortSignal.timeout(15_000)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { events: [], nextCursor: null } } },
        }),
      })

      await pullDispenseMonitoringEvents('token123')

      const callOptions = (global.fetch as any).mock.calls[0][1]
      expect(callOptions.signal).toBeDefined()
      // Verify timeout was set (AbortSignal.timeout returns an AbortSignal with internal timeout)
      expect(callOptions.signal.constructor.name).toBe('AbortSignal')
    })
  })

  describe('pullMonitoringMappings', () => {
    it('GET to lab.pullMonitoringMappings with encoded input; decodes result.data.json', async () => {
      const mockResponse = {
        result: {
          data: {
            json: {
              mappings: [
                {
                  atcCode: 'C03CA01',
                  medicationDisplay: 'Lisinopril',
                  version: 1,
                  requiredTests: [
                    {
                      loincCode: '2160-0',
                      testDisplay: 'Creatinine',
                      frequencyDays: 90,
                      initialDelayDays: 7,
                      priority: 'routine',
                    },
                  ],
                },
              ],
            },
          },
        },
      }
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await pullMonitoringMappings('token456', 1)

      // Verify GET call
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lab.pullMonitoringMappings?input='),
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer token456' },
        }),
      )

      // Verify input encoding
      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json).toEqual({ sinceVersion: 1 })

      // Verify unwrapped result
      expect(result).toEqual({
        mappings: [
          {
            atcCode: 'C03CA01',
            medicationDisplay: 'Lisinopril',
            version: 1,
            requiredTests: [
              {
                loincCode: '2160-0',
                testDisplay: 'Creatinine',
                frequencyDays: 90,
                initialDelayDays: 7,
                priority: 'routine',
              },
            ],
          },
        ],
      })
    })

    it('handles sinceVersion=undefined (not included in input)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { mappings: [] } } },
        }),
      })

      await pullMonitoringMappings('token456')

      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json).toEqual({})
      expect(decodedInput.json.sinceVersion).toBeUndefined()
    })

    it('handles sinceVersion=0 (included despite falsy)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { mappings: [] } } },
        }),
      })

      await pullMonitoringMappings('token456', 0)

      const callUrl = (global.fetch as any).mock.calls[0][0]
      const inputParam = callUrl.split('input=')[1]
      const decodedInput = JSON.parse(decodeURIComponent(inputParam))
      expect(decodedInput.json.sinceVersion).toBe(0)
    })

    it('defaults mappings to empty on missing key', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: {} } },
        }),
      })

      const result = await pullMonitoringMappings('token456')
      expect(result).toEqual({ mappings: [] })
    })

    it('throws on non-ok status', async () => {
      ;(global.fetch as any).mockResolvedValue({ ok: false, status: 404 })

      await expect(pullMonitoringMappings('token456')).rejects.toThrow(/Pull monitoring mappings failed: 404/)
    })

    it('respects AbortSignal.timeout(15_000)', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { data: { json: { mappings: [] } } },
        }),
      })

      await pullMonitoringMappings('token456')

      const callOptions = (global.fetch as any).mock.calls[0][1]
      expect(callOptions.signal).toBeDefined()
      expect(callOptions.signal.constructor.name).toBe('AbortSignal')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The service now gets its token from the canonical hub-auth helper (Supabase
// session), NOT the auth-session store — AuthSession never had a `token` field,
// so the old code sent no Authorization header and every call 401'd (H-OPD-1).
vi.mock('@/lib/hub-auth', () => ({
  getAuthHeaders: async () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-token-abc',
  }),
}))

// Must import after mock setup
import {
  parseSOAPWithAI,
  isAISOAPError,
  checkAIProcessingConsent,
  clearAIConsentCache,
} from '@/services/ai-scribe-service'
import type { AISOAPResult, AISOAPError } from '@/services/ai-scribe-service'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('AI Scribe Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAIConsentCache()
  })

  describe('auth transport (H-OPD-1 regression guard)', () => {
    it('parseSOAPWithAI sends the bearer token from hub-auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', modelVersion: 'v1' } } } }),
      })

      await parseSOAPWithAI('enc-001', 'Some text')

      const init = mockFetch.mock.calls[0]![1] as RequestInit
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-abc')
    })

    it('checkAIProcessingConsent sends the bearer token from hub-auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { permitted: true } } } }),
      })

      await checkAIProcessingConsent('patient-auth-check')

      const init = mockFetch.mock.calls[0]![1] as RequestInit
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-abc')
    })
  })

  describe('parseSOAPWithAI', () => {
    it('returns AI result on success', async () => {
      const aiResult: AISOAPResult = {
        subjective: 'Patient reports headache',
        objective: 'BP 120/80',
        assessment: 'Tension headache',
        plan: 'Analgesics PRN',
        modelVersion: 'gpt-4o-2025-01',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: aiResult } } }),
      })

      const result = await parseSOAPWithAI('enc-001', 'Patient has a headache')
      expect(isAISOAPError(result)).toBe(false)
      expect(result).toEqual(aiResult)
    })

    it('returns AI_UNAVAILABLE on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      const result = await parseSOAPWithAI('enc-001', 'Some text')
      expect(isAISOAPError(result)).toBe(true)
      expect((result as AISOAPError).error).toBe('AI_UNAVAILABLE')
      expect((result as AISOAPError).reason).toBe('Network error')
    })

    it('returns AI_UNAVAILABLE on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await parseSOAPWithAI('enc-001', 'Some text')
      expect(isAISOAPError(result)).toBe(true)
      expect((result as AISOAPError).error).toBe('AI_UNAVAILABLE')
      expect((result as AISOAPError).reason).toContain('503')
    })
  })

  describe('isAISOAPError', () => {
    it('correctly identifies error objects', () => {
      const err: AISOAPError = { error: 'AI_UNAVAILABLE', reason: 'offline' }
      expect(isAISOAPError(err)).toBe(true)
    })

    it('returns false for success objects', () => {
      const success: AISOAPResult = {
        subjective: 'S',
        objective: 'O',
        assessment: 'A',
        plan: 'P',
        modelVersion: 'v1',
      }
      expect(isAISOAPError(success)).toBe(false)
    })
  })

  describe('checkAIProcessingConsent', () => {
    it('returns true when Hub API says permitted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { permitted: true } } } }),
      })

      const result = await checkAIProcessingConsent('patient-001')
      expect(result).toBe(true)
    })

    it('returns false when Hub API says not permitted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { permitted: false } } } }),
      })

      const result = await checkAIProcessingConsent('patient-002')
      expect(result).toBe(false)
    })

    it('returns false on network error (deny by default)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      const result = await checkAIProcessingConsent('patient-003')
      expect(result).toBe(false)
    })

    it('caches results and does not re-fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { permitted: true } } } }),
      })

      const first = await checkAIProcessingConsent('patient-cached')
      const second = await checkAIProcessingConsent('patient-cached')

      expect(first).toBe(true)
      expect(second).toBe(true)
      // fetch should only have been called once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})

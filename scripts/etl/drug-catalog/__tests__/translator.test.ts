import { describe, it, expect, vi } from 'vitest'
import { translate } from '../sources/translator.js'

function geminiResponse(obj: unknown) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) } as Response
}

describe('translate', () => {
  it('returns ar/prs/ps from the Gemini JSON response', async () => {
    const f = vi.fn().mockResolvedValue(geminiResponse({ ar: 'أسبرين', prs: 'اسپرین', ps: 'اسپرين' }))
    const r = await translate('Aspirin reduces fever.', f as unknown as typeof fetch, 'KEY')
    expect(r).toEqual({ ar: 'أسبرين', prs: 'اسپرین', ps: 'اسپرين' })
    const calledUrl = (f.mock.calls[0][0] as string)
    expect(calledUrl).toContain('gemini-2.5-flash:generateContent')
    expect(calledUrl).toContain('key=KEY')
  })
  it('returns null on HTTP error, throw, or unparseable body', async () => {
    const noRetry = { maxRetries: 0 }
    expect(await translate('x', vi.fn().mockResolvedValue({ ok: false, status: 400 } as Response) as unknown as typeof fetch, 'K', noRetry)).toBeNull()
    expect(await translate('x', vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch, 'K', noRetry)).toBeNull()
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) } as Response)
    expect(await translate('x', bad as unknown as typeof fetch, 'K', noRetry)).toBeNull()
  })
  it('returns null for empty input', async () => {
    expect(await translate('   ', vi.fn() as unknown as typeof fetch, 'K')).toBeNull()
  })
  it('retries a transient 429 (honoring retryDelay) then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '{"error":{"details":[{"retryDelay":"3s"}]}}' } as Response)
      .mockResolvedValueOnce(geminiResponse({ ar: 'أ', prs: 'پ', ps: 'پ' }))
    const slept: number[] = []
    const r = await translate('Aspirin.', f as unknown as typeof fetch, 'K', { sleep: async (ms) => { slept.push(ms) } })
    expect(r).toEqual({ ar: 'أ', prs: 'پ', ps: 'پ' })
    expect(f).toHaveBeenCalledTimes(2)
    expect(slept).toEqual([3000]) // used Gemini's RetryInfo hint, not the exponential default
  })
  it('gives up immediately on a per-day quota 429 (no retry, no wait)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '{"error":{"message":"Quota exceeded","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}' } as Response)
    const sleep = vi.fn(async () => {})
    expect(await translate('Aspirin.', f as unknown as typeof fetch, 'K', { sleep })).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})

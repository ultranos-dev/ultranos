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
    expect(await translate('x', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch, 'K')).toBeNull()
    expect(await translate('x', vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch, 'K')).toBeNull()
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) } as Response)
    expect(await translate('x', bad as unknown as typeof fetch, 'K')).toBeNull()
  })
  it('returns null for empty input', async () => {
    expect(await translate('   ', vi.fn() as unknown as typeof fetch, 'K')).toBeNull()
  })
})

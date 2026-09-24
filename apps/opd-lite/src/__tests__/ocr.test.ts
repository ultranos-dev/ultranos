import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractKycFields } from '../lib/ocr'

// ============================================================
// OCR Unit Tests — Story 22.5, Task 3; updated for Story 62.2 (M-OPD-3)
// The browser no longer calls Google Vision directly — it proxies to the Hub
// (POST /api/ocr/kyc), which returns fullText + REAL word-level confidence.
// These tests exercise the proxy contract, field extraction, confidence
// mapping, and graceful failure handling.
// ============================================================

// Mock the hub URL + supabase session so extractKycFields can build the request.
vi.mock('@/lib/hub-url', () => ({
  getHubBaseUrl: () => 'http://hub.test',
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

/** Build a Vision-proxy word list from a whitespace-separated string. */
function wordsFrom(text: string, confidence: number) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ text: w, confidence }))
}

describe('extractKycFields (Hub OCR proxy)', () => {
  it('POSTs to the hub OCR endpoint with a bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, fullText: 'Name: Dr. Ahmed Hassan', words: wordsFrom('Name Dr Ahmed Hassan', 0.95) }),
    })

    await extractKycFields('base64data')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toBe('http://hub.test/api/ocr/kyc')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer test-token')
    expect(JSON.parse(init.body).imageBase64).toBe('base64data')
  })

  it('extracts fields with REAL word-level confidence from the proxy', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          fullText:
            'Name: Dr. Ahmed Hassan\nLicense No: HAAD-12345\nIssued by: HAAD\nExpiry: 2027-12-31',
          words: [
            ...wordsFrom('Name Dr Ahmed Hassan', 0.97),
            ...wordsFrom('License No HAAD-12345', 0.88),
            ...wordsFrom('Issued by HAAD', 0.9),
            ...wordsFrom('Expiry 2027-12-31', 0.72),
          ],
        }),
    })

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(true)
    expect(result.fields.length).toBeGreaterThanOrEqual(3)

    const nameField = result.fields.find((f) => f.name === 'full_name')
    expect(nameField!.value).toContain('Ahmed Hassan')
    // Confidence is derived from the matched Vision words (≈0.97), NOT a synthetic constant.
    expect(nameField!.confidence).toBeGreaterThan(0.9)

    const expiryField = result.fields.find((f) => f.name === 'expiry_date')
    expect(expiryField!.value).toContain('2027-12-31')
    // The low-confidence expiry words (0.72) surface as a genuinely lower score.
    expect(expiryField!.confidence).toBeLessThan(0.85)
  })

  it('returns graceful error when the proxy call fails (non-OK)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 })
    const result = await extractKycFields('base64data')
    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
    expect(result.fields).toHaveLength(0)
  })

  it('returns graceful error when the proxy reports unavailable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'OCR unavailable', fullText: '', words: [] }),
    })
    const result = await extractKycFields('base64data')
    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
  })

  it('returns graceful error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await extractKycFields('base64data')
    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
    expect(result.fields).toHaveLength(0)
  })

  it('never logs document content or extracted PHI', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          fullText: 'Name: Dr. Secret Person\nLicense No: SEC-99999',
          words: [...wordsFrom('Name Dr Secret Person', 0.9), ...wordsFrom('License No SEC-99999', 0.9)],
        }),
    })

    await extractKycFields('base64data')

    for (const call of consoleSpy.mock.calls) {
      const logStr = JSON.stringify(call)
      expect(logStr).not.toContain('Secret Person')
      expect(logStr).not.toContain('SEC-99999')
    }
    consoleSpy.mockRestore()
  })
})

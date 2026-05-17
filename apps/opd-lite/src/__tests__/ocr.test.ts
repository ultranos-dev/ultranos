import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractKycFields } from '../lib/ocr'

// ============================================================
// OCR Unit Tests — Story 22.5, Task 3
// Tests Cloud Vision OCR field extraction, confidence scoring,
// and graceful failure handling.
// ============================================================

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('extractKycFields', () => {
  it('returns error when API key is not configured', async () => {
    // Ensure env var is not set
    const original = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY
    delete process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
    expect(result.fields).toHaveLength(0)

    // Restore
    if (original) process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = original
  })

  it('extracts fields from OCR text with confidence scores', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          responses: [
            {
              textAnnotations: [
                {
                  description:
                    'Name: Dr. Ahmed Hassan\nLicense No: HAAD-12345\nIssued by: HAAD\nExpiry: 2027-12-31',
                },
              ],
            },
          ],
        }),
    })

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(true)
    expect(result.fields.length).toBeGreaterThanOrEqual(3)

    const nameField = result.fields.find((f) => f.name === 'full_name')
    expect(nameField).toBeTruthy()
    expect(nameField!.value).toContain('Ahmed Hassan')
    expect(nameField!.confidence).toBeGreaterThan(0)

    const licenseField = result.fields.find((f) => f.name === 'license_number')
    expect(licenseField).toBeTruthy()
    expect(licenseField!.value).toContain('HAAD-12345')

    const expiryField = result.fields.find((f) => f.name === 'expiry_date')
    expect(expiryField).toBeTruthy()
    expect(expiryField!.value).toContain('2027-12-31')
  })

  it('returns graceful error when API call fails', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
    expect(result.fields).toHaveLength(0)
  })

  it('returns graceful error when no text annotations found', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          responses: [{ textAnnotations: [] }],
        }),
    })

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
  })

  it('returns graceful error on network failure', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await extractKycFields('base64data')

    expect(result.success).toBe(false)
    expect(result.error).toContain('manually')
    expect(result.fields).toHaveLength(0)
  })

  it('never logs document content or extracted PHI', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          responses: [
            {
              textAnnotations: [
                { description: 'Name: Dr. Secret Person\nLicense No: SEC-99999' },
              ],
            },
          ],
        }),
    })

    await extractKycFields('base64data')

    // Verify no PHI was logged
    for (const call of consoleSpy.mock.calls) {
      const logStr = JSON.stringify(call)
      expect(logStr).not.toContain('Secret Person')
      expect(logStr).not.toContain('SEC-99999')
    }

    consoleSpy.mockRestore()
  })
})

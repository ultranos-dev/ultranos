import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock process.env
const originalEnv = process.env

describe('OCR client (Story 24.3)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('extractPrescriptionFields', () => {
    it('returns fields with confidence scores on successful OCR', async () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

      const mockResponse = {
        responses: [
          {
            textAnnotations: [
              {
                description:
                  'Rx: Amoxicillin 500mg\nDose: 500mg\nFrequency: twice daily\nDr. Smith\nDate: 12/05/2026',
              },
            ],
          },
        ],
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(true)
      expect(result.fields.length).toBeGreaterThan(0)

      // Check medication name extracted
      const medField = result.fields.find((f) => f.name === 'medicationName')
      expect(medField).toBeDefined()
      expect(medField!.confidence).toBeGreaterThan(0)
      expect(medField!.confidence).toBeLessThanOrEqual(1)

      // Check dosage extracted
      const doseField = result.fields.find((f) => f.name === 'dosage')
      expect(doseField).toBeDefined()
      expect(doseField!.value).toContain('500mg')
    })

    it('returns OCR_UNAVAILABLE when API key is missing', async () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(false)
      expect(result.error).toBe('OCR_UNAVAILABLE')
      expect(result.fields).toEqual([])
    })

    it('returns OCR_UNAVAILABLE on API error (non-200 response)', async () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(false)
      expect(result.error).toBe('OCR_UNAVAILABLE')
    })

    it('returns OCR_UNAVAILABLE on network error', async () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(false)
      expect(result.error).toBe('OCR_UNAVAILABLE')
    })

    it('returns OCR_UNAVAILABLE on timeout (AbortError)', async () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

      global.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(false)
      expect(result.error).toBe('OCR_UNAVAILABLE')
    })

    it('returns empty fields when OCR returns no text annotations', async () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY = 'test-key'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ responses: [{ textAnnotations: [] }] }),
      })

      const { extractPrescriptionFields } = await import('@/lib/ocr')
      const result = await extractPrescriptionFields('base64imagedata')

      expect(result.success).toBe(false)
      expect(result.error).toBe('OCR_UNAVAILABLE')
    })
  })

  describe('extractFieldsFromText', () => {
    it('extracts medication name from labeled patterns', async () => {
      const { extractFieldsFromText } = await import('@/lib/ocr')
      const fields = extractFieldsFromText('Rx: Amoxicillin 500mg')
      const med = fields.find((f) => f.name === 'medicationName')
      expect(med).toBeDefined()
      expect(med!.value).toContain('Amoxicillin')
      expect(med!.confidence).toBe(0.92) // First pattern match = high confidence
    })

    it('extracts frequency patterns (BID, TID, etc.)', async () => {
      const { extractFieldsFromText } = await import('@/lib/ocr')
      const fields = extractFieldsFromText('b.i.d.')
      const freq = fields.find((f) => f.name === 'frequency')
      expect(freq).toBeDefined()
      expect(freq!.value).toMatch(/b\.?i\.?d/i)
    })

    it('extracts prescriber name from "Dr." prefix', async () => {
      const { extractFieldsFromText } = await import('@/lib/ocr')
      const fields = extractFieldsFromText('Dr. Ahmed Khan')
      const prescriber = fields.find((f) => f.name === 'prescriberName')
      expect(prescriber).toBeDefined()
      expect(prescriber!.value).toContain('Ahmed Khan')
    })

    it('extracts date in various formats', async () => {
      const { extractFieldsFromText } = await import('@/lib/ocr')
      const fields = extractFieldsFromText('Date: 15/05/2026')
      const date = fields.find((f) => f.name === 'prescriptionDate')
      expect(date).toBeDefined()
      expect(date!.value).toBe('15/05/2026')
    })

    it('assigns lower confidence to secondary pattern matches', async () => {
      const { extractFieldsFromText } = await import('@/lib/ocr')
      // This matches the second dosage pattern (no label), gets 0.78
      const fields = extractFieldsFromText('250mg')
      const dose = fields.find((f) => f.name === 'dosage')
      expect(dose).toBeDefined()
      expect(dose!.confidence).toBe(0.78)
    })
  })

  describe('fileToBase64', () => {
    it('converts a File to base64 string without data URL prefix', async () => {
      const { fileToBase64 } = await import('@/lib/ocr')
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
      const result = await fileToBase64(file)
      // Base64 of "hello" is "aGVsbG8="
      expect(result).toBe('aGVsbG8=')
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractMetadataFromText,
  analyzeFile,
  GoogleVisionProvider,
  type OcrSuggestion,
} from '../services/ocr'

describe('extractMetadataFromText', () => {
  it('extracts LOINC code from CBC keyword match', () => {
    const result = extractMetadataFromText('Complete Blood Count Report')
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    expect(loinc!.value).toBe('58410-2')
    expect(loinc!.confidence).toBeGreaterThanOrEqual(70)
  })

  it('extracts LOINC code from lipid panel keyword', () => {
    const result = extractMetadataFromText('Lipid Panel Results')
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    expect(loinc!.value).toBe('57698-3')
  })

  it('extracts LOINC code from HbA1c keyword', () => {
    const result = extractMetadataFromText('HbA1c test value: 5.7%')
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    expect(loinc!.value).toBe('4548-4')
  })

  it('extracts LOINC code from thyroid/TSH keyword', () => {
    const result = extractMetadataFromText('TSH Level: 2.5 mIU/L')
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    expect(loinc!.value).toBe('3016-3')
  })

  it('extracts ISO date (YYYY-MM-DD)', () => {
    const result = extractMetadataFromText('Sample collected: 2026-04-15')
    const date = result.find((s) => s.field === 'collectionDate')
    expect(date).toBeDefined()
    expect(date!.value).toBe('2026-04-15')
    expect(date!.confidence).toBe(90)
  })

  it('extracts DD/MM/YYYY date (MENA format, unambiguous day > 12)', () => {
    const result = extractMetadataFromText('Date: 15/04/2026')
    const date = result.find((s) => s.field === 'collectionDate')
    expect(date).toBeDefined()
    expect(date!.value).toBe('2026-04-15')
    expect(date!.confidence).toBe(80) // day > 12 → unambiguous
  })

  it('lowers confidence for ambiguous DD/MM/YYYY dates (both parts <= 12)', () => {
    const result = extractMetadataFromText('Date: 03/04/2026')
    const date = result.find((s) => s.field === 'collectionDate')
    expect(date).toBeDefined()
    expect(date!.value).toBe('2026-04-03')
    expect(date!.confidence).toBe(70) // ambiguous → below 85% threshold
  })

  it('rejects future dates', () => {
    const futureDate = '2099-12-31'
    const result = extractMetadataFromText(`Date: ${futureDate}`)
    const date = result.find((s) => s.field === 'collectionDate')
    expect(date).toBeUndefined()
  })

  it('returns empty suggestions for unrecognizable text', () => {
    const result = extractMetadataFromText('Random gibberish with no medical terms')
    expect(result).toHaveLength(0)
  })

  it('prefers longer keyword matches for higher confidence', () => {
    const result = extractMetadataFromText('Complete Blood Count test results for patient')
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    // "complete blood count" is longer than "cbc", so confidence should be higher
    expect(loinc!.confidence).toBeGreaterThan(80)
  })

  it('extracts both LOINC code and date from combined text', () => {
    const result = extractMetadataFromText(
      'Lipid Panel\nSample Collection Date: 2026-03-20\nCholesterol: 180 mg/dL',
    )
    expect(result.find((s) => s.field === 'loincCode')).toBeDefined()
    expect(result.find((s) => s.field === 'collectionDate')).toBeDefined()
  })
})

describe('GoogleVisionProvider', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.OCR_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('throws when endpoint is not configured', async () => {
    const provider = new GoogleVisionProvider('')
    await expect(provider.analyze('base64data', 'image/jpeg')).rejects.toThrow(
      'OCR_API_ENDPOINT not configured',
    )
  })

  it('throws when API key is not configured', async () => {
    delete process.env.OCR_API_KEY
    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    await expect(provider.analyze('base64data', 'image/jpeg')).rejects.toThrow(
      'OCR_API_KEY not configured',
    )
  })

  it('returns structured suggestions from Cloud Vision response', async () => {
    const mockResponse = {
      responses: [
        {
          fullTextAnnotation: {
            text: 'Complete Blood Count\nDate: 2026-04-10\nWBC: 7.5',
          },
        },
      ],
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    const result = await provider.analyze('base64data', 'image/jpeg')

    expect(result.length).toBeGreaterThan(0)
    const loinc = result.find((s) => s.field === 'loincCode')
    expect(loinc).toBeDefined()
    expect(loinc!.value).toBe('58410-2')
  })

  it('throws on non-OK HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    )

    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    await expect(provider.analyze('base64data', 'image/jpeg')).rejects.toThrow(
      'OCR API returned status 403',
    )
  })

  it('handles empty OCR response gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ responses: [{}] }),
      }),
    )

    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    const result = await provider.analyze('base64data', 'image/jpeg')
    expect(result).toHaveLength(0)
  })

  it('sends correct request body for PDF files', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ responses: [{}] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    await provider.analyze('base64data', 'application/pdf')

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.requests[0].inputConfig).toBeDefined()
    expect(callBody.requests[0].inputConfig.mimeType).toBe('application/pdf')
  })

  it('appends API key to endpoint URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ responses: [{}] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new GoogleVisionProvider('https://vision.googleapis.com/v1/images:annotate')
    await provider.analyze('base64data', 'image/jpeg')

    const calledUrl = mockFetch.mock.calls[0][0]
    expect(calledUrl).toContain('?key=test-api-key')
  })
})

describe('Privacy Guard (Story 12.6 AC 9)', () => {
  it('extractMetadataFromText never returns raw text content', () => {
    const sensitiveText =
      'Patient: Ahmad Al-Rashid, DOB: 1985-03-15\n' +
      'Diagnosis: Type 2 Diabetes Mellitus\n' +
      'HbA1c Result: 7.2%\n' +
      'Date collected: 2026-04-10'

    const result = extractMetadataFromText(sensitiveText)

    // Should only return structured metadata (field, value, confidence)
    for (const suggestion of result) {
      expect(['loincCode', 'collectionDate']).toContain(suggestion.field)
      // Values should be LOINC codes or dates — never patient names or diagnoses
      expect(suggestion.value).not.toContain('Ahmad')
      expect(suggestion.value).not.toContain('Al-Rashid')
      expect(suggestion.value).not.toContain('Diabetes')
    }
  })

  it('only extracts LOINC codes and dates — no free text fields', () => {
    const result = extractMetadataFromText(
      'CBC Report\nPatient ID: 12345\nPhysician: Dr. Smith\nDate: 2026-04-01',
    )

    const fields = result.map((s) => s.field)
    for (const field of fields) {
      expect(['loincCode', 'collectionDate']).toContain(field)
    }
    // Should NOT have extracted patient ID or physician name
    expect(fields).not.toContain('patientId')
    expect(fields).not.toContain('physician')
  })
})

describe('analyzeFile', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('returns available: false when provider is "none"', async () => {
    process.env.OCR_PROVIDER = 'none'
    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(result.available).toBe(false)
    expect(result.suggestions).toHaveLength(0)
    expect(result.provider).toBe('none')
  })

  it('returns available: false when provider is "disabled"', async () => {
    process.env.OCR_PROVIDER = 'disabled'
    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(result.available).toBe(false)
  })

  it('returns available: false on provider error (graceful fallback)', async () => {
    process.env.OCR_PROVIDER = 'google'
    process.env.OCR_API_ENDPOINT = 'https://example.com/ocr'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    )

    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(result.available).toBe(false)
    expect(result.suggestions).toHaveLength(0)
    expect(result.provider).toBe('google')
  })

  it('includes processingTimeMs in result', async () => {
    process.env.OCR_PROVIDER = 'none'
    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(typeof result.processingTimeMs).toBe('number')
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns suggestions on successful OCR', async () => {
    process.env.OCR_PROVIDER = 'google'
    process.env.OCR_API_ENDPOINT = 'https://example.com/ocr'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            responses: [
              {
                fullTextAnnotation: {
                  text: 'Urinalysis Report\nCollection: 2026-04-20',
                },
              },
            ],
          }),
      }),
    )

    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(result.available).toBe(true)
    expect(result.provider).toBe('google')
    expect(result.suggestions.length).toBeGreaterThan(0)

    const loinc = result.suggestions.find((s) => s.field === 'loincCode')
    expect(loinc!.value).toBe('24356-8')
  })

  it('returns available: false for unknown provider', async () => {
    process.env.OCR_PROVIDER = 'unknown-provider'
    const result = await analyzeFile('base64data', 'image/jpeg')
    expect(result.available).toBe(false)
  })
})

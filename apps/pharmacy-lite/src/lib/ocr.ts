/**
 * Cloud Vision OCR integration for paper prescription field extraction.
 * Story 24.3 AC #3, #4, #5, #7: Extract prescription fields with per-field confidence.
 *
 * Client-side module: sends image to our API route (server holds the API key).
 * SECURITY: Never log image content or extracted field values (PHI).
 */

export interface PrescriptionOcrField {
  name: string
  value: string
  confidence: number
}

export interface PrescriptionOcrResult {
  fields: PrescriptionOcrField[]
  success: boolean
  error?: 'OCR_UNAVAILABLE'
}

/** Known prescription field patterns for extraction from handwritten Rx */
const FIELD_PATTERNS: Record<string, RegExp[]> = {
  medicationName: [
    /(?:rx|medication|drug|med|\u062f\u0648\u0627\u0621)\s*[:-]?\s*(.+)/i,
    /(?:tab(?:let)?s?|cap(?:sule)?s?|inj(?:ection)?|syrup)\s+(.+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\d+\s*(?:mg|ml|mcg|g|iu)/im,
  ],
  dosage: [
    /(?:dose|dosage|\u062c\u0631\u0639\u0629)\s*[:-]?\s*(.+)/i,
    /(\d+\s*(?:mg|ml|mcg|g|iu)(?:\s*\/\s*\d+\s*(?:mg|ml|mcg|g|iu))?)/i,
  ],
  frequency: [
    /(?:freq(?:uency)?|sig|directions?|\u062a\u0639\u0644\u064a\u0645\u0627\u062a)\s*[:-]?\s*(.+)/i,
    /((?:once|twice|thrice|\d+\s*(?:times?|x))\s*(?:daily|a\s*day|per\s*day|weekly))/i,
    /((?:b\.?i\.?d|t\.?i\.?d|q\.?i\.?d|o\.?d|q\.?d|prn|stat|h\.?s|a\.?c|p\.?c)\.?)/i,
  ],
  prescriberName: [
    /(?:dr\.?|doctor|prescriber|physician|\u0627\u0644\u0637\u0628\u064a\u0628)\s*[:-]?\s*(.+)/i,
    /(?:signed?\s*(?:by)?|\u0627\u0644\u0645\u064f\u0648\u0642\u0651\u0639)\s*[:-]?\s*(.+)/i,
  ],
  prescriptionDate: [
    /(?:date|\u062a\u0627\u0631\u064a\u062e)\s*[:-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(\d{4}[-/]\d{2}[-/]\d{2})/,
    /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
  ],
}

const OCR_TIMEOUT_MS = 15_000
const MAX_IMAGE_SIZE_BYTES = 7 * 1024 * 1024 // 7 MB — Cloud Vision limit is ~10 MB base64

/**
 * Extract prescription fields from an image using Google Cloud Vision OCR.
 * Falls back gracefully if OCR is unavailable (AC #7).
 *
 * Calls our server-side API route to keep the Cloud Vision API key off the client.
 */
export async function extractPrescriptionFields(
  imageBase64: string,
  options?: { signal?: AbortSignal },
): Promise<PrescriptionOcrResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)

  // Chain external abort signal if provided (e.g., component unmount)
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId)
      return { fields: [], success: false, error: 'OCR_UNAVAILABLE' }
    }
    options.signal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { fields: [], success: false, error: 'OCR_UNAVAILABLE' }
    }

    const data = await response.json()
    const annotations = data.responses?.[0]?.textAnnotations
    const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation

    if (!annotations || annotations.length === 0) {
      return { fields: [], success: false, error: 'OCR_UNAVAILABLE' }
    }

    // Full text is the first annotation
    const fullText: string = annotations[0].description ?? ''

    // Extract per-word confidence from fullTextAnnotation blocks
    const wordConfidences = extractWordConfidences(fullTextAnnotation)

    const fields = extractFieldsFromText(fullText, wordConfidences)

    return { fields, success: true }
  } catch {
    return { fields: [], success: false, error: 'OCR_UNAVAILABLE' }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Extract per-word confidence map from Cloud Vision fullTextAnnotation.
 * Returns a map of lowercase word -> confidence (0-1).
 */
function extractWordConfidences(
  fullTextAnnotation: { pages?: Array<{ blocks?: Array<{ paragraphs?: Array<{ words?: Array<{ symbols?: Array<{ text?: string; confidence?: number }>; confidence?: number }> }> }> }> } | undefined,
): Map<string, number> {
  const confidences = new Map<string, number>()
  if (!fullTextAnnotation?.pages) return confidences

  for (const page of fullTextAnnotation.pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((s) => s.text ?? '').join('')
          if (text && word.confidence !== undefined) {
            confidences.set(text.toLowerCase(), word.confidence)
          }
        }
      }
    }
  }
  return confidences
}

/**
 * Parse OCR text to extract prescription fields with confidence from Cloud Vision.
 * Confidence is derived from per-word OCR confidence when available,
 * falling back to synthetic pattern-match-based confidence.
 */
export function extractFieldsFromText(
  text: string,
  wordConfidences?: Map<string, number>,
): PrescriptionOcrField[] {
  const fields: PrescriptionOcrField[] = []
  // Cap input length to prevent regex performance issues on large OCR output
  const cappedText = text.length > 5000 ? text.slice(0, 5000) : text
  const lines = cappedText.split('\n')

  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    let bestMatch: { value: string; confidence: number } | null = null

    for (const line of lines) {
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i]
        if (!pattern) continue
        const match = line.match(pattern)
        if (match) {
          const value = (match[1] ?? match[0]).trim()

          // Derive confidence from Cloud Vision word-level data when available
          let confidence: number
          if (wordConfidences && wordConfidences.size > 0) {
            const words = value.toLowerCase().split(/\s+/)
            const wordScores = words
              .map((w) => wordConfidences.get(w))
              .filter((c): c is number => c !== undefined)
            confidence =
              wordScores.length > 0
                ? wordScores.reduce((a, b) => a + b, 0) / wordScores.length
                : i === 0 ? 0.92 : i === 1 ? 0.78 : 0.65
          } else {
            // Fallback: synthetic confidence based on regex specificity
            confidence = i === 0 ? 0.92 : i === 1 ? 0.78 : 0.65
          }

          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { value, confidence }
          }
        }
      }
    }

    if (bestMatch) {
      fields.push({
        name: fieldName,
        value: bestMatch.value,
        confidence: bestMatch.confidence,
      })
    }
  }

  return fields
}

/**
 * Convert a File to base64 string for Cloud Vision API.
 * Validates file size before reading.
 */
export function fileToBase64(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return Promise.reject(
      new Error(`Image too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 7MB.`),
    )
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Failed to read image as base64'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

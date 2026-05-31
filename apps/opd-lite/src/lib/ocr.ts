/**
 * Cloud Vision OCR integration for KYC document field extraction.
 * Story 22.5 AC #3, #5: Auto-extract fields with per-field confidence indicators.
 *
 * Uses Google Cloud Vision API via REST — no SDK dependency.
 * SECURITY: Never log document content or extracted PHI.
 */

export interface OcrField {
  name: string
  value: string
  confidence: number
}

export interface OcrResult {
  fields: OcrField[]
  success: boolean
  error?: string
}

/** Known KYC field patterns for extraction from license/ID documents */
const FIELD_PATTERNS: Record<string, RegExp[]> = {
  full_name: [
    /(?:name|الاسم)\s*[:-]?\s*(.+)/i,
    /(?:dr\.?\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
  ],
  license_number: [
    /(?:license|lic|رخصة)\s*(?:no|number|#|رقم)?\s*[:-]?\s*([A-Z0-9-]+)/i,
    /([A-Z]{2,6}[-/]?\d{3,10})/,
  ],
  issuing_body: [
    /(?:issued?\s*by|authority|الجهة)\s*[:-]?\s*(.+)/i,
    /(HAAD|DHA|MOH|JMC|SCFHS|NHRA)/i,
  ],
  expiry_date: [
    /(?:expir|valid\s*until|تاريخ الانتهاء)\s*[:-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(\d{4}[-/]\d{2}[-/]\d{2})/,
  ],
}

/**
 * Extract KYC fields from a document image using Google Cloud Vision OCR.
 * Falls back gracefully if OCR is unavailable.
 */
export async function extractKycFields(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY

  if (!apiKey) {
    return {
      fields: [],
      success: false,
      error: 'Auto-extraction unavailable — please enter fields manually',
    }
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      },
    )

    if (!response.ok) {
      return {
        fields: [],
        success: false,
        error: 'Auto-extraction unavailable — please enter fields manually',
      }
    }

    const data = await response.json()
    const annotations = data.responses?.[0]?.textAnnotations

    if (!annotations || annotations.length === 0) {
      return {
        fields: [],
        success: false,
        error: 'Auto-extraction unavailable — please enter fields manually',
      }
    }

    // Full text is always the first annotation
    const fullText: string = annotations[0].description ?? ''
    const fields = extractFieldsFromText(fullText)

    return { fields, success: true }
  } catch {
    return {
      fields: [],
      success: false,
      error: 'Auto-extraction unavailable — please enter fields manually',
    }
  }
}

/**
 * Parse OCR text to extract known KYC fields with confidence estimates.
 * Confidence is based on pattern match quality (regex specificity).
 */
function extractFieldsFromText(text: string): OcrField[] {
  const fields: OcrField[] = []
  const lines = text.split('\n')

  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    let bestMatch: { value: string; confidence: number } | null = null

    for (const line of lines) {
      for (let i = 0; i < patterns.length; i++) {
        const match = line.match(patterns[i]!)
        if (match) {
          const value = (match[1] ?? match[0]!).trim()
          // TODO: v1 limitation — confidence is synthetic (based on regex specificity).
          // Real fix: use DOCUMENT_TEXT_DETECTION and word-level confidence from Cloud Vision API.
          const confidence = i === 0 ? 0.92 : 0.78
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
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]!
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

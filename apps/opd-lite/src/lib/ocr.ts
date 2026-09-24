/**
 * Cloud Vision OCR integration for KYC document field extraction.
 * Story 22.5 AC #3, #5: Auto-extract fields with per-field confidence indicators.
 *
 * Story 62.2 (M-OPD-3): the browser NO LONGER calls Google Cloud Vision directly.
 * The image is proxied to the Hub (`POST /api/ocr/kyc`), which holds the Google
 * credential server-side and returns REAL word-level confidence from
 * DOCUMENT_TEXT_DETECTION. The confidence shown to clinicians is now the actual
 * Vision confidence of the matched words — not the previous synthetic 0.92/0.78.
 * The `NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY` has been removed from the client.
 *
 * SECURITY: Never log document content or extracted PHI.
 */
import { getHubBaseUrl } from '@/lib/hub-url'
import { getSupabaseBrowserClient } from '@/lib/supabase'

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

/** A single OCR word with its real Vision confidence (as returned by the Hub proxy). */
interface OcrWord {
  text: string
  confidence: number
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

function ocrEndpoint(): string {
  return `${getHubBaseUrl()}/api/ocr/kyc`
}

async function bearer(): Promise<Record<string, string>> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const token = data.session?.access_token
  return token ? { authorization: `Bearer ${token}` } : {}
}

const UNAVAILABLE: OcrResult = {
  fields: [],
  success: false,
  error: 'Auto-extraction unavailable — please enter fields manually',
}

/**
 * Extract KYC fields from a document image via the Hub OCR proxy.
 * Falls back gracefully (manual entry) if OCR is unavailable.
 */
export async function extractKycFields(imageBase64: string): Promise<OcrResult> {
  try {
    const response = await fetch(ocrEndpoint(), {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    })

    if (!response.ok) return UNAVAILABLE

    const data = (await response.json()) as {
      success?: boolean
      fullText?: string
      words?: OcrWord[]
    }

    if (!data.success || !data.fullText) return UNAVAILABLE

    const fields = extractFieldsFromText(data.fullText, data.words ?? [])
    return { fields, success: true }
  } catch {
    return UNAVAILABLE
  }
}

/**
 * Confidence for a matched value = the mean Vision confidence of the OCR words
 * that make up the value. Falls back to 0 when no word overlaps (defensive — a
 * genuinely low/absent confidence renders as "low confidence" in the UI, which is
 * the safe behavior). This replaces the previous synthetic regex-index constant.
 */
function confidenceForValue(value: string, words: OcrWord[]): number {
  if (words.length === 0) return 0
  // Normalize to alphanumeric tokens for matching against Vision words.
  const valueTokens = value
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
    .filter((t) => t.length > 0)
  if (valueTokens.length === 0) return 0

  const confidences: number[] = []
  for (const token of valueTokens) {
    // Find the first Vision word whose normalized text contains / is contained by
    // the value token (handles punctuation-split words).
    const match = words.find((w) => {
      const wt = w.text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
      return wt.length > 0 && (wt.includes(token) || token.includes(wt))
    })
    if (match) confidences.push(match.confidence)
  }

  if (confidences.length === 0) return 0
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length
  // Clamp to [0,1] defensively.
  return Math.min(1, Math.max(0, mean))
}

/**
 * Parse OCR text to extract known KYC fields, attaching REAL per-word confidence
 * from the Hub/Vision response.
 */
function extractFieldsFromText(text: string, words: OcrWord[]): OcrField[] {
  const fields: OcrField[] = []
  const lines = text.split('\n')

  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    let bestMatch: { value: string; confidence: number } | null = null

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern)
        if (match) {
          const value = (match[1] ?? match[0]!).trim()
          const confidence = confidenceForValue(value, words)
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
 * Convert a File to base64 string for the OCR proxy.
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

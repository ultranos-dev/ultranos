/**
 * OCR Service — Provider-agnostic abstraction for document metadata extraction.
 *
 * Accepts a file (base64), sends it to the configured OCR provider,
 * and returns structured metadata suggestions with confidence scores.
 *
 * Provider is selected via OCR_PROVIDER env var:
 *   - "google" → Google Cloud Vision API (default)
 *   - "azure"  → Azure Computer Vision (future)
 *   - "none"   → Disabled, returns empty suggestions
 *
 * Story 12.6 — AC 1, 7, 8
 *
 * PRIVACY: This module must NEVER log extracted text content (CLAUDE.md Safety Rule #1).
 * Only structured metadata (test category, date) is returned — free text is discarded.
 */

export interface OcrSuggestion {
  /** The metadata field name (e.g., "loincCode", "collectionDate") */
  field: string
  /** The suggested value */
  value: string
  /** Confidence score 0–100 */
  confidence: number
}

export interface OcrResult {
  suggestions: OcrSuggestion[]
  /** Processing time in milliseconds */
  processingTimeMs: number
  /** Whether the OCR service was available */
  available: boolean
  /** Provider that was used */
  provider: string
}

export interface OcrProvider {
  name: string
  analyze(fileBase64: string, fileType: string): Promise<OcrSuggestion[]>
}

// ── LOINC keyword → code mapping for OCR extraction ──────────
const LOINC_KEYWORD_MAP: Record<string, { code: string; display: string }> = {
  cbc: { code: '58410-2', display: 'Blood Work — CBC' },
  'complete blood count': { code: '58410-2', display: 'Blood Work — CBC' },
  lipid: { code: '57698-3', display: 'Lipid Panel' },
  'lipid panel': { code: '57698-3', display: 'Lipid Panel' },
  cholesterol: { code: '57698-3', display: 'Lipid Panel' },
  hba1c: { code: '4548-4', display: 'HbA1c' },
  'hemoglobin a1c': { code: '4548-4', display: 'HbA1c' },
  glycated: { code: '4548-4', display: 'HbA1c' },
  bmp: { code: '51990-0', display: 'Basic Metabolic Panel' },
  'basic metabolic': { code: '51990-0', display: 'Basic Metabolic Panel' },
  'metabolic panel': { code: '51990-0', display: 'Basic Metabolic Panel' },
  'liver function': { code: '24325-3', display: 'Liver Function Tests' },
  lft: { code: '24325-3', display: 'Liver Function Tests' },
  hepatic: { code: '24325-3', display: 'Liver Function Tests' },
  tsh: { code: '3016-3', display: 'Thyroid Function — TSH' },
  thyroid: { code: '3016-3', display: 'Thyroid Function — TSH' },
  urinalysis: { code: '24356-8', display: 'Urinalysis' },
  urine: { code: '24356-8', display: 'Urinalysis' },
  'fasting glucose': { code: '1558-6', display: 'Blood Glucose — Fasting' },
  'blood glucose': { code: '1558-6', display: 'Blood Glucose — Fasting' },
  'fasting blood sugar': { code: '1558-6', display: 'Blood Glucose — Fasting' },
  fbs: { code: '1558-6', display: 'Blood Glucose — Fasting' },
}

/**
 * Extract structured metadata from raw OCR text.
 * Only returns test category and collection date — free text is discarded.
 */
export function extractMetadataFromText(text: string): OcrSuggestion[] {
  const suggestions: OcrSuggestion[] = []
  const lowerText = text.toLowerCase()

  // Extract test category from keyword matching
  let bestMatch: { code: string; display: string; confidence: number } | null = null
  for (const [keyword, loinc] of Object.entries(LOINC_KEYWORD_MAP)) {
    if (lowerText.includes(keyword)) {
      // Longer keyword matches get higher confidence
      const confidence = Math.min(95, 70 + keyword.length * 2)
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { ...loinc, confidence }
      }
    }
  }

  if (bestMatch) {
    suggestions.push({
      field: 'loincCode',
      value: bestMatch.code,
      confidence: bestMatch.confidence,
    })
  }

  // Extract collection date (common formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
  const datePatterns = [
    // ISO 8601: YYYY-MM-DD (word-bounded to avoid matching embedded numeric sequences)
    { regex: /\b(\d{4})-(\d{2})-(\d{2})\b/, format: 'iso' },
    // DD/MM/YYYY or DD-MM-YYYY (MENA convention, word-bounded)
    { regex: /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/, format: 'dmy' },
  ]

  for (const { regex, format } of datePatterns) {
    const match = text.match(regex)
    if (match) {
      let dateStr: string
      let confidence = 75

      if (format === 'iso') {
        dateStr = `${match[1]}-${match[2]}-${match[3]}`
        confidence = 90
      } else {
        // DD/MM/YYYY → YYYY-MM-DD
        const day = parseInt(match[1]!, 10)
        const month = parseInt(match[2]!, 10)
        dateStr = `${match[3]}-${match[2]}-${match[1]}`
        // If both day and month are <= 12, the date is ambiguous (DD/MM vs MM/DD).
        // Lower confidence below threshold to force manual entry.
        confidence = day <= 12 && month <= 12 ? 70 : 80
      }

      // Validate the date is not in the future and is reasonable (UTC comparison)
      const parsed = new Date(dateStr + 'T00:00:00Z')
      const nowUtc = new Date(new Date().toISOString().split('T')[0] + 'T23:59:59Z')
      if (!isNaN(parsed.getTime()) && parsed <= nowUtc) {
        suggestions.push({
          field: 'collectionDate',
          value: dateStr,
          confidence,
        })
        break // Use first valid date found
      }
    }
  }

  return suggestions
}

// ── Google Cloud Vision Provider ─────────────────────────────

export class GoogleVisionProvider implements OcrProvider {
  name = 'google'
  private endpoint: string

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? process.env.OCR_API_ENDPOINT ?? ''
  }

  async analyze(fileBase64: string, fileType: string): Promise<OcrSuggestion[]> {
    if (!this.endpoint) {
      throw new Error('OCR_API_ENDPOINT not configured')
    }

    const apiKey = process.env.OCR_API_KEY
    if (!apiKey) {
      throw new Error('OCR_API_KEY not configured')
    }

    const mimeType = fileType || 'application/pdf'

    const requestBody = {
      requests: [
        {
          image: { content: fileBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: {
            languageHints: ['en', 'ar'],
          },
        },
      ],
    }

    // For PDFs, use the files:annotate endpoint with inputConfig
    const isPdf = mimeType === 'application/pdf'
    const body = isPdf
      ? {
          requests: [
            {
              inputConfig: {
                mimeType: 'application/pdf',
                content: fileBase64,
              },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }
      : requestBody

    const url = this.endpoint.includes('?')
      ? `${this.endpoint}&key=${apiKey}`
      : `${this.endpoint}?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`OCR API returned status ${response.status}`)
    }

    const data = await response.json()

    // Extract full text from Cloud Vision response
    const fullText =
      data?.responses?.[0]?.fullTextAnnotation?.text ??
      data?.responses?.[0]?.textAnnotations?.[0]?.description ??
      ''

    // PRIVACY: Only extract structured metadata — never return raw text
    return extractMetadataFromText(fullText)
  }
}

// ── Provider Registry ────────────────────────────────────────

const providers: Record<string, () => OcrProvider> = {
  google: () => new GoogleVisionProvider(),
}

function getProvider(): OcrProvider | null {
  const providerName = (process.env.OCR_PROVIDER ?? 'google').toLowerCase()
  if (providerName === 'none' || providerName === 'disabled') return null

  const factory = providers[providerName]
  if (!factory) return null
  return factory()
}

/**
 * Analyze a file using the configured OCR provider.
 * Returns structured metadata suggestions with confidence scores.
 *
 * If the OCR service is unavailable or unconfigured, returns
 * `{ available: false, suggestions: [] }` for graceful fallback.
 */
export async function analyzeFile(
  fileBase64: string,
  fileType: string,
): Promise<OcrResult> {
  const start = Date.now()

  const provider = getProvider()
  if (!provider) {
    return {
      suggestions: [],
      processingTimeMs: Date.now() - start,
      available: false,
      provider: 'none',
    }
  }

  try {
    const suggestions = await provider.analyze(fileBase64, fileType)
    return {
      suggestions,
      processingTimeMs: Date.now() - start,
      available: true,
      provider: provider.name,
    }
  } catch {
    // OCR unavailable — graceful fallback to manual entry (AC 7)
    return {
      suggestions: [],
      processingTimeMs: Date.now() - start,
      available: false,
      provider: provider.name,
    }
  }
}

/**
 * Minimal tRPC client configuration for Lab Lite.
 *
 * Uses raw fetch to the Hub API tRPC endpoint — avoids importing
 * hub-api's AppRouter type (and its runtime dependencies) into the PWA build.
 */

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_VERIFY_SUCCESS'
  | 'MFA_VERIFY_FAILURE'

/**
 * Fire-and-forget audit event reporting to Hub API.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export async function reportAuthEvent(
  event: AuthEventType,
  opts?: { actorId?: string; actorEmail?: string },
): Promise<void> {
  try {
    await fetch(`${getHubApiUrl()}/lab.reportAuthEvent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          event,
          ...(opts?.actorId ? { actorId: opts.actorId } : {}),
          ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
        },
      }),
    })
  } catch {
    // Audit reporting is best-effort from the client.
    // Server-side capture (Supabase webhooks) is the long-term solution.
  }
}

export interface VerifyPatientResult {
  firstName: string
  age: number
  patientRef: string
}

/**
 * Verify patient identity via Hub API.
 * Returns ONLY firstName, age, and opaque patientRef (data minimization).
 * Requires valid LAB_TECH JWT in the Authorization header.
 */
export async function verifyPatient(
  query: string,
  method: 'NATIONAL_ID' | 'QR_SCAN',
  token: string,
): Promise<VerifyPatientResult> {
  const input = encodeURIComponent(JSON.stringify({ json: { query, method } }))
  const res = await fetch(`${getHubApiUrl()}/lab.verifyPatient?input=${input}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as Record<string, any>)?.error?.json?.message ?? 'Patient verification failed'
    throw new Error(message)
  }

  const body = await res.json() as { result: { data: { json: VerifyPatientResult } } }
  return body.result.data.json
}

// ── OCR Analysis (Story 12.6) ────────────────────────────────

export interface OcrSuggestion {
  field: string
  value: string
  confidence: number
}

export interface OcrAnalysisResult {
  suggestions: OcrSuggestion[]
  processingTimeMs: number
  available: boolean
  provider: string
}

/**
 * Send a file to the Hub API for OCR analysis before upload commit.
 * Returns structured metadata suggestions with confidence scores.
 * If OCR is unavailable, returns { available: false, suggestions: [] }.
 *
 * Story 12.6 — AC 1, 7, 8
 */
export async function analyzeUpload(
  fileBase64: string,
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png',
  token: string,
): Promise<OcrAnalysisResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000) // 1 min timeout for OCR

  let res: Response
  try {
    res = await fetch(`${getHubApiUrl()}/lab.analyzeUpload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: { fileBase64, fileType } }),
      signal: controller.signal,
    })
  } catch {
    // OCR failure falls back to manual entry (AC 7)
    return { suggestions: [], processingTimeMs: 0, available: false, provider: 'error' }
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    return { suggestions: [], processingTimeMs: 0, available: false, provider: 'error' }
  }

  try {
    const body = await res.json() as { result: { data: { json: OcrAnalysisResult } } }
    return body.result.data.json
  } catch {
    // Response parsing failure falls back to manual entry (AC 7)
    return { suggestions: [], processingTimeMs: 0, available: false, provider: 'error' }
  }
}

export interface UploadResultInput {
  fileBase64: string
  fileName: string
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png'
  patientRef: string
  loincCode: string
  loincDisplay: string
  collectionDate: string
  ocrMetadataVerified?: boolean
  ocrSuggestions?: OcrSuggestion[]
}

export interface UploadResultResponse {
  success: boolean
  reportId: string
  status: string
  virusScanStatus: string
}

/**
 * Upload a lab result file with metadata to the Hub API.
 * Creates a FHIR DiagnosticReport resource with the file encrypted at rest.
 * Requires valid LAB_TECH JWT.
 *
 * Story 12.3 — AC 7, 8
 */
export async function uploadResult(
  input: UploadResultInput,
  token: string,
): Promise<UploadResultResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000) // 2 min timeout

  let res: Response
  try {
    res = await fetch(`${getHubApiUrl()}/lab.uploadResult`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: input }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Upload timed out — please check your connection and try again')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as Record<string, any>)?.error?.json?.message ?? 'Upload failed'
    throw new Error(message)
  }

  const body = await res.json() as { result: { data: { json: UploadResultResponse } } }
  return body.result.data.json
}

export { getHubApiUrl }

/**
 * KYC document OCR proxy — Story 62.2 (M-OPD-3).
 *
 * Previously OPD-Lite called Google Cloud Vision directly from the browser with a
 * `NEXT_PUBLIC_` API key (shipped in the client bundle) and displayed a SYNTHETIC
 * confidence (regex-index 0.92/0.78) compared against a real-looking 0.85
 * threshold. This route moves the Vision call server-side:
 *
 *  - The Google credential lives ONLY on the server (`GOOGLE_CLOUD_VISION_API_KEY`,
 *    non-public) — never in the client bundle.
 *  - Auth is required (Supabase JWT), so an anonymous caller cannot burn quota.
 *  - Rate-limited per user (fail-open — an OCR outage must not break manual entry).
 *  - The image is processed in-memory and NEVER persisted (no bucket write, no DB).
 *  - Uses DOCUMENT_TEXT_DETECTION so the response carries REAL word-level
 *    confidence, which the client maps onto its extracted fields — replacing the
 *    synthetic values.
 *  - The PHI read is audited (Rule #6). No document content or PHI is ever logged.
 */
import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk, resolveAuthzClaims } from '@/lib/jwt'
import { isOriginAllowed, corsHeaders } from '@/lib/cors'
import { checkRateLimit } from '@/trpc/middleware/rateLimit'
import { AuditLogger } from '@ultranos/audit-logger'
import { createHash } from 'crypto'
import type { UserRole } from '@ultranos/shared-types'

/** Max base64 payload accepted (≈ a 10 MB image once decoded). */
const MAX_BASE64_LEN = 14 * 1024 * 1024
/** Generous, non-auth-critical limiter — an outage must not block manual entry. */
const OCR_RATE_LIMIT = { limit: 30, windowSec: 60 } as const

interface AuthedUser {
  sub: string
  role: `${UserRole}`
  sessionId: string
  orgId?: string
}

interface OcrWord {
  text: string
  confidence: number
}

function withCors(req: Request, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v)
  }
  return res
}

async function authenticate(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwk = getSupabaseJwk()
  if (!jwk) return null
  try {
    const payload = await verifySupabaseJwt(authHeader.slice(7), jwk)
    if (!payload?.sub) return null
    // Story 56.1: authorization claims from app_metadata only.
    const claims = resolveAuthzClaims(payload)
    return {
      sub: payload.sub,
      role: claims.role as `${UserRole}`,
      sessionId: (payload.session_id as string) ?? '',
      orgId: claims.orgId ?? undefined,
    }
  } catch {
    return null
  }
}

/** Rate-limit key: authenticated user id (matches deriveIdentifier's auth scope). */
function rateLimitId(user: AuthedUser, req: Request): { scope: 'auth' | 'ip'; id: string } {
  if (user.sub) return { scope: 'auth', id: user.sub }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  return { scope: 'ip', id: createHash('sha256').update(ip).digest('hex') }
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  // Rate limit (fail-open — OCR is a convenience over manual entry).
  const rl = await checkRateLimit(rateLimitId(user, req), 'ocr.kyc', OCR_RATE_LIMIT, 'ocrKyc')
  if (!rl.allowed) {
    return withCors(
      req,
      NextResponse.json({ error: 'Rate limit exceeded — try again shortly' }, { status: 429 }),
    )
  }

  let body: { imageBase64?: unknown }
  try {
    body = (await req.json()) as { imageBase64?: unknown }
  } catch {
    return withCors(req, NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }))
  }

  const imageBase64 = body.imageBase64
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return withCors(req, NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 }))
  }
  if (imageBase64.length > MAX_BASE64_LEN) {
    return withCors(req, NextResponse.json({ error: 'Image too large' }, { status: 413 }))
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
  if (!apiKey) {
    // Not configured — the client falls back to manual entry. NOT an error the
    // client should treat as a bug; it mirrors the prior "unavailable" behavior.
    return withCors(
      req,
      NextResponse.json(
        { success: false, error: 'OCR unavailable', fullText: '', words: [] },
        { status: 503 },
      ),
    )
  }

  // ── Call Google Cloud Vision server-side (DOCUMENT_TEXT_DETECTION for word
  //    confidence). The image is only ever held in this request scope. ──
  let visionData: unknown
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
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      },
    )
    if (!response.ok) {
      return withCors(
        req,
        NextResponse.json(
          { success: false, error: 'OCR unavailable', fullText: '', words: [] },
          { status: 502 },
        ),
      )
    }
    visionData = await response.json()
  } catch {
    return withCors(
      req,
      NextResponse.json(
        { success: false, error: 'OCR unavailable', fullText: '', words: [] },
        { status: 502 },
      ),
    )
  }

  const { fullText, words } = parseVisionResponse(visionData)

  // Audit the PHI read (Rule #6). No document content / PHI in the audit metadata.
  try {
    const audit = new AuditLogger(getSupabaseClient(), user.orgId)
    await audit.emit({
      action: 'PHI_READ',
      resourceType: 'SYSTEM',
      resourceId: 'kyc-ocr',
      actorId: user.sub,
      actorRole: user.role as Parameters<AuditLogger['emit']>[0]['actorRole'],
      outcome: 'SUCCESS',
      sessionId: user.sessionId,
      metadata: { source: 'ocr.kyc', wordCount: words.length },
    })
  } catch {
    // Audit failure must not block the OCR response.
  }

  return withCors(req, NextResponse.json({ success: true, fullText, words }))
}

/**
 * Extract fullText + per-word confidence from a Vision DOCUMENT_TEXT_DETECTION
 * response. Word confidence is Vision's own [0,1] value; text is the concatenated
 * symbols of the word.
 */
function parseVisionResponse(data: unknown): { fullText: string; words: OcrWord[] } {
  const resp = (data as { responses?: unknown[] })?.responses?.[0] as
    | {
        fullTextAnnotation?: {
          text?: string
          pages?: Array<{
            blocks?: Array<{
              paragraphs?: Array<{
                words?: Array<{
                  confidence?: number
                  symbols?: Array<{ text?: string }>
                }>
              }>
            }>
          }>
        }
      }
    | undefined

  const fta = resp?.fullTextAnnotation
  const fullText = fta?.text ?? ''
  const words: OcrWord[] = []

  for (const page of fta?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          const text = (word.symbols ?? []).map((s) => s.text ?? '').join('')
          if (text.length === 0) continue
          words.push({
            text,
            confidence: typeof word.confidence === 'number' ? word.confidence : 0,
          })
        }
      }
    }
  }

  return { fullText, words }
}

export function OPTIONS(req: Request): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }))
}

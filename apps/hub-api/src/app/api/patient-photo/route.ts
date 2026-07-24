import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSupabaseClient, db } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { hasResourceAccess } from '@/trpc/rbac'
import { isOriginAllowed, corsHeaders } from '@/lib/cors'
import { AuditLogger } from '@ultranos/audit-logger'

/** Add CORS headers for allowed spoke origins (mirrors the tRPC route). */
function withCors(req: Request, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v)
  }
  return res
}

const BUCKET = 'patient-photos'
const MAX_DIM = 512
const WEBP_QUALITY = 80
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuthedUser { sub: string; role: string; sessionId: string; orgId?: string }

async function authenticate(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwk = getSupabaseJwk()
  if (!jwk) return null
  const payload = await verifySupabaseJwt(authHeader.slice(7), jwk)
  if (!payload?.sub) return null
  const meta = (payload.user_metadata as Record<string, unknown>) ?? {}
  return {
    sub: payload.sub,
    role: ((meta.role as string) ?? (payload.role as string) ?? '').toUpperCase(),
    sessionId: (payload.session_id as string) ?? '',
    orgId: (meta.org_id as string) ?? (payload.org_id as string) ?? undefined,
  }
}

/** Fetch patient + guard optimistic concurrency. Returns key or an error response. */
async function loadAndGuard(
  supabase: ReturnType<typeof getSupabaseClient>,
  patientId: string,
  lastKnownUpdate: string,
): Promise<{ error: NextResponse } | { ok: true }> {
  const { data: current, error } = await supabase
    .from('patients')
    .select('id, updated_at')
    .eq('id', patientId)
    .eq('is_active', true)
    .single()
  if (error || !current) return { error: NextResponse.json({ error: 'Patient not found' }, { status: 404 }) }
  if (current.updated_at && new Date(lastKnownUpdate) < new Date(current.updated_at)) {
    return { error: NextResponse.json({ error: 'Stale update' }, { status: 409 }) }
  }
  return { ok: true }
}

async function setPhotoUrl(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: AuthedUser,
  patientId: string,
  photoUrl: string | null,
): Promise<{ error: NextResponse } | { lastUpdated: string }> {
  const updatedAt = new Date().toISOString()
  const row = db.toRow({ photoUrl, updatedAt, updatedBy: user.sub })
  const { data, error } = await supabase
    .from('patients').update(row).eq('id', patientId).eq('is_active', true).select('id')
  if (error) return { error: NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
  if (!data || data.length === 0) return { error: NextResponse.json({ error: 'Patient not found' }, { status: 404 }) }

  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId,
      actorId: user.sub, actorRole: user.role, outcome: 'SUCCESS', sessionId: user.sessionId,
      metadata: { operation: photoUrl ? 'photo_upload' : 'photo_remove' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT' })
  }
  return { lastUpdated: updatedAt }
}

async function handlePost(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasResourceAccess(user.role, 'Patient')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form' }, { status: 400 }) }
  const file = form.get('file')
  const patientId = String(form.get('patientId') ?? '')
  const lastKnownUpdate = String(form.get('lastKnownUpdate') ?? '')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Invalid patientId' }, { status: 400 })
  if (!lastKnownUpdate) return NextResponse.json({ error: 'Missing lastKnownUpdate' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, patientId, lastKnownUpdate)
  if ('error' in guard) return guard.error

  // Sharp: auto-orient, cap 512, WebP q80, metadata stripped (default)
  let webp: Buffer
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Unsupported or corrupt image' }, { status: 400 })
  }

  const key = `${patientId}.webp`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET).upload(key, webp, { upsert: true, contentType: 'image/webp' })
  if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const result = await setPhotoUrl(supabase, user, patientId, key)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: key, lastUpdated: result.lastUpdated }, { status: 200 })
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasResourceAccess(user.role, 'Patient')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { patientId?: string; lastKnownUpdate?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const patientId = String(body.patientId ?? '')
  const lastKnownUpdate = String(body.lastKnownUpdate ?? '')
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Invalid patientId' }, { status: 400 })
  if (!lastKnownUpdate) return NextResponse.json({ error: 'Missing lastKnownUpdate' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, patientId, lastKnownUpdate)
  if ('error' in guard) return guard.error

  await supabase.storage.from(BUCKET).remove([`${patientId}.webp`, `${patientId}.jpg`]).catch(() => {})

  const result = await setPhotoUrl(supabase, user, patientId, null)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: null, lastUpdated: result.lastUpdated }, { status: 200 })
}

// CORS-wrapped exports. The browser sends a preflight OPTIONS for the multipart
// POST / JSON DELETE (both carry an Authorization header), so every response —
// including the preflight — must advertise the allowed spoke origin.
export async function POST(req: Request): Promise<NextResponse> {
  return withCors(req, await handlePost(req))
}

export async function DELETE(req: Request): Promise<NextResponse> {
  return withCors(req, await handleDelete(req))
}

export function OPTIONS(req: Request): NextResponse {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }
  return new NextResponse(null, { status: 204 })
}

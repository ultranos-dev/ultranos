import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { isOriginAllowed, corsHeaders } from '@/lib/cors'
import { AuditLogger } from '@ultranos/audit-logger'

/** Add CORS headers for allowed spoke origins (mirrors the patient-photo route). */
function withCors(req: Request, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v)
  }
  return res
}

const BUCKET = 'staff-photos'
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

/** Fetch practitioner (scoped to the admin's org) + guard optimistic concurrency. */
async function loadAndGuard(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: AuthedUser,
  practitionerId: string,
  lastKnownUpdate: string,
): Promise<{ error: NextResponse } | { ok: true; authUserId: string | null }> {
  const { data: current, error } = await supabase
    .from('practitioners')
    .select('id, updated_at, auth_user_id')
    .eq('id', practitionerId)
    .eq('org_id', user.orgId ?? '')
    .single()
  if (error || !current) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
  // Only enforce staleness when the client sent a valid timestamp older than the row.
  if (lastKnownUpdate && current.updated_at && new Date(lastKnownUpdate) < new Date(current.updated_at)) {
    return { error: NextResponse.json({ error: 'Stale update' }, { status: 409 }) }
  }
  return { ok: true, authUserId: (current.auth_user_id as string) ?? null }
}

/** Authorize: an admin (any staff in their org) OR the practitioner editing their OWN photo. */
function authorizePhotoEdit(user: AuthedUser, targetAuthUserId: string | null): NextResponse | null {
  const isAdmin = user.role === 'ADMIN'
  const isSelf = !!targetAuthUserId && targetAuthUserId === user.sub
  if (!isAdmin && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

async function setAvatarUrl(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: AuthedUser,
  practitionerId: string,
  avatarUrl: string | null,
): Promise<{ error: NextResponse } | { lastUpdated: string }> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('practitioners')
    .update({ avatar_url: avatarUrl, updated_at: updatedAt })
    .eq('id', practitionerId)
    .eq('org_id', user.orgId ?? '')
    .select('id')
  if (error) return { error: NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
  if (!data || data.length === 0) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }

  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'USER_UPDATED', resourceType: 'USER_ACCOUNT', resourceId: practitionerId,
      actorId: user.sub, actorRole: user.role, outcome: 'SUCCESS', sessionId: user.sessionId,
      metadata: { operation: avatarUrl ? 'photo_upload' : 'photo_remove' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'USER_UPDATED', resourceType: 'USER_ACCOUNT' })
  }
  return { lastUpdated: updatedAt }
}

/** Encode an uploaded image to a 512² WebP buffer, or an error response. */
async function encodeWebp(file: Blob): Promise<Buffer | NextResponse> {
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Unsupported or corrupt image' }, { status: 400 })
  }
}

/**
 * Self-avatar for an auth user with NO practitioner row (e.g. a pure-admin account):
 * store the photo keyed by the auth user id and record the key in auth user_metadata.
 */
async function setAuthAvatar(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: AuthedUser,
  key: string | null,
): Promise<{ error: NextResponse } | { lastUpdated: string }> {
  try {
    // Merge into existing metadata so role/org_id and other auth claims are preserved
    // (mirrors admin.updateAdminProfile — never send a bare user_metadata that could
    // clobber the admin's role claim and break authorization).
    const { data: existing } = await supabase.auth.admin.getUserById(user.sub)
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>
    await supabase.auth.admin.updateUserById(user.sub, {
      user_metadata: { ...prevMeta, avatar_url: key },
    })
  } catch {
    return { error: NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
  }
  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'USER_UPDATED', resourceType: 'USER_ACCOUNT', resourceId: user.sub,
      actorId: user.sub, actorRole: user.role, outcome: 'SUCCESS', sessionId: user.sessionId,
      metadata: { operation: key ? 'photo_upload' : 'photo_remove', target: 'self_auth' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'USER_UPDATED', resourceType: 'USER_ACCOUNT' })
  }
  return { lastUpdated: new Date().toISOString() }
}

async function handlePost(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form' }, { status: 400 }) }
  const file = form.get('file')
  const practitionerId = String(form.get('practitionerId') ?? '')
  const lastKnownUpdate = String(form.get('lastKnownUpdate') ?? '')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!UUID.test(practitionerId)) return NextResponse.json({ error: 'Invalid practitionerId' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, user, practitionerId, lastKnownUpdate)

  const webp = await encodeWebp(file)
  if (webp instanceof NextResponse) return webp

  // Auth-self path: no practitioner row, caller editing their OWN photo (id === auth sub).
  if ('error' in guard) {
    if (practitionerId === user.sub) {
      const key = `${user.sub}.webp`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET).upload(key, webp, { upsert: true, contentType: 'image/webp' })
      if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
      const authResult = await setAuthAvatar(supabase, user, key)
      if ('error' in authResult) return authResult.error
      return NextResponse.json({ photoUrl: key, lastUpdated: authResult.lastUpdated }, { status: 200 })
    }
    return guard.error
  }

  const authz = authorizePhotoEdit(user, guard.authUserId)
  if (authz) return authz

  const key = `${practitionerId}.webp`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET).upload(key, webp, { upsert: true, contentType: 'image/webp' })
  if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const result = await setAvatarUrl(supabase, user, practitionerId, key)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: key, lastUpdated: result.lastUpdated }, { status: 200 })
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { practitionerId?: string; lastKnownUpdate?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const practitionerId = String(body.practitionerId ?? '')
  const lastKnownUpdate = String(body.lastKnownUpdate ?? '')
  if (!UUID.test(practitionerId)) return NextResponse.json({ error: 'Invalid practitionerId' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, user, practitionerId, lastKnownUpdate)

  // Auth-self path: no practitioner row, caller removing their OWN photo.
  if ('error' in guard) {
    if (practitionerId === user.sub) {
      await supabase.storage.from(BUCKET).remove([`${user.sub}.webp`]).catch(() => {})
      const authResult = await setAuthAvatar(supabase, user, null)
      if ('error' in authResult) return authResult.error
      return NextResponse.json({ photoUrl: null, lastUpdated: authResult.lastUpdated }, { status: 200 })
    }
    return guard.error
  }

  const authz = authorizePhotoEdit(user, guard.authUserId)
  if (authz) return authz

  await supabase.storage.from(BUCKET).remove([`${practitionerId}.webp`]).catch(() => {})

  const result = await setAvatarUrl(supabase, user, practitionerId, null)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: null, lastUpdated: result.lastUpdated }, { status: 200 })
}

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

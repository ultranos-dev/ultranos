import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { hasResourceAccess } from '@/trpc/rbac'
import { checkConsent } from '@/trpc/middleware/enforceConsent'
import { decryptField } from '@ultranos/crypto/server'
import { getCachedEncryptionKey } from '@/lib/field-encryption'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * GET /api/specimen-files/:fileId
 *
 * Specimen attachment download endpoint.
 * Streams decrypted binary file content with proper Content-Type/Content-Disposition.
 * Enforces RBAC + consent + audit. Never serves infected/pending files.
 *
 * Mirrors /api/lab-files/[fileId]/route.ts — patient_ref and virus_scan_status
 * live directly on specimen_files (no join to a parent report table needed).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params

  // Validate fileId format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(fileId)) {
    return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 })
  }

  // Authenticate via Bearer token
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const jwk = getSupabaseJwk()
  if (!jwk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await verifySupabaseJwt(token, jwk)
  if (!payload?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userMeta = (payload.user_metadata as Record<string, unknown>) ?? {}
  const user = {
    sub: payload.sub,
    role: ((userMeta.role as string) ?? (payload.role as string) ?? '').toUpperCase(),
    sessionId: (payload.session_id as string) ?? '',
    orgId: (userMeta.org_id as string) ?? (payload.org_id as string) ?? undefined,
  }

  // RBAC check — labs hold DiagnosticReport access (same as lab-files route)
  if (!hasResourceAccess(user.role, 'DiagnosticReport')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseClient()

  // Fetch specimen file record — patient_ref and virus_scan_status live on the row itself
  const { data: file, error: fileError } = await supabase
    .from('specimen_files')
    .select('id, specimen_id, patient_ref, file_name, file_type, file_size, encrypted_content, virus_scan_status')
    .eq('id', fileId)
    .single()

  if (fileError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Block access to unclean files
  if (file.virus_scan_status !== 'clean') {
    return NextResponse.json({ error: 'File not available' }, { status: 403 })
  }

  // Consent check — extract patient ID from patient_ref.
  // patient_ref is the bare blind index (matches OPD read path); tolerate a legacy 'Patient/' prefix.
  const patientId = file.patient_ref?.replace(/^Patient\//, '')
  if (!patientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const hasConsent = await checkConsent(supabase, {
    patientId,
    resourceType: 'DiagnosticReport',
  })

  if (!hasConsent) {
    return NextResponse.json({ error: 'No active consent' }, { status: 403 })
  }

  // Decrypt file content
  const encryptionKey = getCachedEncryptionKey()
  let fileBuffer: Buffer

  if (file.encrypted_content && file.encrypted_content.startsWith('v1:')) {
    const decrypted = decryptField(file.encrypted_content, encryptionKey)
    if (decrypted === '[Encrypted Content]') {
      return NextResponse.json({ error: 'File decryption failed' }, { status: 500 })
    }
    // Decrypted content is base64-encoded binary
    fileBuffer = Buffer.from(decrypted, 'base64')
  } else if (file.encrypted_content) {
    // encrypted_content is present but not in the expected v1: format — reject rather
    // than serve potentially plaintext PHI. specimen_files is a new table; every row
    // written by uploadSpecimenFile uses v1:. A non-v1: value indicates a write-path
    // bug, not a legitimate legacy record.
    return NextResponse.json({ error: 'File decryption failed' }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'No file content' }, { status: 404 })
  }

  // Audit file access (CLAUDE.md Rule #6)
  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'PHI_READ',
      resourceType: 'SPECIMEN',
      resourceId: fileId,
      actorId: user.sub,
      actorRole: user.role,
      outcome: 'SUCCESS',
      sessionId: user.sessionId,
      metadata: { operation: 'specimen_file_download', fileId },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'SPECIMEN', fileId })
  }

  // Return binary with proper headers
  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': file.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${(file.file_name || 'download').replace(/["\\\r\n]/g, '_')}"`,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'no-store',
    },
  })
}

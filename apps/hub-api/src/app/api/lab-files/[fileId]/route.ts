import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { hasResourceAccess } from '@/trpc/rbac'
import { checkConsent } from '@/trpc/middleware/enforceConsent'
import { decryptField } from '@ultranos/crypto/server'
import { getCachedEncryptionKey } from '@/lib/field-encryption'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * GET /api/lab-files/:fileId
 *
 * Story 16.8 Task 3: File download endpoint.
 * Streams decrypted binary file content with proper Content-Type/Content-Disposition.
 * Enforces RBAC + consent + audit. Never serves infected/pending files.
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

  // RBAC check
  if (!hasResourceAccess(user.role, 'DiagnosticReport')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseClient()

  // Fetch file record with associated report for consent check
  const { data: file, error: fileError } = await supabase
    .from('lab_result_files')
    .select('id, diagnostic_report_id, file_name, file_type, file_size, encrypted_content')
    .eq('id', fileId)
    .single()

  if (fileError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Get the parent report for virus scan status and patient ref
  const { data: report, error: reportError } = await supabase
    .from('diagnostic_reports')
    .select('id, patient_ref, virus_scan_status')
    .eq('id', file.diagnostic_report_id)
    .single()

  if (reportError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  // Block access to unclean files
  if (report.virus_scan_status !== 'clean') {
    return NextResponse.json({ error: 'File not available' }, { status: 403 })
  }

  // Consent check — extract patient ID from patient_ref
  const patientId = report.patient_ref?.replace('Patient/', '')
  if (!patientId || patientId === report.patient_ref) {
    // patient_ref is missing or malformed (no 'Patient/' prefix) — deny access
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
    // Legacy unencrypted content (base64)
    fileBuffer = Buffer.from(file.encrypted_content, 'base64')
  } else {
    return NextResponse.json({ error: 'No file content' }, { status: 404 })
  }

  // Audit file access (CLAUDE.md Rule #6)
  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'PHI_READ',
      resourceType: 'DIAGNOSTIC_REPORT',
      resourceId: file.diagnostic_report_id,
      actorId: user.sub,
      actorRole: user.role,
      outcome: 'SUCCESS',
      sessionId: user.sessionId,
      metadata: { operation: 'file_download', fileId },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'DIAGNOSTIC_REPORT', fileId })
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

/**
 * KYC Hub API client — raw fetch calls to tRPC endpoints.
 * Story 22.5: No tRPC client import to avoid pulling hub-api deps into PWA build.
 *
 * SECURITY: Never log document content or PII from OCR results.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getHubTrpcUrl } from '@/lib/hub-url'

function getHubApiUrl(): string {
  return getHubTrpcUrl()
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function buildUrl(procedure: string): URL {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + `/${procedure}`
  return url
}

export interface KycUploadUrlResponse {
  uploadUrl: string
  storageKey: string
  expiresAt: string
}

export interface OcrFieldResult {
  name: string
  value: string
  confidence: number
}

export interface KycDocument {
  type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
  storageKey: string
  ocrResults: { fields: OcrFieldResult[] }
}

export interface KycSubmitResponse {
  success: boolean
  submissionId: string
  submittedAt: string
  message: string
}

export interface KycStatusResponse {
  kycStatus: string
  latestSubmission: {
    id: string
    status: string
    registry_number: string
    rejection_reason: string | null
    admin_message: string | null
    submitted_at: string
  } | null
}

/** Get a signed upload URL for a KYC document */
export async function getKycUploadUrl(
  practitionerId: string,
  documentType: 'MEDICAL_LICENSE' | 'NATIONAL_ID',
  contentType: string,
): Promise<KycUploadUrlResponse> {
  const token = await getAuthToken()
  if (!token) throw new Error('Not authenticated')

  const url = buildUrl('registration.getKycUploadUrl')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      json: { practitionerId, documentType, contentType },
    }),
  })

  if (!res.ok) throw new Error('Failed to get upload URL')
  const body = await res.json()
  return body.result.data.json
}

/** Upload a file to the signed URL */
export async function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed')
}

/** Submit KYC documents and OCR results */
export async function submitKyc(
  practitionerId: string,
  documents: KycDocument[],
  registryNumber: string,
): Promise<KycSubmitResponse> {
  const token = await getAuthToken()
  if (!token) throw new Error('Not authenticated')

  const url = buildUrl('registration.submitKyc')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      json: { practitionerId, documents, registryNumber },
    }),
  })

  if (!res.ok) throw new Error('Submission failed')
  const body = await res.json()
  return body.result.data.json
}

/** Get current KYC status and latest submission */
export async function getKycStatus(
  practitionerId: string,
): Promise<KycStatusResponse> {
  const token = await getAuthToken()
  if (!token) throw new Error('Not authenticated')

  const url = buildUrl('registration.getKycStatus')
  url.searchParams.set('input', JSON.stringify({ json: { practitionerId } }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to get KYC status')
  const body = await res.json()
  return body.result.data.json
}

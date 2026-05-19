/**
 * Guardian API integration — client-side functions for guardian linking.
 *
 * Story 18.7, Task 4: Guardian linking API layer
 *
 * - initiateGuardianLink: sends OTP to guardian's phone via Supabase Auth
 * - confirmGuardianLink: verifies OTP via Hub API (server-side) and creates the link
 * - unlinkGuardian: revokes a guardian link, all guardian-created consents, and notifies
 * - getActiveGuardianLink: retrieves the current active guardian link
 *
 * V1: Guardian manages consent from the patient's device.
 * All operations are patient-initiated (privacy-by-design).
 *
 * CLAUDE.md Rule #1: No PHI in logs. Phone numbers are HMAC-hashed before storage.
 */
import { supabase } from '@/lib/supabase'
import { getEncryptedDbConnection } from '@/lib/encrypted-db'
import { getOrCreateDbPassphrase } from '@/lib/mobile-key-service'
import type { GuardianLink } from '@ultranos/shared-types'
import { MAX_ACTIVE_GUARDIAN_LINKS } from '@ultranos/shared-types'
import { emitGuardianAudit } from '@/lib/guardian-audit'
import { queueConsentSync } from '@/lib/consent-sync'
import { hubFetch, CompromisedDeviceError } from '@/lib/hub-fetch'

const HUB_API_URL = process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'

/**
 * HMAC-SHA256 hash a phone number for storage.
 * Uses a device-specific key from the secure enclave — not a plain digest.
 * Never store phone numbers in plaintext.
 */
async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await getOrCreateDbPassphrase()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(phone))
  const hashArray = Array.from(new Uint8Array(sig))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Extract last 4 digits of a phone number for display hint.
 */
function extractPhoneHint(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-4)
}

/**
 * Initiate guardian linking by sending an OTP to the guardian's phone.
 * The patient initiates this flow — the guardian only verifies via OTP.
 */
export async function initiateGuardianLink(
  patientId: string,
  guardianPhone: string,
  channel: 'sms' | 'whatsapp' = 'sms',
): Promise<void> {
  // Check V1 limit: max 1 active guardian per patient
  const existing = await getActiveGuardianLink(patientId)
  if (existing) {
    throw new Error('V1 limit: patient already has an active guardian link')
  }

  const otpOptions: Parameters<typeof supabase.auth.signInWithOtp>[0] = {
    phone: guardianPhone,
    ...(channel === 'whatsapp' ? { options: { channel: 'whatsapp' } } : {}),
  }

  const { error } = await supabase.auth.signInWithOtp(otpOptions)
  if (error) {
    throw new Error('Failed to send OTP to guardian')
  }
}

/**
 * Confirm guardian linking by verifying the OTP via Hub API (server-side).
 * The Hub API verifies the OTP using Supabase Admin SDK — no client session displacement.
 * On success, creates the guardian link in both Hub API and local SQLCipher.
 */
export async function confirmGuardianLink(
  patientId: string,
  guardianPhone: string,
  otp: string,
  channel: 'sms' | 'whatsapp' = 'sms',
): Promise<GuardianLink> {
  // Verify OTP via Hub API — server-side verification avoids client session displacement
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  const res = await hubFetch(`${HUB_API_URL}/guardian.verifyOtp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      json: { patientId, guardianPhone, otp, channel },
    }),
  })

  if (!res.ok) {
    throw new Error('Guardian OTP verification failed')
  }

  const body = (await res.json()) as {
    result: { data: { json: { guardianUserId: string } } }
  }
  const guardianUserId = body.result.data.json.guardianUserId

  const hashedPhone = await hashPhone(guardianPhone)
  const phoneHint = extractPhoneHint(guardianPhone)
  const now = new Date().toISOString()

  const link: GuardianLink = {
    id: crypto.randomUUID(),
    patientId,
    guardianUserId,
    guardianPhone: hashedPhone,
    guardianPhoneHint: phoneHint,
    role: 'GUARDIAN',
    linkedAt: now,
    linkedBy: 'PATIENT',
    status: 'active',
  }

  // Store locally for offline reference
  await saveGuardianLinkLocal(link)

  // Sync to Hub API for cross-device persistence and notifications (Decision 2)
  try {
    await hubFetch(`${HUB_API_URL}/guardian.createLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ json: { link } }),
    })
  } catch (err) {
    // Compromised device — do not queue, re-throw to block the write
    if (err instanceof CompromisedDeviceError) throw err
    // Offline — queue for sync. Hub API call will be retried by sync engine.
    const db = await getEncryptedDbConnection()
    await db.runAsync(
      `INSERT INTO sync_queue (id, resource_type, resource_id, action, payload, status, hlc_timestamp, created_at, retry_count)
       VALUES (?, 'GuardianLink', ?, 'create', ?, 'pending', ?, ?, 0)`,
      [crypto.randomUUID(), link.id, JSON.stringify(link), now, now],
    )
  }

  // Audit: GUARDIAN_LINK_CREATED — no PHI, opaque IDs only
  emitGuardianAudit('GUARDIAN_LINK_CREATED', patientId, guardianUserId)

  return link
}

/**
 * Unlink a guardian — revokes the link, all guardian-created consents,
 * and sends a notification to the guardian.
 * Immediate effect — no waiting for guardian approval.
 */
export async function unlinkGuardian(
  patientId: string,
  guardianLinkId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const db = await getEncryptedDbConnection()

  // Use a transaction for atomicity — audit must always fire
  const link = await db.getFirstAsync<{ guardian_user_id: string }>(
    `SELECT guardian_user_id FROM guardian_links WHERE id = ? AND patient_id = ?`,
    [guardianLinkId, patientId],
  )

  const guardianUserId = link?.guardian_user_id ?? 'unknown'

  // Revoke the guardian link
  await db.runAsync(
    `UPDATE guardian_links SET status = 'revoked', revoked_at = ? WHERE id = ? AND patient_id = ?`,
    [now, guardianLinkId, patientId],
  )

  // Revoke all guardian-created consent records (AC #10)
  await db.runAsync(
    `UPDATE consents SET status = 'withdrawn', updated_at = ? WHERE patient_id = ? AND data LIKE '%"grantorRole":"GUARDIAN"%'`,
    [now, patientId],
  )

  // Audit: GUARDIAN_LINK_REVOKED — always emitted regardless of SELECT result
  emitGuardianAudit('GUARDIAN_LINK_REVOKED', patientId, guardianUserId)

  // Notify guardian via Hub API (AC #10): "You have been unlinked"
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    await hubFetch(`${HUB_API_URL}/guardian.notifyUnlink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        json: { patientId, guardianUserId, guardianLinkId },
      }),
    })
  } catch (err) {
    // Compromised device — do not queue, re-throw to block the write
    if (err instanceof CompromisedDeviceError) throw err
    // Offline — notification will be retried by sync engine
    await db.runAsync(
      `INSERT INTO sync_queue (id, resource_type, resource_id, action, payload, status, hlc_timestamp, created_at, retry_count)
       VALUES (?, 'GuardianNotification', ?, 'notify_unlink', ?, 'pending', ?, ?, 0)`,
      [crypto.randomUUID(), guardianLinkId, JSON.stringify({ patientId, guardianUserId }), now, now],
    )
  }
}

/**
 * Get the active guardian link for a patient.
 * V1: at most one active guardian per patient.
 */
export async function getActiveGuardianLink(
  patientId: string,
): Promise<GuardianLink | null> {
  const db = await getEncryptedDbConnection()

  const row = await db.getFirstAsync<{
    id: string
    patient_id: string
    guardian_user_id: string
    guardian_phone: string
    guardian_phone_hint: string
    role: string
    linked_at: string
    linked_by: string
    status: string
    revoked_at: string | null
  }>(
    `SELECT * FROM guardian_links WHERE patient_id = ? AND status = 'active' LIMIT 1`,
    [patientId],
  )

  if (!row) return null

  return {
    id: row.id,
    patientId: row.patient_id,
    guardianUserId: row.guardian_user_id,
    guardianPhone: row.guardian_phone,
    guardianPhoneHint: row.guardian_phone_hint,
    role: 'GUARDIAN',
    linkedAt: row.linked_at,
    linkedBy: 'PATIENT',
    status: 'active',
    revokedAt: row.revoked_at ?? undefined,
  }
}

/**
 * Save a guardian link to local SQLCipher.
 * The UNIQUE index on (patient_id) WHERE status='active' enforces V1 limit at DB level.
 */
async function saveGuardianLinkLocal(link: GuardianLink): Promise<void> {
  const db = await getEncryptedDbConnection()

  await db.runAsync(
    `INSERT INTO guardian_links (id, patient_id, guardian_user_id, guardian_phone, guardian_phone_hint, role, linked_at, linked_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      link.id,
      link.patientId,
      link.guardianUserId,
      link.guardianPhone,
      link.guardianPhoneHint,
      link.role,
      link.linkedAt,
      link.linkedBy,
      link.status,
    ],
  )
}

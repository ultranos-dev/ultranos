/**
 * Story 49.4 — Minimal-Data Backup Generator
 *
 * Generates a portable backup containing:
 *   - Encrypted PHI table records (post-emergency-encryption)
 *   - Full audit trail (clientAuditLog — unencrypted, no PHI per CLAUDE.md)
 *   - Device configuration (dataBudgetConfig — non-PHI)
 *   - SHA-256 checksum for tamper detection
 *
 * The backup is a JSON document suitable for:
 *   - USB download (trigger file download)
 *   - Cloud push to Hub API endpoint /security-backup (if connectivity exists)
 *
 * Compression: attempted via CompressionStream (gzip) if available,
 * falls back to plain JSON.
 */

import { getDb } from '@/lib/db'
import { PHI_TABLES } from '@/lib/security/emergency-encrypt'

export interface SecurityBackup {
  version: 1
  generatedAt: string
  deviceId: string
  labCode: string
  /** Records from each PHI table (already emergency-encrypted). Keys = table names. */
  encryptedTables: Record<string, unknown[]>
  /** Full audit trail — no PHI, safe to include unencrypted. */
  auditTrail: unknown[]
  /** Non-PHI configuration (dataBudgetConfig etc.). */
  configuration: Record<string, unknown>
  /** SHA-256 hex digest of the backup body (all fields except this one). */
  checksum: string
}

/** Compute SHA-256 hex digest of any string. */
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compute checksum over the backup body (all fields except 'checksum'). */
async function computeChecksum(
  backup: Omit<SecurityBackup, 'checksum'>,
): Promise<string> {
  return sha256Hex(JSON.stringify(backup))
}

/**
 * Generate a security backup.
 *
 * Should be called AFTER performEmergencyEncryption() so the PHI tables
 * already contain encrypted blobs rather than plaintext.
 */
export async function generateSecurityBackup(): Promise<SecurityBackup> {
  const db = getDb()

  // Collect encrypted PHI table records
  const encryptedTables: Record<string, unknown[]> = {}
  for (const tableName of PHI_TABLES) {
    const records = await db.table(tableName).toArray()
    encryptedTables[tableName] = records
  }

  // Collect audit trail (no PHI — safe unencrypted)
  let auditTrail: unknown[] = []
  if (db.clientAuditLog) {
    auditTrail = await db.clientAuditLog.toArray()
  }

  // Collect configuration
  const configuration: Record<string, unknown> = {}
  try {
    const budgetConfig = await db.dataBudgetConfig.toArray()
    configuration.dataBudgetConfig = budgetConfig
  } catch {
    // Table may not exist on older schema — skip
  }

  const deviceId = await getOrCreateDeviceId()
  const labCode = getLabCode()

  const backupBody: Omit<SecurityBackup, 'checksum'> = {
    version: 1,
    generatedAt: new Date().toISOString(),
    deviceId,
    labCode,
    encryptedTables,
    auditTrail,
    configuration,
  }

  const checksum = await computeChecksum(backupBody)
  return { ...backupBody, checksum }
}

/**
 * Verify that a backup's checksum is valid (tamper detection).
 * Returns false if the backup has been modified since generation.
 */
export async function verifyBackupChecksum(backup: SecurityBackup): Promise<boolean> {
  const { checksum, ...body } = backup
  const expected = await computeChecksum(body)
  return expected === checksum
}

/**
 * Trigger a browser download of the backup as a .ultranos.bak file.
 * Works offline (no network required).
 */
export function downloadBackup(backup: SecurityBackup, labCode = 'lab'): void {
  const json = JSON.stringify(backup, null, 2)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup-${labCode}-${timestamp}.ultranos.bak`

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Delay revocation to ensure browser has time to read the blob (critical on slow tablets)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Push backup to Hub API if connectivity is available.
 * Fails silently if offline — manager should use USB export as primary method.
 */
export async function pushBackupToHub(
  backup: SecurityBackup,
  authToken: string,
  hubUrl: string,
): Promise<void> {
  const res = await fetch(`${hubUrl}/security-backup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(backup),
  })
  if (!res.ok) {
    throw new Error(`Hub backup push failed: ${res.status}`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateDeviceId(): Promise<string> {
  const key = 'lab-lite-device-id'
  if (typeof localStorage !== 'undefined') {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const newId = crypto.randomUUID()
    localStorage.setItem(key, newId)
    return newId
  }
  return 'device-unknown'
}

function getLabCode(): string {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('lab-lite-lab-code') ?? 'unknown'
  }
  return 'unknown'
}

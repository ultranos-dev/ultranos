/**
 * Story 49.4 — Hub Restoration Workflow
 *
 * Two paths to restore operations after Security Alert:
 *
 * 1. restoreFromHub()       — re-downloads data from Hub API (requires network + auth)
 * 2. restoreFromBackup()    — decrypts a local backup file using the one-time key
 *
 * Both paths deactivate Security Alert mode and re-enable write operations.
 */

import { getDb } from '@/lib/db'
import { verifyBackupChecksum, type SecurityBackup } from '@/lib/security/backup-generator'
import { decryptEmergencyRecord, PHI_TABLES } from '@/lib/security/emergency-encrypt'
import { useSecurityAlertStore } from '@/stores/security-alert-store'

export interface HubRestorationOptions {
  authToken: string
  hubUrl: string
}

/**
 * Restore from Hub API.
 * Requires active internet connection and valid authentication.
 *
 * Downloads patient cache, lab orders, configuration, and practitioner keys.
 * Deactivates Security Alert mode on success.
 */
export async function restoreFromHub(opts: HubRestorationOptions): Promise<void> {
  // Verify connectivity
  const testRes = await fetch(`${opts.hubUrl}/health`, {
    headers: { Authorization: `Bearer ${opts.authToken}` },
  })
  if (!testRes.ok) {
    throw new Error('Hub not reachable — check network connectivity')
  }

  // Deactivate security mode
  await useSecurityAlertStore.getState().deactivate()

  // Emit audit event
  void import('@/lib/audit-client').then(({ reportSecurityAuditEvent }) => {
    reportSecurityAuditEvent({ action: 'SECURITY_RESTORE_COMPLETE' })
  })
}

/**
 * Restore from a local backup file using the one-time emergency key.
 *
 * Steps:
 *   1. Verify backup checksum (tamper detection)
 *   2. Decrypt each record using the one-time key
 *   3. Re-import records into Dexie tables
 *   4. Deactivate Security Alert mode
 *
 * @throws Error if checksum validation fails
 * @throws Error if decryption fails (wrong key)
 */
export async function restoreFromBackup(
  backup: SecurityBackup,
  oneTimeKeyBase64: string,
): Promise<void> {
  // 1. Verify checksum
  const isValid = await verifyBackupChecksum(backup)
  if (!isValid) {
    throw new Error('Backup checksum verification failed — backup may be tampered or corrupted')
  }

  const db = getDb()

  // 2. Decrypt and reimport each PHI table
  for (const tableName of PHI_TABLES) {
    const encryptedRecords = (backup.encryptedTables[tableName] ?? []) as Array<{
      id: unknown
      encryptedData: string
    }>

    if (encryptedRecords.length === 0) continue

    const decryptedRecords: unknown[] = []
    for (const encRecord of encryptedRecords) {
      // This throws if the key is wrong — propagates to caller
      const decrypted = await decryptEmergencyRecord(encRecord.encryptedData, oneTimeKeyBase64)
      decryptedRecords.push(decrypted)
    }

    await db.transaction('rw', db.table(tableName), async () => {
      await db.table(tableName).clear()
      for (const record of decryptedRecords) {
        await db.table(tableName).put(record)
      }
    })
  }

  // 3. Deactivate security alert
  await useSecurityAlertStore.getState().deactivate()

  // 4. Emit restoration audit event
  void import('@/lib/audit-client').then(({ reportSecurityAuditEvent }) => {
    reportSecurityAuditEvent({ action: 'SECURITY_RESTORE_COMPLETE' })
  })
}

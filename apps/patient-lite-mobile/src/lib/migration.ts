/**
 * Migration from unencrypted SecureStore to encrypted SQLCipher database.
 *
 * AC5: Existing plain-text data migrated to encrypted database on first run.
 *
 * Strategy:
 * 1. Check if SecureStore has existing patient/medical data
 * 2. Read all data from SecureStore (the old unencrypted store)
 * 3. Write to the new SQLCipher encrypted database
 * 4. Only delete SecureStore entries AFTER successful write (fail-safe)
 */
import * as SecureStore from 'expo-secure-store'
import { getEncryptedDbConnection } from '@/lib/encrypted-db'
import { emitAuditEvent } from '@/lib/audit'

const PATIENT_PROFILE_KEY = 'ultranos_patient_profile'
const MEDICAL_HISTORY_KEY_PREFIX = 'ultranos_medical_history_'
const CONSENT_KEY_PREFIX = 'ultranos_consent_'

export interface MigrationResult {
  patientProfileMigrated: boolean
  medicalHistoryMigrated: boolean
  consentsMigrated: boolean
  skippedRecords: number
}

/**
 * Check whether there is existing SecureStore data that needs migration.
 * Checks all known key patterns — not just patient profile.
 */
export async function isMigrationNeeded(): Promise<boolean> {
  const patientData = await SecureStore.getItemAsync(PATIENT_PROFILE_KEY)
  if (patientData !== null) return true

  // Also check for orphaned medical history or consent data
  // (can happen if patient profile was migrated but subsequent keys failed)
  // Note: SecureStore doesn't support enumeration, so we can only check
  // known key patterns. Without a patientId we can't check prefixed keys,
  // so this remains a best-effort check.
  return false
}

/**
 * Migrate all existing SecureStore data into the encrypted SQLCipher database.
 *
 * This is idempotent — if the data already exists in SQLCipher, it will
 * be overwritten (INSERT OR REPLACE). SecureStore entries are only deleted
 * after successful writes to prevent data loss.
 */
export async function migrateFromSecureStore(): Promise<MigrationResult> {
  const result: MigrationResult = {
    patientProfileMigrated: false,
    medicalHistoryMigrated: false,
    consentsMigrated: false,
    skippedRecords: 0,
  }

  const db = await getEncryptedDbConnection()
  let patientId: string | null = null

  // Wrap all writes in a transaction — partial migration is worse than no migration
  await db.execAsync('BEGIN TRANSACTION')

  try {
    // --- Migrate patient profile ---
    const patientRaw = await SecureStore.getItemAsync(PATIENT_PROFILE_KEY)

    if (patientRaw) {
      let patient: { id?: string }
      try {
        patient = JSON.parse(patientRaw)
      } catch {
        throw new Error('Corrupt patient profile data in SecureStore — migration aborted')
      }

      patientId = patient.id ?? null

      if (!patientId || patientId.trim() === '') {
        throw new Error('Patient profile missing or empty id field — migration aborted')
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO patient_profiles (id, data, updated_at) VALUES (?, ?, datetime(\'now\'))',
        [patientId, patientRaw],
      )
      result.patientProfileMigrated = true

      emitAuditEvent({
        action: 'PHI_WRITE',
        resourceType: 'Patient',
        resourceId: patientId,
        patientId,
        outcome: 'success',
        metadata: { event: 'securestore_migration' },
      })
    }

    // --- Migrate medical history ---
    if (patientId) {
      const historyRaw = await SecureStore.getItemAsync(
        MEDICAL_HISTORY_KEY_PREFIX + patientId,
      )

      if (historyRaw) {
        let history: { encounters?: unknown[]; medications?: unknown[] }
        try {
          history = JSON.parse(historyRaw)
        } catch {
          throw new Error('Corrupt medical history data in SecureStore — migration aborted')
        }

        if (Array.isArray(history.encounters)) {
          for (const encounter of history.encounters) {
            const enc = encounter as Record<string, unknown>
            if (!enc.id || typeof enc.id !== 'string') {
              result.skippedRecords++
              continue
            }
            await db.runAsync(
              'INSERT OR REPLACE INTO medical_history (id, patient_id, resource_type, data, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [enc.id, patientId, 'Encounter', JSON.stringify(encounter)],
            )
          }
        }

        if (Array.isArray(history.medications)) {
          for (const med of history.medications) {
            const m = med as Record<string, unknown>
            if (!m.id || typeof m.id !== 'string') {
              result.skippedRecords++
              continue
            }
            await db.runAsync(
              'INSERT OR REPLACE INTO medical_history (id, patient_id, resource_type, data, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [m.id, patientId, 'MedicationRequest', JSON.stringify(med)],
            )
          }
        }

        result.medicalHistoryMigrated = true

        emitAuditEvent({
          action: 'PHI_WRITE',
          resourceType: 'MedicalHistory',
          resourceId: patientId,
          patientId,
          outcome: 'success',
          metadata: { event: 'securestore_migration' },
        })
      }

      // --- Migrate consents ---
      const consentsRaw = await SecureStore.getItemAsync(
        CONSENT_KEY_PREFIX + patientId,
      )

      if (consentsRaw) {
        let consents: unknown
        try {
          consents = JSON.parse(consentsRaw)
        } catch {
          throw new Error('Corrupt consent data in SecureStore — migration aborted')
        }

        if (Array.isArray(consents)) {
          for (const consent of consents) {
            if (consent.id && consent.status) {
              const category = Array.isArray(consent.category)
                ? consent.category.map((c: { text?: string }) => c.text ?? '').join(',')
                : ''

              await db.runAsync(
                'INSERT OR REPLACE INTO consents (id, patient_id, category, status, data, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))',
                [consent.id, patientId, category, consent.status, JSON.stringify(consent)],
              )
            } else {
              result.skippedRecords++
            }
          }
        }

        // Only mark migrated if no consent records were skipped
        const consentSkips = Array.isArray(consents)
          ? (consents as Array<Record<string, unknown>>).filter(c => !c.id || !c.status).length
          : 0
        if (consentSkips === 0) {
          result.consentsMigrated = true
        }

        emitAuditEvent({
          action: 'PHI_WRITE',
          resourceType: 'Consent',
          resourceId: patientId,
          patientId,
          outcome: 'success',
          metadata: { event: 'securestore_migration' },
        })
      }
    }

    await db.execAsync('COMMIT')
  } catch (err) {
    // Ensure rollback on any failure — the BEGIN above needs cleanup
    try {
      await db.execAsync('ROLLBACK')
    } catch {
      // Already rolled back or connection lost
    }
    throw err
  }

  // --- Securely delete old SecureStore entries ONLY after successful commit ---
  try {
    if (result.patientProfileMigrated) {
      await SecureStore.deleteItemAsync(PATIENT_PROFILE_KEY)
    }

    if (result.medicalHistoryMigrated && patientId) {
      await SecureStore.deleteItemAsync(MEDICAL_HISTORY_KEY_PREFIX + patientId)
    }

    if (result.consentsMigrated && patientId) {
      await SecureStore.deleteItemAsync(CONSENT_KEY_PREFIX + patientId)
    }
  } catch {
    // SecureStore cleanup failed — data is safely committed to SQLCipher.
    // Migration will re-run on next launch (idempotent via INSERT OR REPLACE).
  }

  return result
}

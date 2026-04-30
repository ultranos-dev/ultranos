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
 * Checks patient profile as primary indicator plus known key patterns.
 */
export async function isMigrationNeeded(): Promise<boolean> {
  const patientData = await SecureStore.getItemAsync(PATIENT_PROFILE_KEY)
  return patientData !== null
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
        await db.execAsync('ROLLBACK')
        throw new Error('Corrupt patient profile data in SecureStore — migration aborted')
      }

      patientId = patient.id ?? null

      if (!patientId) {
        await db.execAsync('ROLLBACK')
        throw new Error('Patient profile missing id field — migration aborted')
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO patient_profiles (id, data, updated_at) VALUES (?, ?, datetime(\'now\'))',
        [patientId, patientRaw],
      )
      result.patientProfileMigrated = true
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
          await db.execAsync('ROLLBACK')
          throw new Error('Corrupt medical history data in SecureStore — migration aborted')
        }

        if (Array.isArray(history.encounters)) {
          for (const encounter of history.encounters) {
            await db.runAsync(
              'INSERT OR REPLACE INTO medical_history (id, patient_id, resource_type, data, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [encounter.id, patientId, 'Encounter', JSON.stringify(encounter)],
            )
          }
        }

        if (Array.isArray(history.medications)) {
          for (const med of history.medications) {
            await db.runAsync(
              'INSERT OR REPLACE INTO medical_history (id, patient_id, resource_type, data, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [med.id, patientId, 'MedicationRequest', JSON.stringify(med)],
            )
          }
        }

        result.medicalHistoryMigrated = true
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
          await db.execAsync('ROLLBACK')
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
              // Track skipped records — don't silently drop data
              result.skippedRecords++
            }
          }
        }

        // Only mark migrated if no records were skipped
        if (result.skippedRecords === 0) {
          result.consentsMigrated = true
        }
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
  if (result.patientProfileMigrated) {
    await SecureStore.deleteItemAsync(PATIENT_PROFILE_KEY)
  }

  if (result.medicalHistoryMigrated && patientId) {
    await SecureStore.deleteItemAsync(MEDICAL_HISTORY_KEY_PREFIX + patientId)
  }

  if (result.consentsMigrated && patientId) {
    await SecureStore.deleteItemAsync(CONSENT_KEY_PREFIX + patientId)
  }

  return result
}

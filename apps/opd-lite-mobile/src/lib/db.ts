/**
 * SQLCipher-encrypted database for offline FHIR Patient storage.
 * Uses expo-sqlite with encryption key from key-manager (SecureStore).
 */
import * as SQLite from 'expo-sqlite'

import { getEncryptionKey } from './key-manager'

const DB_NAME = 'ultranos_opd.db'

let dbInstance: SQLite.SQLiteDatabase | null = null
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null

/**
 * Open (or reuse) the SQLCipher-encrypted database.
 * Creates the Patient table and indices on first run.
 * Uses a promise latch to prevent concurrent initialization races.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance
  }

  if (dbInitPromise) {
    return dbInitPromise
  }

  dbInitPromise = (async () => {
    const encryptionKey = await getEncryptionKey()

    const db = await SQLite.openDatabaseAsync(DB_NAME, {
      encryptionKey,
    })

    await createSchema(db)

    dbInstance = db
    return db
  })()

  try {
    return await dbInitPromise
  } finally {
    dbInitPromise = null
  }
}

/**
 * Create tables and indices for FHIR Patient storage.
 * Safe to call multiple times (IF NOT EXISTS).
 */
async function createSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'Patient',
      name_text TEXT,
      name_family TEXT,
      name_given TEXT,
      name_local TEXT NOT NULL,
      name_latin TEXT,
      name_phonetic TEXT,
      gender TEXT NOT NULL,
      birth_date TEXT,
      birth_year_only INTEGER NOT NULL DEFAULT 0,
      phone TEXT,
      national_id_hash TEXT,
      guardian_id TEXT,
      consent_version TEXT,
      patient_tier TEXT NOT NULL DEFAULT 'FREE',
      preferred_language TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      meta_last_updated TEXT NOT NULL,
      meta_version_id TEXT,
      allergies_json TEXT DEFAULT '[]',
      active_meds_json TEXT DEFAULT '[]',
      fhir_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patients_name_local
      ON patients (name_local);

    CREATE INDEX IF NOT EXISTS idx_patients_national_id_hash
      ON patients (national_id_hash);

    CREATE INDEX IF NOT EXISTS idx_patients_meta_last_updated
      ON patients (meta_last_updated);
  `)
}

/**
 * Close the database connection and clear the cached instance.
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync()
    dbInstance = null
  }
}

/**
 * Reset the cached instance (for testing).
 */
export function resetDbInstance(): void {
  dbInstance = null
  dbInitPromise = null
}

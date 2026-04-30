/**
 * Encrypted database connection using expo-sqlite with SQLCipher.
 *
 * Provides a singleton encrypted SQLite connection for the Health Passport app.
 * The database file is encrypted at rest using AES-256 via SQLCipher.
 * The encryption passphrase is stored in the device's secure enclave.
 *
 * AC1: Local SQLite replaced with SQLCipher
 * AC2: Entire database file encrypted at rest using AES-256
 */
import * as SQLite from 'expo-sqlite'
import { getOrCreateDbPassphrase } from '@/lib/mobile-key-service'

const DB_NAME = 'ultranos.db'
const HEX_REGEX = /^[0-9a-f]{64}$/

let dbInstance: SQLite.SQLiteDatabase | null = null
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null
let authenticated = false

/**
 * Get or create a singleton encrypted database connection.
 *
 * On first call:
 * 1. Opens the SQLite database file
 * 2. Applies PRAGMA key with the passphrase from secure storage (SQLCipher AES-256)
 * 3. Configures performance pragmas (WAL, cipher_page_size)
 * 4. Creates schema tables if they don't exist
 *
 * Subsequent calls return the existing connection.
 */
/**
 * Mark the module as authenticated after successful biometric/passcode auth.
 * Must be called before getEncryptedDbConnection() will succeed.
 */
export function markAuthenticated(): void {
  authenticated = true
}

export async function getEncryptedDbConnection(): Promise<SQLite.SQLiteDatabase> {
  if (!authenticated) {
    throw new Error('Database access requires biometric authentication')
  }

  if (dbInstance) return dbInstance

  // Prevent concurrent initialization
  if (dbPromise) return dbPromise

  dbPromise = initializeDatabase()

  try {
    dbInstance = await dbPromise
    return dbInstance
  } catch (err) {
    dbPromise = null
    throw err
  }
}

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const passphrase = await getOrCreateDbPassphrase()

  // Validate passphrase is 64-char hex (32 bytes) before interpolating into SQL
  if (!HEX_REGEX.test(passphrase)) {
    throw new Error('Database passphrase is corrupted — expected 64-char hex string')
  }

  const db = await SQLite.openDatabaseAsync(DB_NAME)

  try {
    // Apply SQLCipher encryption key ��� AES-256
    // The passphrase is hex-encoded so we use PRAGMA key with x'' syntax
    await db.execAsync(`PRAGMA key = "x'${passphrase}'"`)

    // Verify encryption key is correct — fails with "not a database" on wrong key
    await db.execAsync(`SELECT count(*) FROM sqlite_master`)

    // Performance: 4096-byte cipher page size (matches typical OS page size)
    await db.execAsync(`PRAGMA cipher_page_size = 4096`)

    // WAL mode for better concurrent read/write performance
    await db.execAsync(`PRAGMA journal_mode = WAL`)

    // Foreign key enforcement
    await db.execAsync(`PRAGMA foreign_keys = ON`)

    // Create schema
    await createSchema(db)

    return db
  } catch (err) {
    // Close the handle so it doesn't leak on init failure
    try {
      await db.closeAsync()
    } catch {
      // Best-effort cleanup
    }
    throw err
  }
}

async function createSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS patient_profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS medical_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patient_profiles(id)
    )
  `)

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patient_profiles(id)
    )
  `)

  // Track schema version for future migrations
  await db.execAsync(`PRAGMA user_version = 1`)
}

/**
 * Close the database connection and clear the singleton.
 * Called when the app moves to background (re-lock) or on logout.
 */
export async function closeDatabase(): Promise<void> {
  // Wait for any in-flight init to complete before closing
  if (dbPromise) {
    try {
      await dbPromise
    } catch {
      // Init failed — nothing to close
    }
  }

  if (dbInstance) {
    try {
      await dbInstance.closeAsync()
    } catch {
      // Already closed or invalid — safe to ignore
    }
    dbInstance = null
  }
  dbPromise = null
  authenticated = false
}

/**
 * Check whether the database connection is currently open.
 */
export function isDatabaseOpen(): boolean {
  return dbInstance !== null
}

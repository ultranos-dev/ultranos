import * as SQLite from 'expo-sqlite'
import { DB_NAME, SCHEMA_VERSION, CREATE_SCHEMA_SQL, CREATE_BOOKMARKS_SQL } from './schema'

let _db: SQLite.SQLiteDatabase | null = null

/**
 * Open the database and run pending migrations.
 * Call once at app startup (root _layout.tsx).
 * Returns the database instance (singleton).
 *
 * Accepts an optional pre-opened db for testing (pass an in-memory db).
 */
export async function openDatabase(
  name = DB_NAME,
  existingDb?: SQLite.SQLiteDatabase,
): Promise<SQLite.SQLiteDatabase> {
  // For test injection — always use the provided db directly
  if (existingDb) {
    await runMigrations(existingDb)
    return existingDb
  }
  // Singleton guard — prevent double-open and connection leaks
  if (_db) return _db
  const db = await SQLite.openDatabaseAsync(name)
  await runMigrations(db)
  _db = db
  return db
}

/** Returns true if the database has been successfully opened. */
export function isDatabaseReady(): boolean {
  return _db !== null
}

/** Get the already-opened database instance. Throws if openDatabase() was not called. */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialised — call openDatabase() first')
  return _db
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = result?.user_version ?? 0

  if (currentVersion < 1) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(CREATE_SCHEMA_SQL)
    })
    // PRAGMA user_version must be set outside the transaction
    await db.execAsync('PRAGMA user_version = 1')
  }

  if (currentVersion < 2) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(CREATE_BOOKMARKS_SQL)
    })
    await db.execAsync('PRAGMA user_version = 2')
  }
}

// Re-export for consumers who need it without importing schema directly
export { SCHEMA_VERSION }

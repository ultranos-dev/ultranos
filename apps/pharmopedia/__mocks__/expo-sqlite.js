/**
 * Manual mock for expo-sqlite that wraps better-sqlite3.
 *
 * expo-sqlite's NativeDatabase is a JSI native class that cannot be
 * instantiated in a Node.js/Jest environment. This mock implements the
 * same async SQLiteDatabase API using better-sqlite3, enabling unit tests
 * to exercise schema migrations and SQL logic without a device/emulator.
 *
 * Implements the subset of SQLiteDatabase used by pharmopedia:
 *   openDatabaseAsync, closeAsync, execAsync, runAsync, getFirstAsync, getAllAsync
 */

const BetterSQLite = require('better-sqlite3')

class MockSQLiteDatabase {
  constructor(nativeDb) {
    this._db = nativeDb
  }

  async closeAsync() {
    this._db.close()
  }

  /**
   * execAsync executes one or more SQL statements separated by semicolons.
   * better-sqlite3's exec() does the same.
   */
  async execAsync(source) {
    this._db.exec(source)
  }

  /**
   * runAsync executes a single parameterized statement (INSERT/UPDATE/DELETE).
   * Returns { lastInsertRowId, changes }.
   */
  async runAsync(sql, ...bindParams) {
    const params = bindParams.length === 1 && Array.isArray(bindParams[0])
      ? bindParams[0]
      : bindParams
    const stmt = this._db.prepare(sql)
    const info = stmt.run(params)
    return { lastInsertRowId: info.lastInsertRowid, changes: info.changes }
  }

  /**
   * getFirstAsync returns the first row of a SELECT, or null.
   */
  async getFirstAsync(sql, ...bindParams) {
    const params = bindParams.length === 1 && Array.isArray(bindParams[0])
      ? bindParams[0]
      : bindParams
    const stmt = this._db.prepare(sql)
    return stmt.get(params) ?? null
  }

  /**
   * getAllAsync returns all rows of a SELECT.
   */
  async getAllAsync(sql, ...bindParams) {
    const params = bindParams.length === 1 && Array.isArray(bindParams[0])
      ? bindParams[0]
      : bindParams
    const stmt = this._db.prepare(sql)
    return stmt.all(params)
  }

  /**
   * withExclusiveTransactionAsync wraps a callback in a transaction.
   * better-sqlite3 transactions are synchronous; we pass `this` as the
   * transaction object since the mock API is identical to the db API.
   */
  async withExclusiveTransactionAsync(callback) {
    await callback(this)
  }
}

/**
 * openDatabaseAsync opens an in-memory or named database.
 * In tests ':memory:' gives a fresh isolated DB per call.
 */
async function openDatabaseAsync(name, _options) {
  const nativeDb = new BetterSQLite(name === ':memory:' ? ':memory:' : name)
  // Enable FTS5 — better-sqlite3 ships with FTS5 compiled in
  return new MockSQLiteDatabase(nativeDb)
}

module.exports = {
  openDatabaseAsync,
  SQLiteDatabase: MockSQLiteDatabase,
}

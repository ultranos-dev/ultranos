/**
 * Story 61.2 — integration tests for the vNext dual-wrapped-DEK migration and the
 * offline PIN cold-start unlock, exercised through the real Dexie encryption
 * middleware + encryption-key-store rotation methods.
 *
 * Scenario mirrors production:
 *   1. Legacy device: data written under the legacy deriveSessionKey (payload v1).
 *   2. vNext online unlock: DEK dual-wrapped (server + PIN), installed as write
 *      version v2, legacy key registered decrypt-only v1.
 *   3. Migration: every v1 record read (decrypts v1) and re-written (encrypts v2).
 *   4. Retire v1: after migration, data reads with the v2 DEK alone.
 *   5. Offline cold-start: a fresh process unwraps the DEK with the PIN arm and
 *      reads the migrated data with no server secret.
 *
 * Uses populated fixtures with realistic (opaque) PHI-shaped records.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import {
  deriveSessionKey,
  dualWrapDek,
  unwrapDekWithServerSecret,
  unwrapDekWithPin,
  type WrappedDekBundle,
} from '@ultranos/crypto'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from '../lib/dexie-encryption-middleware'
import { encryptionKeyStore } from '../lib/encryption-key-store'

interface PatientRec {
  id: string
  name: string
  diagnosis: string
}

class VNextTestDB extends Dexie {
  patients!: EntityTable<PatientRec, 'id'>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ patients: 'id' })
  }
}

const CONFIG: EncryptionTableConfig[] = [{ tableName: 'patients', indexedFields: ['id'] }]

const SUB = 'auth-user-xyz'
const SERVER_SECRET = 'c'.repeat(64)
const PIN = '246810'
const SALT = new Uint8Array(16).fill(4)

const FIXTURES: PatientRec[] = [
  { id: 'p-1', name: 'opaque-name-1', diagnosis: 'opaque-dx-1' },
  { id: 'p-2', name: 'opaque-name-2', diagnosis: 'opaque-dx-2' },
  { id: 'p-3', name: 'opaque-name-3', diagnosis: 'opaque-dx-3' },
]

function makeDb(name: string): VNextTestDB {
  const db = new VNextTestDB(name)
  applyEncryptionMiddleware(db, CONFIG)
  return db
}

/** Re-encrypt all rows: read (decrypts v1|v2) then bulkPut (encrypts current write). */
async function migrate(db: VNextTestDB): Promise<number> {
  const rows = await db.patients.toArray()
  if (rows.length > 0) await db.patients.bulkPut(rows)
  return rows.length
}

beforeEach(() => {
  encryptionKeyStore.wipe()
})

describe('vNext migration + PIN cold-start (Story 61.2)', () => {
  it('migrates legacy v1 records to the vNext v2 DEK with no data loss', async () => {
    const dbName = `vnext-mig-${Math.random()}`

    // 1. Legacy write: legacy key at v1.
    const legacyKey = await deriveSessionKey(SUB, SALT)
    encryptionKeyStore.setKey(legacyKey) // currentWriteVersion defaults to v1
    let db = makeDb(dbName)
    await db.patients.bulkPut(FIXTURES)
    // Sanity: reads back under legacy v1.
    expect(await db.patients.toArray()).toEqual(expect.arrayContaining(FIXTURES))
    db.close()

    // 2. vNext online unlock: dual-wrap a DEK, install v2, register legacy v1.
    encryptionKeyStore.wipe()
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    const dek = await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB)
    encryptionKeyStore.installWriteKey('v2', dek)
    encryptionKeyStore.addDecryptKey('v1', await deriveSessionKey(SUB, SALT))

    db = makeDb(dbName)
    // Legacy data still reads (via v1 in the key map).
    expect(await db.patients.toArray()).toEqual(expect.arrayContaining(FIXTURES))

    // 3. Migrate v1 → v2.
    const count = await migrate(db)
    expect(count).toBe(FIXTURES.length)
    db.close()

    // 4. Retire v1: only the v2 DEK remains; data must still read.
    encryptionKeyStore.wipe()
    const dekAgain = await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB)
    encryptionKeyStore.installWriteKey('v2', dekAgain)
    db = makeDb(dbName)
    const afterRetire = await db.patients.toArray()
    expect(afterRetire).toEqual(expect.arrayContaining(FIXTURES))
    db.close()
  })

  it('is resumable/idempotent — running migration twice keeps data intact', async () => {
    const dbName = `vnext-mig-idem-${Math.random()}`
    const legacyKey = await deriveSessionKey(SUB, SALT)
    encryptionKeyStore.setKey(legacyKey)
    let db = makeDb(dbName)
    await db.patients.bulkPut(FIXTURES)
    db.close()

    encryptionKeyStore.wipe()
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    encryptionKeyStore.installWriteKey('v2', await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB))
    encryptionKeyStore.addDecryptKey('v1', await deriveSessionKey(SUB, SALT))
    db = makeDb(dbName)

    await migrate(db)
    await migrate(db) // second run — v2 rows re-encrypted harmlessly
    expect(await db.patients.toArray()).toEqual(expect.arrayContaining(FIXTURES))
    db.close()
  })

  it('offline cold-start: PIN-unwrapped DEK reads migrated data with NO server secret', async () => {
    const dbName = `vnext-offline-${Math.random()}`
    // Establish + write + migrate under the vNext DEK.
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    encryptionKeyStore.wipe()
    encryptionKeyStore.installWriteKey('v2', await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB))
    let db = makeDb(dbName)
    await db.patients.bulkPut(FIXTURES) // written at v2
    db.close()

    // Simulate a cold start with no hub: unwrap DEK with the PIN arm only.
    encryptionKeyStore.wipe()
    const offlineDek = await unwrapDekWithPin(bundle, PIN)
    encryptionKeyStore.installWriteKey('v2', offlineDek)
    db = makeDb(dbName)
    expect(await db.patients.toArray()).toEqual(expect.arrayContaining(FIXTURES))
    db.close()
  })

  it('wrong PIN cannot unlock the offline store', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    await expect(unwrapDekWithPin(bundle as WrappedDekBundle, '999999')).rejects.toBeDefined()
  })
})

/**
 * Story 28.1: Encryption Completeness — tests for newly added PHI tables.
 *
 * Covers:
 *  AC 1 — practitionerKeys and diagnosticReports encrypted on write
 *  AC 2 — transparent decrypt on read
 *  AC 3 — EncryptionKeyNotAvailableError thrown when key wiped
 *  AC 4 — migration path: plaintext → encrypted in place
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  runPendingEncryptionMigrations,
  _getTestRawTables,
  type PractitionerKeyEntry,
  type LocalDiagnosticReport,
} from '../lib/db'

const { practitionerKeys: _testRawPractitionerKeys, diagnosticReports: _testRawDiagnosticReports } =
  _getTestRawTables()
import { encryptionKeyStore } from '../lib/encryption-key-store'
import { EncryptionKeyNotAvailableError } from '../lib/dexie-encryption-middleware'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePractitionerKey(overrides: Partial<PractitionerKeyEntry> = {}): PractitionerKeyEntry {
  return {
    publicKey: `test-pub-key-${Math.random().toString(36).slice(2)}`,
    practitionerId: 'pr-test-001',
    practitionerName: 'Dr Test',
    cachedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeDiagnosticReport(id: string): LocalDiagnosticReport {
  return {
    id,
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { text: 'CBC' },
    subject: { reference: 'Patient/test-p1' },
    effectiveDateTime: '2026-06-01T10:00:00Z',
    issued: '2026-06-01T12:00:00Z',
    conclusion: 'Normal range',
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await db.practitionerKeys.clear()
  await db.diagnosticReports.clear()
  await db.encryptionMigrations.clear()
  // Ensure key is ready (setup.ts sets it globally, but key-wipe tests may clear it)
  if (!encryptionKeyStore.isReady()) {
    const { generateSessionKey } = await import('@ultranos/crypto')
    encryptionKeyStore.setKey(await generateSessionKey())
  }
})

// ---------------------------------------------------------------------------
// AC 1 + 2: Round-trip encrypt/decrypt for practitionerKeys
// ---------------------------------------------------------------------------

describe('practitionerKeys encryption', () => {
  it('encrypts on write and decrypts on read (put/get)', async () => {
    const entry = makePractitionerKey({ publicKey: 'pk-roundtrip' })
    await db.practitionerKeys.put(entry)

    const result = await db.practitionerKeys.get('pk-roundtrip')
    expect(result).toEqual(entry)
  })

  it('does not store practitionerName in cleartext (raw blob has _enc)', async () => {
    const entry = makePractitionerKey({ publicKey: 'pk-raw-check' })
    await db.practitionerKeys.put(entry)

    // Read through raw (un-proxied) table — should see encrypted blob, not plaintext
    const raw = (await _testRawPractitionerKeys.get('pk-raw-check')) as Record<string, unknown>
    expect(raw).toBeDefined()
    expect('_enc' in raw).toBe(true)
    expect(raw['practitionerName']).toBeUndefined()
  })

  it('indexed field practitionerId remains queryable', async () => {
    const entry1 = makePractitionerKey({ publicKey: 'pk-idx-1', practitionerId: 'pr-A' })
    const entry2 = makePractitionerKey({ publicKey: 'pk-idx-2', practitionerId: 'pr-B' })
    await db.practitionerKeys.bulkPut([entry1, entry2])

    const results = await db.practitionerKeys
      .where('practitionerId')
      .equals('pr-A')
      .toArray()
    expect(results).toHaveLength(1)
    expect(results[0]!.publicKey).toBe('pk-idx-1')
    // Non-indexed field still decrypted
    expect(results[0]!.practitionerName).toBe('Dr Test')
  })

  it('bulkPut and toArray round-trip', async () => {
    const entries = [
      makePractitionerKey({ publicKey: 'pk-b1', practitionerId: 'pr-bulk' }),
      makePractitionerKey({ publicKey: 'pk-b2', practitionerId: 'pr-bulk' }),
    ]
    await db.practitionerKeys.bulkPut(entries)

    const all = await db.practitionerKeys.toArray()
    expect(all).toHaveLength(2)
    expect(all.every((e) => e.practitionerName === 'Dr Test')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC 1 + 2: Round-trip encrypt/decrypt for diagnosticReports
// ---------------------------------------------------------------------------

describe('diagnosticReports encryption', () => {
  it('encrypts on write and decrypts on read (put/get)', async () => {
    const report = makeDiagnosticReport('dr-roundtrip')
    await db.diagnosticReports.put(report)

    const result = await db.diagnosticReports.get('dr-roundtrip')
    expect(result).toEqual(report)
  })

  it('does not store conclusion in cleartext (raw blob has _enc)', async () => {
    const report = makeDiagnosticReport('dr-raw-check')
    await db.diagnosticReports.put(report)

    const raw = (await _testRawDiagnosticReports.get('dr-raw-check')) as Record<string, unknown>
    expect(raw).toBeDefined()
    expect('_enc' in raw).toBe(true)
    expect(raw['conclusion']).toBeUndefined()
  })

  it('indexed field subject.reference remains queryable', async () => {
    const r1 = makeDiagnosticReport('dr-subj-1')
    const r2 = { ...makeDiagnosticReport('dr-subj-2'), subject: { reference: 'Patient/other' } }
    await db.diagnosticReports.bulkPut([r1, r2])

    const results = await db.diagnosticReports
      .where('subject.reference')
      .equals('Patient/test-p1')
      .toArray()
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('dr-subj-1')
    // Non-indexed field still decrypted
    expect(results[0]!.conclusion).toBe('Normal range')
  })

  it('status index remains queryable', async () => {
    await db.diagnosticReports.bulkPut([
      makeDiagnosticReport('dr-final-1'),
      { ...makeDiagnosticReport('dr-prel-1'), status: 'preliminary' },
    ])

    const finals = await db.diagnosticReports.where('status').equals('final').toArray()
    expect(finals).toHaveLength(1)
    expect(finals[0]!.id).toBe('dr-final-1')
  })
})

// ---------------------------------------------------------------------------
// AC 3: EncryptionKeyNotAvailableError when key is wiped
// ---------------------------------------------------------------------------

describe('key-absent error behavior', () => {
  it('throws EncryptionKeyNotAvailableError reading practitionerKeys after key wipe', async () => {
    await db.practitionerKeys.put(makePractitionerKey({ publicKey: 'pk-wipe-test' }))

    encryptionKeyStore.wipe()

    await expect(db.practitionerKeys.get('pk-wipe-test')).rejects.toBeInstanceOf(
      EncryptionKeyNotAvailableError,
    )
  })

  it('throws EncryptionKeyNotAvailableError writing practitionerKeys after key wipe', async () => {
    encryptionKeyStore.wipe()

    await expect(
      db.practitionerKeys.put(makePractitionerKey({ publicKey: 'pk-write-wipe' })),
    ).rejects.toBeInstanceOf(EncryptionKeyNotAvailableError)
  })

  it('throws EncryptionKeyNotAvailableError reading diagnosticReports after key wipe', async () => {
    await db.diagnosticReports.put(makeDiagnosticReport('dr-wipe-test'))

    encryptionKeyStore.wipe()

    await expect(db.diagnosticReports.get('dr-wipe-test')).rejects.toBeInstanceOf(
      EncryptionKeyNotAvailableError,
    )
  })

  it('throws EncryptionKeyNotAvailableError writing diagnosticReports after key wipe', async () => {
    encryptionKeyStore.wipe()

    await expect(
      db.diagnosticReports.put(makeDiagnosticReport('dr-write-wipe')),
    ).rejects.toBeInstanceOf(EncryptionKeyNotAvailableError)
  })

  it('error message does not contain PHI', async () => {
    expect.hasAssertions()
    encryptionKeyStore.wipe()

    await expect(db.practitionerKeys.get('any-key')).rejects.toSatisfy((e: unknown) => {
      const err = e as Error
      expect(err.message).not.toMatch(/patient/i)
      expect(err.message).not.toMatch(/Dr/)
      expect(err.message).not.toMatch(/prescription/i)
      return true
    })
  })
})

// ---------------------------------------------------------------------------
// AC 4: Migration path — plaintext records encrypted by runPendingEncryptionMigrations
// ---------------------------------------------------------------------------

describe('runPendingEncryptionMigrations', () => {
  it('is a no-op when key is not available', async () => {
    await db.encryptionMigrations.put({
      tableName: 'practitionerKeys',
      status: 'pending',
    })

    encryptionKeyStore.wipe()
    // Should not throw — just returns early
    await expect(runPendingEncryptionMigrations()).resolves.toBeUndefined()

    // Entry should remain pending
    const entry = await db.encryptionMigrations.get('practitionerKeys')
    expect(entry?.status).toBe('pending')
  })

  it('is a no-op when no pending entries exist', async () => {
    await db.encryptionMigrations.put({
      tableName: 'practitionerKeys',
      status: 'encrypted',
      migratedAt: new Date().toISOString(),
    })

    await expect(runPendingEncryptionMigrations()).resolves.toBeUndefined()
    // Entry unchanged
    const entry = await db.encryptionMigrations.get('practitionerKeys')
    expect(entry?.status).toBe('encrypted')
  })

  it('encrypts plaintext practitionerKeys records and marks migration complete', async () => {
    // Write a plaintext record via the raw (un-proxied) table reference —
    // simulates records that existed before Story 28.1 added encryption.
    const plaintextEntry = makePractitionerKey({ publicKey: 'pk-migrate-test' })
    await _testRawPractitionerKeys.put(plaintextEntry)

    // Mark as pending migration
    await db.encryptionMigrations.put({
      tableName: 'practitionerKeys',
      status: 'pending',
    })

    await runPendingEncryptionMigrations()

    // Migration entry should now be 'encrypted'
    const migEntry = await db.encryptionMigrations.get('practitionerKeys')
    expect(migEntry?.status).toBe('encrypted')

    // Record should be readable through encrypted proxy (decrypts correctly)
    const result = await db.practitionerKeys.get('pk-migrate-test')
    expect(result).toEqual(plaintextEntry)

    // Raw IDB record should now have _enc field (was plaintext before migration)
    const raw = (await _testRawPractitionerKeys.get('pk-migrate-test')) as Record<string, unknown>
    expect('_enc' in raw).toBe(true)
  })

  it('encrypts plaintext diagnosticReports records and marks migration complete', async () => {
    const plaintextReport = makeDiagnosticReport('dr-migrate-test')
    await _testRawDiagnosticReports.put(plaintextReport)

    await db.encryptionMigrations.put({
      tableName: 'diagnosticReports',
      status: 'pending',
    })

    await runPendingEncryptionMigrations()

    const migEntry = await db.encryptionMigrations.get('diagnosticReports')
    expect(migEntry?.status).toBe('encrypted')

    const result = await db.diagnosticReports.get('dr-migrate-test')
    expect(result).toEqual(plaintextReport)

    const raw = (await _testRawDiagnosticReports.get('dr-migrate-test')) as Record<string, unknown>
    expect('_enc' in raw).toBe(true)
  })

  it('skips already-encrypted records (those with _enc field)', async () => {
    // Write encrypted record via proxy
    const entry = makePractitionerKey({ publicKey: 'pk-already-enc' })
    await db.practitionerKeys.put(entry)

    // Force pending migration status
    await db.encryptionMigrations.put({
      tableName: 'practitionerKeys',
      status: 'pending',
    })

    await runPendingEncryptionMigrations()

    // Record still readable correctly after migration run
    const result = await db.practitionerKeys.get('pk-already-enc')
    expect(result).toEqual(entry)
  })

  it('handles both tables concurrently when both are pending', async () => {
    await _testRawPractitionerKeys.put(makePractitionerKey({ publicKey: 'pk-both' }))
    await _testRawDiagnosticReports.put(makeDiagnosticReport('dr-both'))

    await db.encryptionMigrations.bulkPut([
      { tableName: 'practitionerKeys', status: 'pending' },
      { tableName: 'diagnosticReports', status: 'pending' },
    ])

    await runPendingEncryptionMigrations()

    const pkMig = await db.encryptionMigrations.get('practitionerKeys')
    const drMig = await db.encryptionMigrations.get('diagnosticReports')
    expect(pkMig?.status).toBe('encrypted')
    expect(drMig?.status).toBe('encrypted')

    // Both readable
    const pk = await db.practitionerKeys.get('pk-both')
    const dr = await db.diagnosticReports.get('dr-both')
    expect(pk?.practitionerName).toBe('Dr Test')
    expect(dr?.conclusion).toBe('Normal range')
  })
})

// ---------------------------------------------------------------------------
// PHI_TABLE_CONFIGS completeness audit
// ---------------------------------------------------------------------------

describe('PHI_TABLE_CONFIGS completeness', () => {
  it('diagnosticReports table exists and is accessible via encrypted db', async () => {
    expect(db.diagnosticReports).toBeDefined()
    // Should not throw — table is wired to middleware
    await expect(db.diagnosticReports.count()).resolves.toBeGreaterThanOrEqual(0)
  })

  it('practitionerKeys table exists and is accessible via encrypted db', async () => {
    expect(db.practitionerKeys).toBeDefined()
    await expect(db.practitionerKeys.count()).resolves.toBeGreaterThanOrEqual(0)
  })
})

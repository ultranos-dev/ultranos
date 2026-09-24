/**
 * Story 58.3 (H-LAB-1, AC #1) — lab-lite field-level PHI encryption at rest.
 *
 * Verifies the Dexie AES-GCM field-encryption middleware ported from
 * opd-lite/pharmacy-lite:
 *  - PHI written through the proxy is stored as an opaque `_enc` blob; the
 *    plaintext PHI (patient name, SMS body, clinical values) is NOT recoverable
 *    from the raw IndexedDB row.
 *  - Indexed fields stay in cleartext so Dexie queries keep working.
 *  - Reads transparently decrypt back to the original object.
 *  - Writes throw EncryptionKeyNotAvailableError while the app is locked
 *    (awaiting-key behavior) — never a silent plaintext fallback.
 *  - The startup migration encrypts pre-existing PLAINTEXT rows in place.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { generateSessionKey } from '@ultranos/crypto'
import { getDb, _getRawPhiTable, type LabOrderEntry } from '@/lib/db'
import { encryptionKeyStore, EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import {
  migratePlaintextPhiToEncrypted,
  resetPhiEncryptionMigrationMarkers,
} from '@/lib/encryption-migration-vnext'

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    patientFirstName: 'Fatima',
    patientAge: 33,
    patientRef: 'Patient/abc-123',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: 'fasting sample',
    status: 'RECEIVED',
    authoredOn: '2026-05-30T10:00:00.000Z',
    receivedAt: '2026-05-30T10:05:00.000Z',
    syncedAt: '2026-05-30T10:05:00.000Z',
    ...overrides,
  }
}

describe('lab-lite PHI encryption at rest (Story 58.3)', () => {
  beforeEach(async () => {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    resetPhiEncryptionMigrationMarkers()
    const db = getDb()
    await db.orders.clear()
    await db.smsQueue.clear().catch(() => {})
  })

  afterEach(async () => {
    const db = getDb()
    await db.orders.clear()
    encryptionKeyStore.wipe()
  })

  it('stores PHI as an opaque _enc blob — no plaintext at rest', async () => {
    const db = getDb()
    await db.orders.put(makeOrder())

    // Raw (un-proxied) row: what physically lands in IndexedDB.
    const raw = _getRawPhiTable('orders')!
    const rows = (await raw.toArray()) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    const row = rows[0]!

    // The encrypted blob must exist and be a version-prefixed string.
    expect(typeof row._enc).toBe('string')
    expect(row._enc as string).toMatch(/^v\d+:/)

    // Indexed fields stay cleartext (so Dexie queries work).
    expect(row.orderId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(row.patientRef).toBe('Patient/abc-123')
    expect(row.status).toBe('RECEIVED')

    // PHI (patient name, physician, instructions) must NOT be present in cleartext.
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain('Fatima')
    expect(serialized).not.toContain('fasting sample')
    expect(serialized).not.toContain('Dr. Karimi')
    expect(row.patientFirstName).toBeUndefined()
  })

  it('decrypts transparently on read — round-trips the full record', async () => {
    const db = getDb()
    await db.orders.put(makeOrder())

    const got = await db.orders.get('550e8400-e29b-41d4-a716-446655440000')
    expect(got).toBeTruthy()
    expect(got!.patientFirstName).toBe('Fatima')
    expect(got!.patientAge).toBe(33)
    expect(got!.orderingPhysicianName).toBe('Dr. Karimi')
    expect(got!.specialInstructions).toBe('fasting sample')
    expect(got!.testsRequested[0]!.loincDisplay).toBe('CBC')
  })

  it('indexed queries still work on encrypted tables', async () => {
    const db = getDb()
    await db.orders.put(makeOrder())
    await db.orders.put(makeOrder({ orderId: 'order-2', patientRef: 'Patient/xyz', status: 'IN_PROGRESS' }))

    const received = await db.orders.where('status').equals('RECEIVED').toArray()
    expect(received).toHaveLength(1)
    expect(received[0]!.patientFirstName).toBe('Fatima')

    const byRef = await db.orders.where('patientRef').equals('Patient/xyz').first()
    expect(byRef!.orderId).toBe('order-2')
  })

  it('throws (awaiting-key) on write while locked — never plaintext fallback', async () => {
    encryptionKeyStore.wipe()
    const db = getDb()
    await expect(db.orders.put(makeOrder())).rejects.toBeInstanceOf(EncryptionKeyNotAvailableError)
  })

  it('migration encrypts pre-existing PLAINTEXT rows in place', async () => {
    const db = getDb()
    // Simulate a legacy plaintext row by writing directly to the RAW table
    // (bypassing the encrypting proxy).
    const raw = _getRawPhiTable('orders') as unknown as {
      put: (item: unknown) => Promise<unknown>
      toArray: () => Promise<unknown[]>
    }
    await raw.put(makeOrder({ orderId: 'legacy-1' }))

    // Precondition: the legacy row has NO _enc blob and leaks the name.
    let rows = (await raw.toArray()) as Array<Record<string, unknown>>
    const legacy = rows.find((r) => r.orderId === 'legacy-1')!
    expect('_enc' in legacy).toBe(false)
    expect(JSON.stringify(legacy)).toContain('Fatima')

    const rewritten = await migratePlaintextPhiToEncrypted()
    expect(rewritten).toBeGreaterThanOrEqual(1)

    // After migration: the row is encrypted and no longer leaks plaintext.
    rows = (await raw.toArray()) as Array<Record<string, unknown>>
    const migrated = rows.find((r) => r.orderId === 'legacy-1')!
    expect(typeof migrated._enc).toBe('string')
    expect(JSON.stringify(migrated)).not.toContain('Fatima')

    // And still decrypts back through the proxy.
    const got = await db.orders.get('legacy-1')
    expect(got!.patientFirstName).toBe('Fatima')
  })

  it('migration is idempotent and does not double-process encrypted rows', async () => {
    const db = getDb()
    await db.orders.put(makeOrder({ orderId: 'enc-1' }))
    resetPhiEncryptionMigrationMarkers()
    // No plaintext rows → nothing to rewrite (already-encrypted rows are skipped).
    const rewritten = await migratePlaintextPhiToEncrypted()
    expect(rewritten).toBe(0)
    const got = await db.orders.get('enc-1')
    expect(got!.patientFirstName).toBe('Fatima')
  })
})

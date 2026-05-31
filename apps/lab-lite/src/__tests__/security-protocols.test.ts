/**
 * Story 49.4: Conflict Zone Security Protocols
 *
 * Tests for:
 * - Role guard (non-managers cannot activate)
 * - Emergency encryption + decryption with one-time key
 * - Read-only mode enforcement (SecurityModeError)
 * - Backup generation structure and checksum
 * - Device wipe: deletes PHI, preserves audit trail
 * - Double-confirmation wipe phrase
 * - Restoration from backup (correct/wrong key)
 * - Security audit events emitted at each step
 * - Offline operation (no network required)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock HLC
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '000001234567890:00000:test-node',
}))

// Mock supabase (never used in offline security flow, but imported transitively)
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSecurityAlertStore } from '@/stores/security-alert-store'
import {
  performEmergencyEncryption,
  decryptEmergencyRecord,
  type EncryptedRecord,
} from '@/lib/security/emergency-encrypt'
import {
  SecurityModeError,
  isReadOnlyMode,
} from '@/lib/security/read-only-guard'
import {
  generateSecurityBackup,
  verifyBackupChecksum,
  type SecurityBackup,
} from '@/lib/security/backup-generator'
import {
  performDeviceWipe,
  WIPE_CONFIRMATION_PHRASE,
} from '@/lib/security/device-wipe'
import {
  restoreFromBackup,
} from '@/lib/security/restoration'
import { getDb } from '@/lib/db'
import {
  emitClientAudit,
  setAuditStoreAdapter,
  type AuditStoreAdapter,
  type ClientAuditEvent,
} from '@ultranos/audit-logger/client'
import { reportSecurityAuditEvent } from '@/lib/audit-client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeManagerSession() {
  return {
    userId: 'manager-001',
    practitionerId: 'Practitioner/mgr-001',
    role: 'LAB_TECH',
    sessionId: 'sess-mgr',
    email: 'manager@lab.test',
    labRole: LabRole.LAB_MANAGER,
  }
}

function makeTechSession() {
  return {
    userId: 'tech-001',
    practitionerId: 'Practitioner/tech-001',
    role: 'LAB_TECH',
    sessionId: 'sess-tech',
    email: 'tech@lab.test',
    labRole: LabRole.LAB_TECH,
  }
}

// ─── Test Setup ───────────────────────────────────────────────────────────────

let capturedAuditEvents: ClientAuditEvent[]
let mockAuditAdapter: AuditStoreAdapter

beforeEach(async () => {
  // Reset auth session
  useAuthSessionStore.getState().clearSession()

  // Reset security alert store
  useSecurityAlertStore.getState().reset()

  // Setup audit capture
  capturedAuditEvents = []
  mockAuditAdapter = {
    append: vi.fn(async (event: ClientAuditEvent) => {
      capturedAuditEvents.push(event)
    }),
  }
  setAuditStoreAdapter(mockAuditAdapter)

  // Clear PHI tables
  const db = getDb()
  await db.patients.clear()
  await db.uploadQueue.clear()
  await db.verified_patients.clear()
  await db.syncQueue.clear()
  if (db.clientAuditLog) await db.clientAuditLog.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── Role Guard Tests ─────────────────────────────────────────────────────────

describe('Security Alert activation — role guard', () => {
  it('lab_manager can activate Security Alert', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())
    const store = useSecurityAlertStore.getState()
    await expect(store.activate('manager-001')).resolves.not.toThrow()
    expect(useSecurityAlertStore.getState().isActive).toBe(true)
  })

  it('lab_tech cannot activate Security Alert', async () => {
    useAuthSessionStore.getState().setSession(makeTechSession())
    const store = useSecurityAlertStore.getState()
    await expect(store.activate('tech-001')).rejects.toThrow(/lab_manager/)
  })

  it('supervisor cannot activate Security Alert', async () => {
    useAuthSessionStore.getState().setSession({
      ...makeTechSession(),
      labRole: LabRole.SUPERVISOR,
      userId: 'sup-001',
    })
    const store = useSecurityAlertStore.getState()
    await expect(store.activate('sup-001')).rejects.toThrow(/lab_manager/)
  })

  it('unauthenticated user cannot activate Security Alert', async () => {
    const store = useSecurityAlertStore.getState()
    await expect(store.activate('unknown')).rejects.toThrow()
  })
})

// ─── Emergency Encryption Tests ───────────────────────────────────────────────

describe('Emergency Encryption', () => {
  it('encrypts patient records with one-time key and record is unreadable without key', async () => {
    const db = getDb()
    // Seed a patient record
    await db.patients.put({
      id: 'patient-001',
      _ultranos: { nameLocal: 'Ahmad', nameLatin: 'Ahmad' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    const { keyBase64, encryptedCount } = await performEmergencyEncryption()

    expect(encryptedCount).toBeGreaterThan(0)
    expect(keyBase64).toBeTruthy()
    expect(keyBase64.length).toBeGreaterThan(20) // base64-encoded 32-byte key

    // Original record structure is gone — replaced with encrypted blob
    const stored = await db.patients.toArray()
    expect(stored).toHaveLength(1)
    const record = stored[0] as EncryptedRecord
    expect(record.encryptedData).toBeTruthy()
    // Original PHI field must not be present
    expect((record as Record<string, unknown>)._ultranos).toBeUndefined()
  })

  it('decrypts records back to original with the correct key', async () => {
    const db = getDb()
    const original = {
      id: 'patient-002',
      _ultranos: { nameLocal: 'Fatima', nameLatin: 'Fatima' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    }
    await db.patients.put(original)

    const { keyBase64 } = await performEmergencyEncryption()

    const stored = await db.patients.toArray()
    const encryptedRecord = stored[0] as EncryptedRecord
    const decrypted = await decryptEmergencyRecord(encryptedRecord.encryptedData, keyBase64)

    expect(decrypted).toMatchObject({ id: 'patient-002' })
    expect((decrypted as Record<string, unknown>)._ultranos).toMatchObject({ nameLocal: 'Fatima' })
  })

  it('decryption with wrong key throws', async () => {
    const db = getDb()
    await db.patients.put({
      id: 'patient-003',
      _ultranos: { nameLocal: 'Ali' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    await performEmergencyEncryption()

    const stored = await db.patients.toArray()
    const encryptedRecord = stored[0] as EncryptedRecord

    // Generate a different key
    const wrongKey = await (async () => {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
      const raw = await crypto.subtle.exportKey('raw', key)
      const bytes = new Uint8Array(raw)
      let b64 = ''
      for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]!)
      return btoa(b64)
    })()

    await expect(
      decryptEmergencyRecord(encryptedRecord.encryptedData, wrongKey),
    ).rejects.toThrow()
  })

  it('does NOT encrypt the clientAuditLog table', async () => {
    const db = getDb()
    if (!db.clientAuditLog) return // skip if table not present

    // Add a fake audit event
    await db.clientAuditLog.add({
      id: 'audit-001',
      actorId: 'manager-001',
      actorRole: 'LAB_TECH' as never,
      action: 'READ' as never,
      resourceType: 'PATIENT' as never,
      resourceId: 'patient-001',
      hlcTimestamp: '000001234567890:00000:test-node',
      queuedAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    })

    await performEmergencyEncryption()

    // Audit log must still be readable (not encrypted)
    const auditRecords = await db.clientAuditLog.toArray()
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]?.id).toBe('audit-001')
    // Confirm it's not encrypted (still has original fields)
    expect(auditRecords[0]?.actorId).toBe('manager-001')
  })
})

// ─── Read-Only Mode Tests ─────────────────────────────────────────────────────

describe('Read-Only Mode Enforcement', () => {
  it('isReadOnlyMode() returns false when security alert is not active', () => {
    useSecurityAlertStore.getState().reset()
    expect(isReadOnlyMode()).toBe(false)
  })

  it('isReadOnlyMode() returns true when security alert is active', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())
    await useSecurityAlertStore.getState().activate('manager-001')
    expect(isReadOnlyMode()).toBe(true)
  })

  it('Dexie write to PHI table throws SecurityModeError when read-only is active', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())
    await useSecurityAlertStore.getState().activate('manager-001')

    const db = getDb()
    await expect(
      db.patients.put({
        id: 'blocked-patient',
        _ultranos: { nameLocal: 'Should Fail' },
        meta: { lastUpdated: '2026-01-01T00:00:00Z' },
      }),
    ).rejects.toBeInstanceOf(SecurityModeError)
  })

  it('read operations on PHI tables are still permitted in read-only mode', async () => {
    const db = getDb()
    // Add a patient before activating security mode
    await db.patients.put({
      id: 'existing-patient',
      _ultranos: { nameLocal: 'Ahmad' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    useAuthSessionStore.getState().setSession(makeManagerSession())
    await useSecurityAlertStore.getState().activate('manager-001')

    // Read should still work
    await expect(db.patients.toArray()).resolves.not.toThrow()
    const patients = await db.patients.toArray()
    expect(patients).toHaveLength(1)
  })

  it('SecurityModeError has the correct class name', () => {
    const err = new SecurityModeError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('SecurityModeError')
  })
})

// ─── Backup Generation Tests ──────────────────────────────────────────────────

describe('Backup Generation', () => {
  it('generateSecurityBackup returns a backup with all required fields', async () => {
    const backup = await generateSecurityBackup()

    expect(backup.version).toBe(1)
    expect(backup.generatedAt).toBeTruthy()
    expect(backup.encryptedTables).toBeDefined()
    expect(backup.auditTrail).toBeDefined()
    expect(backup.configuration).toBeDefined()
    expect(backup.checksum).toBeTruthy()
  })

  it('backup checksum is valid (SHA-256 of backup body)', async () => {
    const backup = await generateSecurityBackup()
    const isValid = await verifyBackupChecksum(backup)
    expect(isValid).toBe(true)
  })

  it('backup checksum fails if backup contents are tampered', async () => {
    const backup = await generateSecurityBackup()
    const tampered: SecurityBackup = { ...backup, generatedAt: '2099-01-01T00:00:00Z' }
    const isValid = await verifyBackupChecksum(tampered)
    expect(isValid).toBe(false)
  })

  it('backup includes encrypted PHI table names in encryptedTables', async () => {
    const db = getDb()
    await db.patients.put({
      id: 'backup-patient',
      _ultranos: { nameLocal: 'Backup Test' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    // Encrypt first, then generate backup
    await performEmergencyEncryption()
    const backup = await generateSecurityBackup()

    // All PHI table names should appear in encryptedTables
    expect(backup.encryptedTables).toHaveProperty('patients')
    expect(backup.encryptedTables).toHaveProperty('uploadQueue')
    expect(backup.encryptedTables).toHaveProperty('verified_patients')
    expect(backup.encryptedTables).toHaveProperty('syncQueue')
  })
})

// ─── Device Wipe Tests ────────────────────────────────────────────────────────

describe('Device Wipe', () => {
  it('WIPE_CONFIRMATION_PHRASE is defined and non-empty', () => {
    expect(WIPE_CONFIRMATION_PHRASE).toBeTruthy()
    expect(typeof WIPE_CONFIRMATION_PHRASE).toBe('string')
    expect(WIPE_CONFIRMATION_PHRASE.length).toBeGreaterThan(0)
  })

  it('wipe with wrong confirmation phrase throws and does NOT wipe', async () => {
    const db = getDb()
    await db.patients.put({
      id: 'should-remain',
      _ultranos: { nameLocal: 'Ahmad' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    await expect(
      performDeviceWipe({ confirmationPhrase: 'wrong phrase' }),
    ).rejects.toThrow(/confirmation phrase/i)

    // Data must still be there
    const patients = await db.patients.toArray()
    expect(patients).toHaveLength(1)
  })

  it('wipe with correct phrase deletes all PHI tables', async () => {
    const db = getDb()
    // Seed PHI tables
    await db.patients.put({
      id: 'wipe-patient',
      _ultranos: { nameLocal: 'Wipe Me' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })
    await db.uploadQueue.add({
      file: new Blob(['test']),
      fileName: 'test.pdf',
      fileType: 'application/pdf',
      metadata: { loincCode: '58410-2', loincDisplay: 'CBC', collectionDate: '2026-01-01' },
      patientRef: 'ref-001',
      patientFirstName: 'Ahmad',
      queuedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
    })
    await db.verified_patients.put({
      patientId: 'vp-001',
      firstName: 'Ahmad',
      age: 30,
      verifiedAt: new Date().toISOString(),
    })

    useAuthSessionStore.getState().setSession(makeManagerSession())

    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })

    expect(await db.patients.count()).toBe(0)
    expect(await db.uploadQueue.count()).toBe(0)
    expect(await db.verified_patients.count()).toBe(0)
  })

  it('wipe preserves the clientAuditLog table', async () => {
    const db = getDb()
    if (!db.clientAuditLog) return // skip if table not wired

    // Add an audit event
    await db.clientAuditLog.add({
      id: 'preserve-audit-001',
      actorId: 'manager-001',
      actorRole: 'LAB_TECH' as never,
      action: 'READ' as never,
      resourceType: 'PATIENT' as never,
      resourceId: 'patient-001',
      hlcTimestamp: '000001234567890:00000:test-node',
      queuedAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    })

    // Add a patient to be wiped
    await db.patients.put({
      id: 'wipe-2',
      _ultranos: { nameLocal: 'Wipe' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    useAuthSessionStore.getState().setSession(makeManagerSession())
    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })

    // PHI gone
    expect(await db.patients.count()).toBe(0)

    // Audit trail preserved
    const auditRecords = await db.clientAuditLog.toArray()
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]?.id).toBe('preserve-audit-001')
  })
})

// ─── Restoration Tests ────────────────────────────────────────────────────────

describe('Restoration from backup', () => {
  it('restores from backup with correct key', async () => {
    const db = getDb()
    // Seed and encrypt
    await db.patients.put({
      id: 'restore-patient',
      _ultranos: { nameLocal: 'Restore Me' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    const { keyBase64 } = await performEmergencyEncryption()
    const backup = await generateSecurityBackup()

    // Wipe all data
    useAuthSessionStore.getState().setSession(makeManagerSession())
    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })
    expect(await db.patients.count()).toBe(0)

    // Restore
    await restoreFromBackup(backup, keyBase64)

    // Patient should be back
    const patients = await db.patients.toArray()
    expect(patients).toHaveLength(1)
    const restored = patients[0] as Record<string, unknown>
    expect(restored.id).toBe('restore-patient')
  })

  it('restoration from backup with wrong key fails', async () => {
    const db = getDb()
    await db.patients.put({
      id: 'restore-fail',
      _ultranos: { nameLocal: 'Will Fail' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    await performEmergencyEncryption()
    const backup = await generateSecurityBackup()

    useAuthSessionStore.getState().setSession(makeManagerSession())
    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })

    // Generate wrong key
    const wrongKey = await (async () => {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
      const raw = await crypto.subtle.exportKey('raw', key)
      const bytes = new Uint8Array(raw)
      let b64 = ''
      for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]!)
      return btoa(b64)
    })()

    await expect(restoreFromBackup(backup, wrongKey)).rejects.toThrow()
  })

  it('restoration rejects backup with invalid checksum', async () => {
    const backup = await generateSecurityBackup()
    const tampered: SecurityBackup = { ...backup, generatedAt: '2099-01-01T00:00:00Z' }

    useAuthSessionStore.getState().setSession(makeManagerSession())
    await expect(
      restoreFromBackup(tampered, 'any-key'),
    ).rejects.toThrow(/checksum/i)
  })
})

// ─── Audit Events Tests ───────────────────────────────────────────────────────

describe('Security Audit Events', () => {
  it('SECURITY_ALERT_ACTIVATED is emitted on activate()', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())
    await useSecurityAlertStore.getState().activate('manager-001')

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const activationEvent = capturedAuditEvents.find(
      (e) => (e.metadata as Record<string, unknown>)?.securityEvent === 'SECURITY_ALERT_ACTIVATED',
    )
    expect(activationEvent).toBeDefined()
  })

  it('reportSecurityAuditEvent emits with correct metadata shape', async () => {
    reportSecurityAuditEvent({ action: 'SECURITY_EMERGENCY_ENCRYPT', tablesAffected: ['patients'] })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const event = capturedAuditEvents[0]
    expect(event?.metadata).toMatchObject({
      securityEvent: 'SECURITY_EMERGENCY_ENCRYPT',
      tablesAffected: ['patients'],
    })
  })

  it('security audit events do NOT include encryption key or PHI', async () => {
    reportSecurityAuditEvent({ action: 'SECURITY_BACKUP_GENERATED', backupMethod: 'usb' })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const event = capturedAuditEvents[0]
    const metadataStr = JSON.stringify(event?.metadata)
    // Must not contain 'key' values that look like base64 AES keys (44+ chars)
    expect(metadataStr).not.toMatch(/[A-Za-z0-9+/]{44,}={0,2}/)
  })

  it('SECURITY_WIPE_INITIATED is emitted before wipe', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())

    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const wipeEvent = capturedAuditEvents.find(
      (e) => (e.metadata as Record<string, unknown>)?.securityEvent === 'SECURITY_WIPE_INITIATED',
    )
    expect(wipeEvent).toBeDefined()
  })

  it('SECURITY_WIPE_COMPLETED is emitted after wipe', async () => {
    useAuthSessionStore.getState().setSession(makeManagerSession())

    await performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const wipeCompleteEvent = capturedAuditEvents.find(
      (e) => (e.metadata as Record<string, unknown>)?.securityEvent === 'SECURITY_WIPE_COMPLETED',
    )
    expect(wipeCompleteEvent).toBeDefined()
  })
})

// ─── Offline Operation Tests ──────────────────────────────────────────────────

describe('Offline Operation', () => {
  it('Security Alert activation works without network', async () => {
    // No network mock — fetch should not be called
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network unavailable'))

    useAuthSessionStore.getState().setSession(makeManagerSession())
    // Should not throw even though network is unavailable
    await expect(useSecurityAlertStore.getState().activate('manager-001')).resolves.not.toThrow()

    // fetch should not have been called (no network operations)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('Emergency encryption works without network', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network unavailable'))

    const db = getDb()
    await db.patients.put({
      id: 'offline-patient',
      _ultranos: { nameLocal: 'Offline Test' },
      meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    })

    await expect(performEmergencyEncryption()).resolves.not.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('Device wipe works without network', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network unavailable'))

    useAuthSessionStore.getState().setSession(makeManagerSession())
    await expect(
      performDeviceWipe({ confirmationPhrase: WIPE_CONFIRMATION_PHRASE }),
    ).resolves.not.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

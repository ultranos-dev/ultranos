// @vitest-environment node

/**
 * Story 49.3: P2P Sync Tests
 *
 * Covers AC #12:
 * 1.  Bundle signing produces valid Ed25519 signature
 * 2.  Bundle verification succeeds with correct key, fails with wrong key
 * 3.  ECDH key exchange produces identical shared secrets on both sides
 * 4.  AES-256-GCM encryption/decryption round-trip preserves data integrity
 * 5.  Pairing code is deterministic from shared secret
 * 6.  Chunked transfer reassembly produces identical bundle
 * 7.  Partial transfer (simulated disconnect) is discarded, not imported
 * 8.  Audit events emitted for P2P_RESULT_SENT
 * 9.  Trusted device list persists in Dexie and skips re-pairing
 * 10. PHI guard — no patient name, DOB, or demographics in audit metadata
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import nacl from 'tweetnacl'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '000001234567890:00000:test-node',
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  signDiagnosticReportBundle,
  verifyDiagnosticReportBundle,
  canonicalJson,
} from '@/lib/p2p/bundle-signer'
import {
  generateEcdhKeyPair,
  exportEcdhPublicKey,
  importEcdhPublicKey,
  deriveSharedSecret,
  deriveSessionKey,
  computePairingCode,
  saveTrustedDevice,
  isTrustedDevice,
  listTrustedDevices,
  removeTrustedDevice,
} from '@/lib/p2p/handshake'
import {
  encryptBundle,
  decryptBundle,
  chunkArrayBuffer,
  assembleChunks,
  packIvAndCiphertext,
  unpackIvAndCiphertext,
  createChunkAccumulator,
  feedChunk,
  CHUNK_SIZE,
} from '@/lib/p2p/transfer-protocol'
import { getDb } from '@/lib/db'
import {
  emitClientAudit,
  setAuditStoreAdapter,
  type AuditStoreAdapter,
  type ClientAuditEvent,
} from '@ultranos/audit-logger/client'
import { reportP2PAuditEvent } from '@/lib/audit-client'
import type { TrustedDevice } from '@ultranos/shared-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produce a deterministic 32-byte Ed25519 seed from a single fill byte. */
function makeSeed(seedByte: number): Uint8Array {
  return new Uint8Array(32).fill(seedByte)
}

/** Generate a deterministic Ed25519 key pair from a fixed 32-byte seed. */
function makeEd25519KeyPair(seedByte: number) {
  return nacl.sign.keyPair.fromSeed(makeSeed(seedByte))
}

/** Build a minimal FHIR DiagnosticReport for testing (no PHI). */
function makeFhirReport(id: string) {
  return {
    resourceType: 'DiagnosticReport',
    id,
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }] },
    issued: '2026-01-01T00:00:00Z',
  }
}

// ─── Test Setup ───────────────────────────────────────────────────────────────

let capturedAuditEvents: ClientAuditEvent[]
let mockAuditAdapter: AuditStoreAdapter

beforeEach(async () => {
  capturedAuditEvents = []
  mockAuditAdapter = {
    append: vi.fn(async (event: ClientAuditEvent) => {
      capturedAuditEvents.push(event)
    }),
  }
  setAuditStoreAdapter(mockAuditAdapter)

  // Clear P2P-related Dexie tables
  const db = getDb()
  await db.trusted_devices.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── 1. Bundle Signing ────────────────────────────────────────────────────────

describe('Bundle signing — Ed25519', () => {
  it('signDiagnosticReportBundle returns a valid signed bundle', () => {
    const seed = makeSeed(0x01)
    const { publicKey } = nacl.sign.keyPair.fromSeed(seed)
    const report = makeFhirReport('report-001')

    const signed = signDiagnosticReportBundle(report, seed, 'prac-001')

    expect(signed.bundle).toBeTruthy()
    expect(signed.signature).toBeTruthy()
    expect(signed.signerPractitionerId).toBe('prac-001')
    expect(signed.signedAt).toBeTruthy()

    // Signature must be verifiable with the matching public key
    const result = verifyDiagnosticReportBundle(signed, publicKey)
    expect(result.valid).toBe(true)
  })

  it('canonical JSON is deterministic regardless of insertion order', () => {
    const obj1 = { z: 1, a: 2, m: { q: 3, b: 4 } }
    const obj2 = { m: { b: 4, q: 3 }, z: 1, a: 2 }

    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2))
    expect(canonicalJson(obj1)).toBe('{"a":2,"m":{"b":4,"q":3},"z":1}')
  })

  it('signing the same report with the same key produces the same signature', () => {
    const seed = makeSeed(0x02)
    const report = makeFhirReport('report-002')

    const signed1 = signDiagnosticReportBundle(report, seed, 'prac-002')
    const signed2 = signDiagnosticReportBundle(report, seed, 'prac-002')

    expect(signed1.signature).toBe(signed2.signature)
  })
})

// ─── 2. Bundle Verification ───────────────────────────────────────────────────

describe('Bundle verification — Ed25519', () => {
  it('verifyDiagnosticReportBundle succeeds with the correct public key', () => {
    const seed = makeSeed(0x03)
    const { publicKey } = nacl.sign.keyPair.fromSeed(seed)
    const report = makeFhirReport('report-003')
    const signed = signDiagnosticReportBundle(report, seed, 'prac-003')

    const result = verifyDiagnosticReportBundle(signed, publicKey)

    expect(result.valid).toBe(true)
    expect(result.practitionerId).toBe('prac-003')
    expect(result.signedAt).toBeTruthy()
  })

  it('verifyDiagnosticReportBundle fails with the wrong public key', () => {
    const seed = makeSeed(0x04)
    const { publicKey: wrongPublicKey } = makeEd25519KeyPair(0x05)
    const report = makeFhirReport('report-004')
    const signed = signDiagnosticReportBundle(report, seed, 'prac-004')

    const result = verifyDiagnosticReportBundle(signed, wrongPublicKey)

    expect(result.valid).toBe(false)
  })

  it('verifyDiagnosticReportBundle fails when the bundle is tampered', () => {
    const seed = makeSeed(0x06)
    const { publicKey } = nacl.sign.keyPair.fromSeed(seed)
    const report = makeFhirReport('report-005')
    const signed = signDiagnosticReportBundle(report, seed, 'prac-005')

    // Tamper: append extra character to the serialized bundle
    const tampered = { ...signed, bundle: signed.bundle + ' ' }

    const result = verifyDiagnosticReportBundle(tampered, publicKey)

    expect(result.valid).toBe(false)
  })
})

// ─── 3. ECDH Key Exchange ─────────────────────────────────────────────────────

describe('ECDH key exchange', () => {
  it('both sides derive identical shared secrets', async () => {
    // Alice (Lab-Lite sender)
    const aliceKp = await generateEcdhKeyPair()
    const alicePubB64 = await exportEcdhPublicKey(aliceKp)

    // Bob (OPD-Lite receiver)
    const bobKp = await generateEcdhKeyPair()
    const bobPubB64 = await exportEcdhPublicKey(bobKp)

    // Each imports the other's public key
    const aliceImportedBobPub = await importEcdhPublicKey(bobPubB64)
    const bobImportedAlicePub = await importEcdhPublicKey(alicePubB64)

    // Derive shared secrets
    const aliceSecret = await deriveSharedSecret(aliceKp.privateKey, aliceImportedBobPub)
    const bobSecret = await deriveSharedSecret(bobKp.privateKey, bobImportedAlicePub)

    // Both shared secrets must be identical
    expect(new Uint8Array(aliceSecret)).toEqual(new Uint8Array(bobSecret))
  })

  it('public key round-trips through base64 export/import', async () => {
    const kp = await generateEcdhKeyPair()
    const exported = await exportEcdhPublicKey(kp)

    // Must be a non-empty base64 string
    expect(typeof exported).toBe('string')
    expect(exported.length).toBeGreaterThan(0)

    // Must be importable without throwing
    await expect(importEcdhPublicKey(exported)).resolves.toBeDefined()
  })
})

// ─── 4. AES-256-GCM Encryption / Decryption ──────────────────────────────────

describe('AES-256-GCM encryption / decryption', () => {
  it('round-trip preserves data integrity', async () => {
    const aliceKp = await generateEcdhKeyPair()
    const bobKp = await generateEcdhKeyPair()

    const alicePub = await importEcdhPublicKey(await exportEcdhPublicKey(bobKp))
    const shared = await deriveSharedSecret(aliceKp.privateKey, alicePub)
    const sessionKey = await deriveSessionKey(shared)

    const original = JSON.stringify(makeFhirReport('report-006'))

    const { ciphertext, iv } = await encryptBundle(original, sessionKey)
    const recovered = await decryptBundle(ciphertext, iv, sessionKey)

    expect(recovered).toBe(original)
  })

  it('packIvAndCiphertext and unpackIvAndCiphertext are inverse operations', async () => {
    const aliceKp = await generateEcdhKeyPair()
    const bobKp = await generateEcdhKeyPair()

    const shared = await deriveSharedSecret(
      aliceKp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(bobKp)),
    )
    const sessionKey = await deriveSessionKey(shared)

    const { ciphertext, iv } = await encryptBundle('hello p2p', sessionKey)
    const packed = packIvAndCiphertext(iv, ciphertext)
    const unpacked = unpackIvAndCiphertext(packed)

    expect(unpacked).not.toBeNull()
    expect(unpacked!.iv).toEqual(iv)
    expect(new Uint8Array(unpacked!.ciphertext)).toEqual(new Uint8Array(ciphertext))
  })

  it('decryption with a different session key fails', async () => {
    const aliceKp = await generateEcdhKeyPair()
    const bobKp = await generateEcdhKeyPair()
    const carolKp = await generateEcdhKeyPair()

    const aliceBobShared = await deriveSharedSecret(
      aliceKp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(bobKp)),
    )
    const aliceCarolShared = await deriveSharedSecret(
      aliceKp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(carolKp)),
    )

    const rightKey = await deriveSessionKey(aliceBobShared)
    const wrongKey = await deriveSessionKey(aliceCarolShared)

    const { ciphertext, iv } = await encryptBundle('secret data', rightKey)

    await expect(decryptBundle(ciphertext, iv, wrongKey)).rejects.toThrow()
  })
})

// ─── 5. Pairing Code ──────────────────────────────────────────────────────────

describe('Pairing code', () => {
  it('is deterministic: same shared secret always produces the same code', async () => {
    const aliceKp = await generateEcdhKeyPair()
    const bobKp = await generateEcdhKeyPair()

    const alicePub = await importEcdhPublicKey(await exportEcdhPublicKey(bobKp))
    const shared = await deriveSharedSecret(aliceKp.privateKey, alicePub)

    const code1 = await computePairingCode(shared)
    const code2 = await computePairingCode(shared)

    expect(code1).toBe(code2)
  })

  it('is 6 decimal digits, zero-padded', async () => {
    const kp = await generateEcdhKeyPair()
    const kp2 = await generateEcdhKeyPair()
    const shared = await deriveSharedSecret(
      kp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(kp2)),
    )
    const code = await computePairingCode(shared)

    expect(code).toMatch(/^\d{6}$/)
  })

  it('both sides derive the same pairing code from the same ECDH exchange', async () => {
    const aliceKp = await generateEcdhKeyPair()
    const bobKp = await generateEcdhKeyPair()

    const aliceShared = await deriveSharedSecret(
      aliceKp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(bobKp)),
    )
    const bobShared = await deriveSharedSecret(
      bobKp.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(aliceKp)),
    )

    const aliceCode = await computePairingCode(aliceShared)
    const bobCode = await computePairingCode(bobShared)

    expect(aliceCode).toBe(bobCode)
  })
})

// ─── 6. Chunked Transfer Reassembly ──────────────────────────────────────────

describe('Chunked transfer reassembly', () => {
  it('reassembled buffer is identical to original', () => {
    // Create a buffer larger than one chunk to force multi-chunk split
    const size = CHUNK_SIZE * 2 + 500
    const original = new Uint8Array(size)
    for (let i = 0; i < size; i++) original[i] = i % 256
    const originalBuffer = original.buffer

    const chunks = chunkArrayBuffer(originalBuffer)
    expect(chunks.length).toBe(3) // 2 full + 1 partial

    // Accumulate via the ChunkAccumulator (receiver path)
    const acc = createChunkAccumulator()
    chunks.forEach((chunk, index) => {
      feedChunk(acc, {
        type: 'TRANSFER_CHUNK',
        chunkIndex: index,
        totalChunks: chunks.length,
        data: btoa(String.fromCharCode(...chunk)),
      })
    })

    expect(acc.isComplete()).toBe(true)
    const assembled = acc.assemble()
    expect(assembled).not.toBeNull()
    expect(new Uint8Array(assembled!)).toEqual(original)
  })

  it('chunkArrayBuffer handles a buffer smaller than CHUNK_SIZE', () => {
    const small = new Uint8Array([1, 2, 3]).buffer
    const chunks = chunkArrayBuffer(small)
    expect(chunks.length).toBe(1)
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('chunkArrayBuffer produces at least one chunk for an empty buffer', () => {
    const empty = new ArrayBuffer(0)
    const chunks = chunkArrayBuffer(empty)
    expect(chunks.length).toBe(1)
    expect(chunks[0]!.length).toBe(0)
  })
})

// ─── 7. Partial Transfer Discard ─────────────────────────────────────────────

describe('Partial transfer — disconnect handling', () => {
  it('assembleChunks returns null if any chunk is missing', () => {
    const size = CHUNK_SIZE * 3
    const original = new Uint8Array(size).fill(0xaa).buffer
    const chunks = chunkArrayBuffer(original)

    const chunkMap = new Map<number, Uint8Array>()
    // Only add chunks 0 and 2 — skip chunk 1 (simulating disconnect)
    chunkMap.set(0, chunks[0]!)
    chunkMap.set(2, chunks[2]!)

    const result = assembleChunks(chunkMap, chunks.length)
    expect(result).toBeNull()
  })

  it('ChunkAccumulator.isComplete() is false with missing chunks', () => {
    const acc = createChunkAccumulator()

    // Feed only the first of two expected chunks
    feedChunk(acc, {
      type: 'TRANSFER_CHUNK',
      chunkIndex: 0,
      totalChunks: 2,
      data: btoa('firstchunk'),
    })

    expect(acc.isComplete()).toBe(false)
    expect(acc.assemble()).toBeNull()
  })

  it('ChunkAccumulator does not mutate partial data into a valid result', () => {
    const acc = createChunkAccumulator()

    // Simulate receiving only 1 of 3 chunks before connection drops
    feedChunk(acc, {
      type: 'TRANSFER_CHUNK',
      chunkIndex: 1,
      totalChunks: 3,
      data: btoa('middle'),
    })

    // Only 1 of 3 received — must not assemble
    expect(acc.isComplete()).toBe(false)
    const assembled = acc.assemble()
    expect(assembled).toBeNull()
  })
})

// ─── 8. Audit Events — P2P_RESULT_SENT ───────────────────────────────────────

describe('Audit events — P2P_RESULT_SENT', () => {
  it('reportP2PAuditEvent emits an event with p2pEvent = P2P_RESULT_SENT', async () => {
    reportP2PAuditEvent({
      action: 'P2P_RESULT_SENT',
      remoteDeviceId: 'device-opd-001',
      diagnosticReportRef: 'DiagnosticReport/abc-123',
      transferMethod: 'local-network',
      transferSizeBytes: 4096,
      durationMs: 350,
    })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const event = capturedAuditEvents[0]
    expect(event?.metadata).toMatchObject({
      p2pEvent: 'P2P_RESULT_SENT',
      outcome: 'SUCCESS',
      remoteDeviceId: 'device-opd-001',
      transferMethod: 'local-network',
      diagnosticReportRef: 'DiagnosticReport/abc-123',
      transferSizeBytes: 4096,
      durationMs: 350,
    })
  })

  it('reportP2PAuditEvent emits outcome FAILURE for P2P_TRANSFER_FAILED', async () => {
    reportP2PAuditEvent({
      action: 'P2P_TRANSFER_FAILED',
      remoteDeviceId: 'device-opd-002',
      transferMethod: 'ble',
    })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const event = capturedAuditEvents[0]
    expect((event?.metadata as Record<string, unknown>)?.outcome).toBe('FAILURE')
    expect((event?.metadata as Record<string, unknown>)?.p2pEvent).toBe('P2P_TRANSFER_FAILED')
  })
})

// ─── 9. Trusted Device Persistence ───────────────────────────────────────────

describe('Trusted device list — Dexie persistence', () => {
  const DEVICE: TrustedDevice = {
    deviceId: 'opd-device-abc',
    deviceName: 'Dr. Ali\'s Laptop',
    appType: 'opd-lite',
    firstPairedAt: '2026-01-01T10:00:00Z',
    lastConnectedAt: '2026-01-01T10:00:00Z',
  }

  it('isTrustedDevice returns false for unknown device', async () => {
    await expect(isTrustedDevice('unknown-device')).resolves.toBe(false)
  })

  it('saveTrustedDevice persists and isTrustedDevice returns true', async () => {
    await saveTrustedDevice(DEVICE)
    await expect(isTrustedDevice(DEVICE.deviceId)).resolves.toBe(true)
  })

  it('listTrustedDevices returns all saved devices', async () => {
    await saveTrustedDevice(DEVICE)
    await saveTrustedDevice({
      ...DEVICE,
      deviceId: 'opd-device-xyz',
      deviceName: 'Dr. Sara\'s Tablet',
    })

    const list = await listTrustedDevices()
    expect(list).toHaveLength(2)
    expect(list.map((d) => d.deviceId)).toContain('opd-device-abc')
    expect(list.map((d) => d.deviceId)).toContain('opd-device-xyz')
  })

  it('removeTrustedDevice removes the device and isTrustedDevice returns false', async () => {
    await saveTrustedDevice(DEVICE)
    expect(await isTrustedDevice(DEVICE.deviceId)).toBe(true)

    await removeTrustedDevice(DEVICE.deviceId)
    expect(await isTrustedDevice(DEVICE.deviceId)).toBe(false)
  })

  it('a trusted device in Dexie indicates re-pairing should be skipped', async () => {
    // Save device as trusted
    await saveTrustedDevice(DEVICE)

    // The pairing skip decision: if device is trusted, skip visual code
    const trusted = await isTrustedDevice(DEVICE.deviceId)
    expect(trusted).toBe(true)

    // A new device is NOT trusted — pairing code must be shown
    const newDeviceTrusted = await isTrustedDevice('brand-new-device')
    expect(newDeviceTrusted).toBe(false)
  })
})

// ─── 10. PHI Guard ────────────────────────────────────────────────────────────

describe('PHI guard — no patient data in audit metadata', () => {
  it('P2P_RESULT_SENT audit event contains no patient name', async () => {
    reportP2PAuditEvent({
      action: 'P2P_RESULT_SENT',
      remoteDeviceId: 'device-opd-003',
      diagnosticReportRef: 'DiagnosticReport/xyz-456',
      transferMethod: 'local-network',
      transferSizeBytes: 2048,
    })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const metadataStr = JSON.stringify(capturedAuditEvents[0]?.metadata)

    // Must not contain typical PHI field names
    expect(metadataStr).not.toMatch(/patientName/i)
    expect(metadataStr).not.toMatch(/firstName/i)
    expect(metadataStr).not.toMatch(/lastName/i)
    expect(metadataStr).not.toMatch(/dateOfBirth/i)
    expect(metadataStr).not.toMatch(/dob/i)
    expect(metadataStr).not.toMatch(/gender/i)
    expect(metadataStr).not.toMatch(/address/i)
    expect(metadataStr).not.toMatch(/phone/i)
  })

  it('P2P_DEVICE_PAIRED audit event contains no demographics', async () => {
    reportP2PAuditEvent({
      action: 'P2P_DEVICE_PAIRED',
      remoteDeviceId: 'device-opd-004',
      transferMethod: 'ble',
    })

    await vi.waitFor(() => expect(capturedAuditEvents.length).toBeGreaterThan(0))

    const metadataStr = JSON.stringify(capturedAuditEvents[0]?.metadata)

    // The diagnosticReportRef (if present) is an opaque UUID — no PHI
    // Verify the metadata contains only allowed operational fields
    expect(metadataStr).toMatch(/"p2pEvent":"P2P_DEVICE_PAIRED"/)
    expect(metadataStr).toMatch(/"remoteDeviceId":"device-opd-004"/)
    expect(metadataStr).not.toMatch(/patientId/i)
    expect(metadataStr).not.toMatch(/patientName/i)
  })

  it('signed bundle metadata contains no patient demographics', () => {
    const seed = makeSeed(0x10)
    const report = makeFhirReport('phi-guard-report')

    const signed = signDiagnosticReportBundle(report, seed, 'prac-010')

    // signerPractitionerId is an opaque ID — not PHI
    expect(signed.signerPractitionerId).toBe('prac-010')

    // The signed bundle itself must not contain patient name, DOB, etc.
    // (the test report has no demographics — verify the signing wrapper adds none)
    const signerFields = Object.keys(signed)
    expect(signerFields).not.toContain('patientName')
    expect(signerFields).not.toContain('dateOfBirth')
    expect(signerFields).not.toContain('patientId')
  })
})

/**
 * Story 61.2 — KDF vNext (dual-wrapped DEK) tests.
 *
 * Verifies the hardened at-rest key scheme (P-CRYPTO-2 / H-OPD-2):
 *   - a DEK dual-wrapped under a hub server secret AND a device PIN,
 *   - either arm unwraps the SAME working key,
 *   - the wrong server secret / wrong PIN / different sub / tampered blob all fail,
 *   - the persisted bundle contains no plaintext key material,
 *   - the offline cold-start path (PIN unlock) round-trips.
 */

import { describe, it, expect } from 'vitest'
import {
  KEY_SCHEME_VERSION,
  generateDek,
  dualWrapDek,
  unwrapDekWithServerSecret,
  unwrapDekWithPin,
  deriveWrappingKeyFromServerSecret,
  wrapDek,
  unwrapDek,
  DekUnwrapError,
  encryptPayload,
  decryptPayload,
} from '../browser-crypto.js'

const SERVER_SECRET = 'a'.repeat(64) // hex-like per-user secret from the hub
const SUB = 'auth-user-123'
const PIN = '135790'
const SALT = new Uint8Array(16).fill(9)

describe('KDF vNext — dual-wrapped DEK (Story 61.2)', () => {
  it('produces a k2 bundle with two distinct wrapped blobs and no plaintext DEK', async () => {
    const { bundle, dek } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    expect(bundle.scheme).toBe(KEY_SCHEME_VERSION)
    expect(bundle.serverWrapped.length).toBeGreaterThan(0)
    expect(bundle.pinWrapped.length).toBeGreaterThan(0)
    // The two arms wrap the same DEK under different keys → different ciphertext.
    expect(bundle.serverWrapped).not.toEqual(bundle.pinWrapped)
    // The extractable DEK's raw bytes must not appear in the persisted bundle.
    const rawDek = new Uint8Array(await crypto.subtle.exportKey('raw', dek))
    let rawB64 = ''
    for (const b of rawDek) rawB64 += String.fromCharCode(b)
    const rawBase64 = btoa(rawB64)
    expect(bundle.serverWrapped).not.toContain(rawBase64)
    expect(bundle.pinWrapped).not.toContain(rawBase64)
  })

  it('both arms unwrap to a working key that decrypts what the DEK encrypted', async () => {
    const { bundle, dek } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })

    // Encrypt with the original (extractable) DEK.
    const ciphertext = await encryptPayload(dek, { patient: 'opaque', value: 42 }, 'v2')

    const viaServer = await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB)
    const viaPin = await unwrapDekWithPin(bundle, PIN)

    expect(await decryptPayload({ v2: viaServer }, ciphertext)).toEqual({ patient: 'opaque', value: 42 })
    expect(await decryptPayload({ v2: viaPin }, ciphertext)).toEqual({ patient: 'opaque', value: 42 })
  })

  it('the unwrapped working key is NON-extractable (cannot be exported)', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    const dek = await unwrapDekWithServerSecret(bundle, SERVER_SECRET, SUB)
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toBeDefined()
  })

  it('wrong server secret fails to unwrap (fails closed)', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    await expect(unwrapDekWithServerSecret(bundle, 'b'.repeat(64), SUB)).rejects.toBeInstanceOf(DekUnwrapError)
  })

  it('wrong sub fails to unwrap the server arm (sub is mixed into the KDF)', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    await expect(unwrapDekWithServerSecret(bundle, SERVER_SECRET, 'different-sub')).rejects.toBeInstanceOf(DekUnwrapError)
  })

  it('wrong PIN fails to unwrap the PIN arm (offline cold-start guard)', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    await expect(unwrapDekWithPin(bundle, '000000')).rejects.toBeInstanceOf(DekUnwrapError)
  })

  it('a tampered wrapped blob fails to unwrap (AES-KW is integrity-checked)', async () => {
    const { bundle } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    const flipped = { ...bundle, serverWrapped: bundle.serverWrapped.slice(0, -2) + (bundle.serverWrapped.endsWith('A') ? 'B' : 'A') + '=' }
    await expect(unwrapDekWithServerSecret(flipped, SERVER_SECRET, SUB)).rejects.toBeInstanceOf(DekUnwrapError)
  })

  it('the server-arm wrapping key differs per salt (device binding)', async () => {
    const k1 = await deriveWrappingKeyFromServerSecret(SERVER_SECRET, SUB, new Uint8Array(16).fill(1), true)
    const k2 = await deriveWrappingKeyFromServerSecret(SERVER_SECRET, SUB, new Uint8Array(16).fill(2), true)
    const r1 = new Uint8Array(await crypto.subtle.exportKey('raw', k1))
    const r2 = new Uint8Array(await crypto.subtle.exportKey('raw', k2))
    expect(Buffer.from(r1).toString('hex')).not.toEqual(Buffer.from(r2).toString('hex'))
  })

  it('wrap/unwrap round-trips a supplied DEK (migration re-wrap path)', async () => {
    const existingDek = await generateDek()
    const wrapKey = await deriveWrappingKeyFromServerSecret(SERVER_SECRET, SUB, SALT, false)
    const wrapped = await wrapDek(existingDek, wrapKey)
    const back = await unwrapDek(wrapped, wrapKey)
    const ct = await encryptPayload(existingDek, { x: 1 }, 'v2')
    expect(await decryptPayload({ v2: back }, ct)).toEqual({ x: 1 })
  })

  it('offline cold-start: PIN-unwrapped key decrypts data written online', async () => {
    // Online: mint + dual-wrap, write data with the DEK.
    const { bundle, dek } = await dualWrapDek({ serverSecret: SERVER_SECRET, sub: SUB, pin: PIN, salt: SALT })
    const record = { note: 'opaque-clinical-note', n: 7 }
    const ciphertext = await encryptPayload(dek, record, 'v2')

    // Offline cold-start: no hub → unwrap with PIN only.
    const offlineKey = await unwrapDekWithPin(bundle, PIN)
    expect(await decryptPayload({ v2: offlineKey }, ciphertext)).toEqual(record)
  })
})

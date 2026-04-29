import { describe, it, expect } from 'vitest'
import {
  generateKeyPair,
  signPayload,
  verifySignature,
} from '../crypto.js'

describe('Ed25519 signing and verification', () => {
  it('generates a valid key pair with 32-byte keys', async () => {
    const kp = await generateKeyPair()
    expect(kp.publicKey).toBeInstanceOf(Uint8Array)
    expect(kp.privateKey).toBeInstanceOf(Uint8Array)
    expect(kp.publicKey.length).toBe(32)
    expect(kp.privateKey.length).toBe(32)
  })

  it('signs a payload and produces a 64-byte signature', async () => {
    const kp = await generateKeyPair()
    const payload = 'hello world'
    const sig = await signPayload(payload, kp.privateKey)
    expect(sig).toBeInstanceOf(Uint8Array)
    expect(sig.length).toBe(64)
  })

  it('verifies a valid signature', async () => {
    const kp = await generateKeyPair()
    const payload = '{"med":"AMX500"}'
    const sig = await signPayload(payload, kp.privateKey)
    const valid = await verifySignature(payload, sig, kp.publicKey)
    expect(valid).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const kp = await generateKeyPair()
    const payload = '{"med":"AMX500"}'
    const sig = await signPayload(payload, kp.privateKey)
    const valid = await verifySignature('{"med":"IBU400"}', sig, kp.publicKey)
    expect(valid).toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const kp1 = await generateKeyPair()
    const kp2 = await generateKeyPair()
    const payload = 'test data'
    const sig = await signPayload(payload, kp1.privateKey)
    const valid = await verifySignature(payload, sig, kp2.publicKey)
    expect(valid).toBe(false)
  })

  it('works with empty string payload', async () => {
    const kp = await generateKeyPair()
    const sig = await signPayload('', kp.privateKey)
    const valid = await verifySignature('', sig, kp.publicKey)
    expect(valid).toBe(true)
  })

  it('works with large payloads', async () => {
    const kp = await generateKeyPair()
    const payload = 'x'.repeat(5000)
    const sig = await signPayload(payload, kp.privateKey)
    const valid = await verifySignature(payload, sig, kp.publicKey)
    expect(valid).toBe(true)
  })

  it('produces deterministic signatures for the same key+payload', async () => {
    const kp = await generateKeyPair()
    const payload = 'deterministic test'
    const sig1 = await signPayload(payload, kp.privateKey)
    const sig2 = await signPayload(payload, kp.privateKey)
    expect(sig1).toEqual(sig2)
  })
})

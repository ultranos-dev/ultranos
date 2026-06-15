import { describe, it, expect, afterEach } from 'vitest'
import {
  encryptBlob,
  decryptBlob,
  clearSessionEncryptionKey,
} from '../lib/consent-crypto'

/** Helper to read Blob as text (works in jsdom). */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** Helper to read Blob as ArrayBuffer (works in jsdom). */
function blobBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

describe('Consent Blob Encryption (Task 10.11)', () => {
  afterEach(() => {
    clearSessionEncryptionKey()
  })

  it('encrypts a blob — result differs from original', async () => {
    const original = new Blob(['hello world'], { type: 'text/plain' })
    const encrypted = await encryptBlob(original)

    // Encrypted blob must be larger (IV + GCM tag overhead)
    expect(encrypted.size).toBeGreaterThan(original.size)

    // Raw content should not be readable as the original text
    const encryptedText = await blobText(encrypted)
    expect(encryptedText).not.toBe('hello world')
  })

  it('decrypts back to original content', async () => {
    const original = new Blob(['consent audio data'], { type: 'audio/webm' })
    const encrypted = await encryptBlob(original)
    const decrypted = await decryptBlob(encrypted, 'audio/webm')

    const decryptedText = await blobText(decrypted)
    expect(decryptedText).toBe('consent audio data')
    expect(decrypted.type).toBe('audio/webm')
  })

  it('encrypted blob contains IV prefix (12 bytes) + ciphertext', async () => {
    const original = new Blob(['data'], { type: 'text/plain' })
    const encrypted = await encryptBlob(original)

    // IV (12 bytes) + ciphertext (at least 4 bytes data + 16 bytes GCM tag)
    expect(encrypted.size).toBeGreaterThan(12)
  })

  it('two encryptions of same data produce different ciphertexts (random IV)', async () => {
    const original = new Blob(['same data'], { type: 'text/plain' })
    const enc1 = await encryptBlob(original)
    const enc2 = await encryptBlob(original)

    const bytes1 = new Uint8Array(await blobBuffer(enc1))
    const bytes2 = new Uint8Array(await blobBuffer(enc2))

    // Different IVs → different ciphertexts
    let allSame = true
    for (let i = 0; i < Math.min(bytes1.length, bytes2.length); i++) {
      if (bytes1[i] !== bytes2[i]) {
        allSame = false
        break
      }
    }
    expect(allSame).toBe(false)
  })

  it('decryption fails with wrong key', async () => {
    const original = new Blob(['secret data'], { type: 'text/plain' })
    const encrypted = await encryptBlob(original)

    // Clear key and generate a new one
    clearSessionEncryptionKey()

    await expect(decryptBlob(encrypted, 'text/plain')).rejects.toThrow()
  })
})

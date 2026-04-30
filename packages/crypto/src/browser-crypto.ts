const AES_GCM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_BYTES = 12

/**
 * Generate a new AES-256-GCM session key using the Web Crypto API.
 * The key is extractable so it can be exported/imported for key lifecycle management.
 */
export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_GCM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * Returns a base64 string containing the IV (12 bytes) prepended to the ciphertext.
 */
export async function encryptPayload(
  key: CryptoKey,
  data: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM, iv },
    key,
    plaintext,
  )

  // Combine IV + ciphertext into a single buffer, then base64-encode
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)

  return uint8ToBase64(combined)
}

/**
 * Decrypt a base64 string (IV + ciphertext) back to the original value.
 * Throws if the key is wrong or ciphertext has been tampered with.
 */
export async function decryptPayload(
  key: CryptoKey,
  encoded: string,
): Promise<unknown> {
  const combined = base64ToUint8(encoded)
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_GCM, iv },
    key,
    ciphertext,
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}

/**
 * Export a CryptoKey to a base64-encoded raw key string.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return uint8ToBase64(new Uint8Array(raw))
}

/**
 * Import a base64-encoded raw key string back to a CryptoKey.
 */
export async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = base64ToUint8(encoded)
  return crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    { name: AES_GCM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const AES_GCM = 'AES-GCM'
const IV_BYTES = 12

/**
 * In-memory session encryption key for consent blobs.
 * Follows CLAUDE.md: key lives in memory only — cleared on tab/browser close.
 * Never persisted to localStorage/sessionStorage.
 */
let sessionKey: CryptoKey | null = null

export async function getSessionEncryptionKey(): Promise<CryptoKey> {
  if (!sessionKey) {
    sessionKey = await crypto.subtle.generateKey(
      { name: AES_GCM, length: 256 },
      false, // non-extractable — cannot be exported
      ['encrypt', 'decrypt'],
    )
  }
  return sessionKey
}

export function clearSessionEncryptionKey(): void {
  sessionKey = null
}

/** Read a Blob into an ArrayBuffer (works in jsdom + browsers). */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  // Fallback for environments where Blob.arrayBuffer() is unavailable
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Encrypt a Blob using AES-256-GCM.
 * Returns a new Blob containing [IV (12 bytes) | ciphertext].
 * The raw blob (audio/thumbprint) must NEVER be stored unencrypted.
 */
export async function encryptBlob(blob: Blob): Promise<Blob> {
  const key = await getSessionEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const arrayBuffer = await blobToArrayBuffer(blob)
  const encrypted = await crypto.subtle.encrypt(
    { name: AES_GCM, iv },
    key,
    arrayBuffer,
  )
  return new Blob([iv, new Uint8Array(encrypted)])
}

/**
 * Decrypt a Blob that was encrypted with encryptBlob().
 * Extracts the IV prefix and decrypts the remainder.
 */
export async function decryptBlob(
  encryptedBlob: Blob,
  mimeType: string,
): Promise<Blob> {
  const key = await getSessionEncryptionKey()
  const buffer = await blobToArrayBuffer(encryptedBlob)
  const iv = new Uint8Array(buffer.slice(0, IV_BYTES))
  const ciphertext = buffer.slice(IV_BYTES)
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_GCM, iv },
    key,
    ciphertext,
  )
  return new Blob([decrypted], { type: mimeType })
}

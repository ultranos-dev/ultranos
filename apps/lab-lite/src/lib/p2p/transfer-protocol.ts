/**
 * Story 49.3: P2P Transfer Protocol
 *
 * Handles AES-256-GCM encryption/decryption and chunked transfer over a P2PConnection.
 *
 * Wire format per chunk (TRANSFER_CHUNK message):
 *   data field = base64(IV(12 bytes) + chunkBytes)   — for first chunk, IV is also sent
 *
 * Full transfer flow (sender perspective):
 *   1. encryptBundle()     → { ciphertext, iv }
 *   2. chunkArrayBuffer()  → Uint8Array[] (16KB chunks)
 *   3. Send TRANSFER_OFFER (size, reportId, patientIdShort — no PHI)
 *   4. Receive TRANSFER_ACCEPT
 *   5. Send TRANSFER_CHUNK for each chunk
 *   6. Send TRANSFER_COMPLETE with signature
 *   7. Receive TRANSFER_VERIFY_OK / TRANSFER_VERIFY_FAIL
 *
 * Failure handling (AC #9):
 *   - If connection drops mid-transfer, the sender side discards the session.
 *   - The receiver MUST accumulate all chunks before reassembling; on disconnect
 *     it discards any partial data (never writes to the result store).
 *
 * PHI: the ciphertext is PHI-equivalent and handled as such. The transfer
 * metadata (reportId = opaque UUID, patientIdShort = last 4 chars) is not PHI.
 */

import type { P2PConnection } from './transport'
import type { P2PMessage } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 16KB per chunk — compatible with BLE MTU when the BLE layer reassembles. */
export const CHUNK_SIZE = 16 * 1024

// ---------------------------------------------------------------------------
// AES-256-GCM encryption / decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns both the ciphertext and the randomly-generated IV.
 * The IV must be sent alongside the ciphertext (it is not secret).
 */
export async function encryptBundle(
  plaintext: string,
  sessionKey: CryptoKey,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encoded,
  )
  return { ciphertext, iv }
}

/**
 * Decrypt an AES-256-GCM ciphertext.
 * Returns the plaintext string, or throws if decryption fails (tag mismatch).
 */
export async function decryptBundle(
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  sessionKey: CryptoKey,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}

// ---------------------------------------------------------------------------
// Chunking / reassembly
// ---------------------------------------------------------------------------

/**
 * Split an ArrayBuffer into chunks of up to CHUNK_SIZE bytes.
 * The last chunk may be smaller than CHUNK_SIZE.
 */
export function chunkArrayBuffer(data: ArrayBuffer): Uint8Array[] {
  const chunks: Uint8Array[] = []
  const view = new Uint8Array(data)
  for (let i = 0; i < view.length; i += CHUNK_SIZE) {
    chunks.push(view.slice(i, i + CHUNK_SIZE))
  }
  // Ensure at least one chunk for empty data
  if (chunks.length === 0) {
    chunks.push(new Uint8Array(0))
  }
  return chunks
}

/**
 * Reassemble chunks into a single ArrayBuffer.
 * Returns null if any chunk is missing (partial transfer).
 */
export function assembleChunks(
  chunks: Map<number, Uint8Array>,
  totalChunks: number,
): ArrayBuffer | null {
  if (chunks.size !== totalChunks) return null
  const arrays: Uint8Array[] = []
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i)
    if (!chunk) return null
    arrays.push(chunk)
  }
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result.buffer
}

// ---------------------------------------------------------------------------
// Wire encoding: prepend IV to ciphertext for serialization
// ---------------------------------------------------------------------------

/**
 * Pack IV + ciphertext into a single ArrayBuffer for transmission.
 * Format: [12 bytes IV][N bytes ciphertext]
 */
export function packIvAndCiphertext(iv: Uint8Array, ciphertext: ArrayBuffer): ArrayBuffer {
  const packed = new Uint8Array(iv.length + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.length)
  return packed.buffer
}

/**
 * Unpack IV from the first 12 bytes and return ciphertext remainder.
 * Returns null if the buffer is too short.
 */
export function unpackIvAndCiphertext(
  packed: ArrayBuffer,
): { iv: Uint8Array; ciphertext: ArrayBuffer } | null {
  if (packed.byteLength < 12) return null
  const iv = new Uint8Array(packed, 0, 12)
  const ciphertext = packed.slice(12)
  return { iv, ciphertext }
}

// ---------------------------------------------------------------------------
// Message serialization
// ---------------------------------------------------------------------------

/** Encode a P2PMessage to ArrayBuffer for transmission over P2PConnection. */
export function encodeMessage(msg: P2PMessage): ArrayBuffer {
  const json = JSON.stringify(msg)
  return new TextEncoder().encode(json).buffer
}

/** Decode a P2PMessage from an ArrayBuffer received via P2PConnection. */
export function decodeMessage(data: ArrayBuffer): P2PMessage {
  const json = new TextDecoder().decode(data)
  return JSON.parse(json) as P2PMessage
}

// ---------------------------------------------------------------------------
// Sender helper: send all chunks over a connection
// ---------------------------------------------------------------------------

export interface SendChunksOptions {
  connection: P2PConnection
  chunks: Uint8Array[]
  onProgress?: (sent: number, total: number) => void
}

/**
 * Send all chunks over the connection, emitting progress events.
 * Each chunk is encoded as a TRANSFER_CHUNK P2PMessage.
 */
export async function sendChunks({
  connection,
  chunks,
  onProgress,
}: SendChunksOptions): Promise<void> {
  const totalChunks = chunks.length
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = btoa(String.fromCharCode(...chunks[i]))
    const msg: P2PMessage = {
      type: 'TRANSFER_CHUNK',
      chunkIndex: i,
      totalChunks,
      data: chunkData,
    }
    await connection.send(encodeMessage(msg))
    onProgress?.(i + 1, totalChunks)
  }
}

// ---------------------------------------------------------------------------
// Receiver helper: accumulate chunks until all are received
// ---------------------------------------------------------------------------

export interface ChunkAccumulator {
  chunks: Map<number, Uint8Array>
  totalChunks: number | null
  isComplete(): boolean
  assemble(): ArrayBuffer | null
}

/** Create a fresh accumulator for an incoming transfer. */
export function createChunkAccumulator(): ChunkAccumulator {
  const acc: ChunkAccumulator = {
    chunks: new Map<number, Uint8Array>(),
    totalChunks: null,
    isComplete(): boolean {
      return acc.totalChunks !== null && acc.chunks.size === acc.totalChunks
    },
    assemble(): ArrayBuffer | null {
      if (acc.totalChunks === null) return null
      return assembleChunks(acc.chunks, acc.totalChunks)
    },
  }
  return acc
}

/** Feed a TRANSFER_CHUNK message into an accumulator. */
export function feedChunk(
  accumulator: ChunkAccumulator,
  msg: Extract<P2PMessage, { type: 'TRANSFER_CHUNK' }>,
): void {
  if (accumulator.totalChunks === null) {
    accumulator.totalChunks = msg.totalChunks
  }
  const bytes = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0))
  accumulator.chunks.set(msg.chunkIndex, bytes)
}

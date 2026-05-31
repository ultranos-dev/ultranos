/**
 * Payload compression for Low Data Mode.
 * Uses the CompressionStream API (gzip) when available.
 * Falls back to uncompressed if the API is not supported.
 */

/** Check if CompressionStream API is available in this browser. */
export function isCompressionAvailable(): boolean {
  return typeof globalThis.CompressionStream !== 'undefined'
}

/**
 * Compress a string body with gzip using the CompressionStream API.
 * Returns { body, headers } ready for fetch().
 * If compression is not available, returns the original body unchanged.
 */
export async function compressBody(
  body: string,
): Promise<{ body: Blob | string; headers: Record<string, string> }> {
  if (!isCompressionAvailable()) {
    return { body, headers: {} }
  }

  const encoder = new TextEncoder()
  const stream = new Blob([encoder.encode(body)]).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  const chunks: Uint8Array[] = []
  const reader = compressed.getReader()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const compressedBlob = new Blob(chunks)
  return {
    body: compressedBlob,
    headers: { 'Content-Encoding': 'gzip' },
  }
}

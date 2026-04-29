/**
 * SHA-256 hash of a national ID string for MPI matching.
 * Uses Web Crypto API (browser) for consistency with the Hub API's
 * server-side Node.js crypto.createHash('sha256').
 */
export async function hashNationalId(rawId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(rawId)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

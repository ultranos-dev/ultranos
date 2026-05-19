/**
 * SHA-256 hash of national ID for MPI matching.
 * Uses expo-crypto for mobile environments.
 */
import * as Crypto from 'expo-crypto'

export async function hashNationalId(rawId: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawId)
}

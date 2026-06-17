import * as SecureStore from 'expo-secure-store'
import { getRandomBytes } from 'expo-crypto'
import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js'

const KEY_NAME = 'pharmopedia.profileCacheKey.v1'
const KEY_BYTES = 32
const IV_BYTES = 12

/** Get the cache key from SecureStore, creating + persisting it on first use. Returns hex. */
export async function getOrCreateCacheKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME)
  if (existing) return existing
  const key = bytesToHex(getRandomBytes(KEY_BYTES))
  await SecureStore.setItemAsync(KEY_NAME, key)
  return key
}

export interface SealedBlob { ciphertext: string; iv: string }

export async function encryptJson(obj: unknown): Promise<SealedBlob> {
  const key = hexToBytes(await getOrCreateCacheKey())
  const iv = getRandomBytes(IV_BYTES)
  const plain = new TextEncoder().encode(JSON.stringify(obj))
  const ct = gcm(key, iv).encrypt(plain)
  return { ciphertext: bytesToHex(ct), iv: bytesToHex(iv) }
}

export async function decryptJson<T>(blob: SealedBlob): Promise<T> {
  const key = hexToBytes(await getOrCreateCacheKey())
  const pt = gcm(key, hexToBytes(blob.iv)).decrypt(hexToBytes(blob.ciphertext))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

/** Remove the cache key (used on logout/session-end). */
export async function clearCacheKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME)
}

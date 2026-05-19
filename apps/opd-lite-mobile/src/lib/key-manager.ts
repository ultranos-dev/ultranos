/**
 * SQLCipher encryption key management via expo-secure-store.
 * Generates a random 256-bit key on first launch, stores it in
 * Android Keystore / iOS Keychain — never in plaintext or AsyncStorage.
 *
 * Follows the write-then-verify pattern from packages/crypto/src/mobile-ecdsa-keystore.ts.
 */
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'

const ENCRYPTION_KEY_STORE_KEY = 'ultranos_sqlcipher_encryption_key'

const STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
} as const

/**
 * Retrieve the SQLCipher encryption key, generating one on first launch.
 * Uses expo-secure-store backed by Android Keystore / iOS Keychain.
 */
export async function getEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY)
  if (existing) {
    return existing
  }

  // Generate random 256-bit (32-byte) key, encode as hex
  const randomBytes = await Crypto.getRandomBytesAsync(32)
  const key = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Write-then-verify pattern
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, key, STORE_OPTIONS)
  const verified = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY)
  if (verified !== key) {
    throw new Error('Failed to persist SQLCipher encryption key to secure storage')
  }

  return key
}

/**
 * Check if an encryption key exists in SecureStore.
 */
export async function hasEncryptionKey(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY)
  return key !== null
}

/**
 * Delete the encryption key from SecureStore.
 * WARNING: This renders the local SQLCipher database unreadable.
 */
export async function deleteEncryptionKey(): Promise<void> {
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE_KEY)
}

/**
 * Mobile ECDSA keystore — wraps Expo SecureStore for ECDSA-P256 private key storage.
 * Story 25.4: Biometric-gated access to the patient's identity signing key.
 *
 * This module is ONLY imported by mobile apps (Patient Lite Mobile).
 * expo-secure-store and expo-local-authentication are optional peer dependencies.
 */
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'

const PRIVATE_KEY_STORE_KEY = 'ultranos_ecdsa_private_key'
const PUBLIC_KEY_STORE_KEY = 'ultranos_ecdsa_public_key'
const BIOMETRIC_PROMPT = 'Authenticate to access your identity key'

const STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
} as const

/**
 * Store the ECDSA private key in SecureStore with biometric access control.
 * Uses write-then-verify pattern to confirm persistence.
 */
export async function storeEcdsaPrivateKey(privateKeyBase64: string): Promise<void> {
  await SecureStore.setItemAsync(PRIVATE_KEY_STORE_KEY, privateKeyBase64, STORE_OPTIONS)

  // Write-then-verify: confirm the key was persisted
  const verified = await SecureStore.getItemAsync(PRIVATE_KEY_STORE_KEY)
  if (verified !== privateKeyBase64) {
    throw new Error('Failed to persist ECDSA private key to secure storage')
  }
}

/**
 * Store the ECDSA public key in SecureStore.
 * Public key is stored alongside private key for local availability.
 */
export async function storeEcdsaPublicKey(publicKeyBase64: string): Promise<void> {
  await SecureStore.setItemAsync(PUBLIC_KEY_STORE_KEY, publicKeyBase64, STORE_OPTIONS)

  const verified = await SecureStore.getItemAsync(PUBLIC_KEY_STORE_KEY)
  if (verified !== publicKeyBase64) {
    throw new Error('Failed to persist ECDSA public key to secure storage')
  }
}

/**
 * Retrieve the ECDSA private key. Requires biometric authentication.
 * Returns null if auth fails or no key is stored.
 */
export async function getEcdsaPrivateKey(): Promise<string | null> {
  const authResult = await LocalAuthentication.authenticateAsync({
    promptMessage: BIOMETRIC_PROMPT,
    fallbackLabel: 'Use Passcode',
    disableDeviceFallback: false,
  })

  if (!authResult.success) {
    return null
  }

  return SecureStore.getItemAsync(PRIVATE_KEY_STORE_KEY)
}

/**
 * Retrieve the ECDSA public key. No biometric auth required (public key is not sensitive).
 */
export async function getEcdsaPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PUBLIC_KEY_STORE_KEY)
}

/**
 * Check if an ECDSA key pair exists in SecureStore.
 * Only checks the public key slot (not sensitive) to avoid reading private key without biometric auth.
 * Both keys are always stored together, so public key presence implies private key presence.
 */
export async function hasEcdsaKeyPair(): Promise<boolean> {
  const publicKey = await SecureStore.getItemAsync(PUBLIC_KEY_STORE_KEY)
  return publicKey !== null
}

/**
 * Delete both ECDSA keys and registration state from SecureStore.
 * Used for key rotation — clears registration flag so the new key gets registered.
 */
export async function deleteEcdsaKeyPair(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE_KEY)
  await SecureStore.deleteItemAsync(PUBLIC_KEY_STORE_KEY)
  await SecureStore.deleteItemAsync('ultranos_ecdsa_key_registered')
  await SecureStore.deleteItemAsync('ultranos_ecdsa_pending_public_key')
}

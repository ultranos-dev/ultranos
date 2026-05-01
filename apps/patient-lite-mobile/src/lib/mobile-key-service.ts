/**
 * Mobile Key Service — manages the SQLCipher database passphrase.
 *
 * Wraps expo-secure-store (passphrase storage) and expo-local-authentication
 * (biometric gate). The passphrase is a random 32-byte key stored in the
 * device's secure enclave (iOS Keychain / Android Keystore).
 *
 * Full biometric unlock flow is implemented in Task 2.
 */
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import * as Crypto from 'expo-crypto'
import { generateUnlockToken } from '@/lib/encrypted-db'

const DB_PASSPHRASE_KEY = 'ultranos_db_passphrase'
const BIOMETRIC_PROMPT_MESSAGE = 'Authenticate to unlock your health records'

/** Result of an unlock attempt */
export type UnlockFailureReason = 'cancelled' | 'not-enrolled' | 'failed' | 'not-available'

export type UnlockResult =
  | { success: true; unlockToken: string }
  | { success: false; reason: UnlockFailureReason }

/**
 * Get or create the database passphrase.
 * On first run, generates a cryptographically random 32-byte key
 * and stores it in the device secure enclave via expo-secure-store.
 */
export async function getOrCreateDbPassphrase(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_PASSPHRASE_KEY)
  if (existing) return existing

  // Generate 32 random bytes → hex string (64 chars)
  const randomBytes = await Crypto.getRandomBytesAsync(32)
  const passphrase = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Store MUST succeed before returning — if this throws, the passphrase
  // is never used for PRAGMA key, preventing permanent data loss
  await SecureStore.setItemAsync(DB_PASSPHRASE_KEY, passphrase, {
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  })

  // Verify the write persisted — read back to confirm
  const verified = await SecureStore.getItemAsync(DB_PASSPHRASE_KEY)
  if (verified !== passphrase) {
    throw new Error('Failed to persist database passphrase to secure storage')
  }

  return passphrase
}

/**
 * Authenticate the user via biometrics before returning the passphrase.
 * Falls back to device passcode if biometrics are unavailable.
 */
export async function unlockWithBiometrics(): Promise<UnlockResult> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  if (!hasHardware) {
    // Fallback: if no biometric hardware, try passcode-only
    return unlockWithPasscode()
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync()
  if (!isEnrolled) {
    // No biometrics enrolled — fall back to device passcode
    return unlockWithPasscode()
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: BIOMETRIC_PROMPT_MESSAGE,
    fallbackLabel: 'Use Passcode',
    disableDeviceFallback: false,
  })

  if (!result.success) {
    return { success: false, reason: mapAuthError(result.error) }
  }

  // Ensure passphrase exists (creates on first run)
  await getOrCreateDbPassphrase()
  const token = await generateUnlockToken()
  return { success: true, unlockToken: token }
}

/** Map expo-local-authentication error strings to unlock failure reasons. */
function mapAuthError(error?: string): UnlockFailureReason {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'cancelled'
    case 'lockout':
      return 'not-available'
    default:
      return 'failed'
  }
}

/**
 * Fallback: authenticate via device passcode (no biometric hardware or not enrolled).
 */
async function unlockWithPasscode(): Promise<UnlockResult> {
  const securityLevel = await LocalAuthentication.getEnrolledLevelAsync()

  if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
    return { success: false, reason: 'not-available' }
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: BIOMETRIC_PROMPT_MESSAGE,
    disableDeviceFallback: false,
  })

  if (!result.success) {
    return { success: false, reason: mapAuthError(result.error) }
  }

  await getOrCreateDbPassphrase()
  const token = await generateUnlockToken()
  return { success: true, unlockToken: token }
}

/**
 * Check whether a passphrase already exists in secure storage.
 */
export async function hasExistingPassphrase(): Promise<boolean> {
  const existing = await SecureStore.getItemAsync(DB_PASSPHRASE_KEY)
  return existing !== null
}

/**
 * Delete the stored passphrase. Used during key rotation or wipe scenarios.
 */
export async function deletePassphrase(): Promise<void> {
  await SecureStore.deleteItemAsync(DB_PASSPHRASE_KEY)
}

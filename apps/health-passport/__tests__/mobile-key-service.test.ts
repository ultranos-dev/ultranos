/**
 * Tests for MobileKeyService — biometric key unlocking.
 *
 * Verifies:
 * - AC3: Encryption key stored in device's secure enclave (iOS Keychain / Android Keystore)
 * - AC4: Unlocking requires successful biometric authentication
 */

import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import * as Crypto from 'expo-crypto'

import {
  getOrCreateDbPassphrase,
  unlockWithBiometrics,
  hasExistingPassphrase,
  deletePassphrase,
} from '@/lib/mobile-key-service'

// Mocks are set up in jest.setup.js

describe('getOrCreateDbPassphrase', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns existing passphrase from SecureStore if present', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-key-hex')

    const result = await getOrCreateDbPassphrase()

    expect(result).toBe('existing-key-hex')
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('generates and stores a new 32-byte passphrase if none exists', async () => {
    const expectedPassphrase = 'ab'.repeat(32)
    let storedValue: string | null = null
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(storedValue),
    )
    ;(SecureStore.setItemAsync as jest.Mock).mockImplementation((_key: string, value: string) => {
      storedValue = value
      return Promise.resolve()
    })
    ;(Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(
      new Uint8Array(32).fill(0xab),
    )

    const result = await getOrCreateDbPassphrase()

    // 32 bytes → 64-char hex string
    expect(result).toHaveLength(64)
    expect(result).toBe(expectedPassphrase)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'ultranos_db_passphrase',
      result,
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      }),
    )
  })

  it('stores passphrase with WHEN_PASSCODE_SET_THIS_DEVICE_ONLY for secure enclave', async () => {
    let storedValue: string | null = null
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(storedValue),
    )
    ;(SecureStore.setItemAsync as jest.Mock).mockImplementation((_key: string, value: string) => {
      storedValue = value
      return Promise.resolve()
    })

    await getOrCreateDbPassphrase()

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      }),
    )
  })
})

describe('unlockWithBiometrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-key')
  })

  it('authenticates with biometrics and returns passphrase on success', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: true,
    })

    const result = await unlockWithBiometrics()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.passphrase).toBe('existing-key')
    }
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: expect.any(String),
        disableDeviceFallback: false,
      }),
    )
  })

  it('returns cancelled when user cancels biometric prompt', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: false,
      error: 'user_cancel',
    })

    const result = await unlockWithBiometrics()

    expect(result).toEqual({ success: false, reason: 'cancelled' })
  })

  it('falls back to passcode when no biometric hardware', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false)
    ;(LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
      LocalAuthentication.SecurityLevel.BIOMETRIC,
    )
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: true,
    })

    const result = await unlockWithBiometrics()

    expect(result.success).toBe(true)
    // Should still call authenticate (passcode fallback)
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled()
  })

  it('falls back to passcode when biometrics not enrolled', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false)
    ;(LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
      LocalAuthentication.SecurityLevel.SECRET,
    )
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: true,
    })

    const result = await unlockWithBiometrics()

    expect(result.success).toBe(true)
  })

  it('returns not-available when no security at all (no passcode, no biometrics)', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false)
    ;(LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
      LocalAuthentication.SecurityLevel.NONE,
    )

    const result = await unlockWithBiometrics()

    expect(result).toEqual({ success: false, reason: 'not-available' })
  })
})

describe('hasExistingPassphrase', () => {
  it('returns true when passphrase exists', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some-key')
    expect(await hasExistingPassphrase()).toBe(true)
  })

  it('returns false when no passphrase stored', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    expect(await hasExistingPassphrase()).toBe(false)
  })
})

describe('deletePassphrase', () => {
  it('deletes the passphrase from SecureStore', async () => {
    await deletePassphrase()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ultranos_db_passphrase')
  })
})

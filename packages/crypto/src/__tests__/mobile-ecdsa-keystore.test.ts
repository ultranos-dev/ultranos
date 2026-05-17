import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock expo-secure-store
const mockGetItemAsync = vi.fn()
const mockSetItemAsync = vi.fn()
const mockDeleteItemAsync = vi.fn()

vi.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
}))

// Mock expo-local-authentication
const mockAuthenticateAsync = vi.fn()
const mockHasHardwareAsync = vi.fn()
const mockIsEnrolledAsync = vi.fn()

vi.mock('expo-local-authentication', () => ({
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
  hasHardwareAsync: () => mockHasHardwareAsync(),
  isEnrolledAsync: () => mockIsEnrolledAsync(),
}))

const {
  storeEcdsaPrivateKey,
  getEcdsaPrivateKey,
  hasEcdsaKeyPair,
  deleteEcdsaKeyPair,
  storeEcdsaPublicKey,
  getEcdsaPublicKey,
} = await import('../mobile-ecdsa-keystore.js')

beforeEach(() => {
  vi.clearAllMocks()
  mockHasHardwareAsync.mockResolvedValue(true)
  mockIsEnrolledAsync.mockResolvedValue(true)
  mockAuthenticateAsync.mockResolvedValue({ success: true })
})

describe('mobile-ecdsa-keystore', () => {
  describe('storeEcdsaPrivateKey', () => {
    it('stores the private key in SecureStore with biometric access control', async () => {
      mockSetItemAsync.mockResolvedValue(undefined)
      mockGetItemAsync.mockResolvedValue('test-private-key-base64')

      await storeEcdsaPrivateKey('test-private-key-base64')

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'ultranos_ecdsa_private_key',
        'test-private-key-base64',
        { keychainAccessible: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY' },
      )
    })

    it('write-then-verify: throws if readback does not match', async () => {
      mockSetItemAsync.mockResolvedValue(undefined)
      mockGetItemAsync.mockResolvedValue('wrong-readback')

      await expect(storeEcdsaPrivateKey('test-private-key-base64')).rejects.toThrow(
        'Failed to persist ECDSA private key to secure storage',
      )
    })
  })

  describe('storeEcdsaPublicKey', () => {
    it('stores the public key in SecureStore', async () => {
      mockSetItemAsync.mockResolvedValue(undefined)
      mockGetItemAsync.mockResolvedValue('test-public-key-base64')

      await storeEcdsaPublicKey('test-public-key-base64')

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'ultranos_ecdsa_public_key',
        'test-public-key-base64',
        { keychainAccessible: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY' },
      )
    })
  })

  describe('getEcdsaPrivateKey', () => {
    it('requires biometric auth before returning key', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: true })
      mockGetItemAsync.mockResolvedValue('stored-private-key')

      const result = await getEcdsaPrivateKey()

      expect(mockAuthenticateAsync).toHaveBeenCalled()
      expect(result).toBe('stored-private-key')
    })

    it('returns null if biometric auth fails', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' })

      const result = await getEcdsaPrivateKey()
      expect(result).toBeNull()
    })

    it('returns null if no key stored', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: true })
      mockGetItemAsync.mockResolvedValue(null)

      const result = await getEcdsaPrivateKey()
      expect(result).toBeNull()
    })
  })

  describe('getEcdsaPublicKey', () => {
    it('returns the stored public key without biometric auth', async () => {
      mockGetItemAsync.mockResolvedValue('stored-public-key')

      const result = await getEcdsaPublicKey()
      expect(result).toBe('stored-public-key')
      expect(mockAuthenticateAsync).not.toHaveBeenCalled()
    })
  })

  describe('hasEcdsaKeyPair', () => {
    it('returns true when public key exists', async () => {
      mockGetItemAsync.mockResolvedValueOnce('public-key')

      const result = await hasEcdsaKeyPair()
      expect(result).toBe(true)
      // Should only check public key slot (not private key — avoids biometric bypass)
      expect(mockGetItemAsync).toHaveBeenCalledTimes(1)
      expect(mockGetItemAsync).toHaveBeenCalledWith('ultranos_ecdsa_public_key')
    })

    it('returns false when no public key exists', async () => {
      mockGetItemAsync.mockResolvedValue(null)

      const result = await hasEcdsaKeyPair()
      expect(result).toBe(false)
    })

    it('does not read private key slot (no biometric bypass)', async () => {
      mockGetItemAsync.mockResolvedValueOnce(null)

      await hasEcdsaKeyPair()
      expect(mockGetItemAsync).not.toHaveBeenCalledWith('ultranos_ecdsa_private_key')
    })
  })

  describe('deleteEcdsaKeyPair', () => {
    it('deletes both keys and registration flags', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined)

      await deleteEcdsaKeyPair()

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('ultranos_ecdsa_private_key')
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('ultranos_ecdsa_public_key')
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('ultranos_ecdsa_key_registered')
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('ultranos_ecdsa_pending_public_key')
    })
  })
})

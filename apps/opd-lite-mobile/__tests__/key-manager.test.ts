import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'

import { getEncryptionKey, hasEncryptionKey, deleteEncryptionKey } from '../src/lib/key-manager'

describe('key-manager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getEncryptionKey', () => {
    it('returns existing key from SecureStore when present', async () => {
      const existingKey = 'abcdef1234567890'.repeat(4)
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(existingKey)

      const key = await getEncryptionKey()

      expect(key).toBe(existingKey)
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('ultranos_sqlcipher_encryption_key')
      expect(Crypto.getRandomBytesAsync).not.toHaveBeenCalled()
    })

    it('generates a new 256-bit key on first launch', async () => {
      // No existing key
      ;(SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce(null) // first check — no key

      const fakeBytes = new Uint8Array(32).fill(0xab)
      ;(Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValueOnce(fakeBytes)

      const expectedKey = Array.from(fakeBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // Write-then-verify: setItemAsync succeeds, then getItemAsync returns the key
      ;(SecureStore.setItemAsync as jest.Mock).mockResolvedValueOnce(undefined)
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(expectedKey)

      const key = await getEncryptionKey()

      expect(key).toBe(expectedKey)
      expect(key).toHaveLength(64) // 32 bytes * 2 hex chars
      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32)
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'ultranos_sqlcipher_encryption_key',
        expectedKey,
        { keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY }
      )
    })

    it('throws if write-then-verify fails', async () => {
      ;(SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce(null) // no existing key
      ;(Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValueOnce(new Uint8Array(32).fill(0x01))
      ;(SecureStore.setItemAsync as jest.Mock).mockResolvedValueOnce(undefined)
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('wrong-value')

      await expect(getEncryptionKey()).rejects.toThrow(
        'Failed to persist SQLCipher encryption key to secure storage'
      )
    })
  })

  describe('hasEncryptionKey', () => {
    it('returns true when key exists', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('some-key')
      expect(await hasEncryptionKey()).toBe(true)
    })

    it('returns false when no key exists', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null)
      expect(await hasEncryptionKey()).toBe(false)
    })
  })

  describe('deleteEncryptionKey', () => {
    it('calls deleteItemAsync on SecureStore', async () => {
      await deleteEncryptionKey()
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ultranos_sqlcipher_encryption_key')
    })
  })
})

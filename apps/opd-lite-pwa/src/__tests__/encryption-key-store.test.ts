import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  encryptionKeyStore,
  EncryptionKeyNotAvailableError,
} from '../lib/encryption-key-store'
import { generateSessionKey } from '@ultranos/crypto'

describe('encryptionKeyStore', () => {
  beforeEach(() => {
    encryptionKeyStore.wipe()
  })

  afterEach(() => {
    encryptionKeyStore.wipe()
  })

  it('starts with no key', () => {
    expect(encryptionKeyStore.getKey()).toBeNull()
    expect(encryptionKeyStore.isReady()).toBe(false)
  })

  it('stores and retrieves a CryptoKey', async () => {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)

    expect(encryptionKeyStore.getKey()).toBe(key)
    expect(encryptionKeyStore.isReady()).toBe(true)
  })

  it('wipe() clears the key', async () => {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    expect(encryptionKeyStore.isReady()).toBe(true)

    encryptionKeyStore.wipe()
    expect(encryptionKeyStore.getKey()).toBeNull()
    expect(encryptionKeyStore.isReady()).toBe(false)
  })

  it('requireKey() returns the key when available', async () => {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)

    expect(encryptionKeyStore.requireKey()).toBe(key)
  })

  it('requireKey() throws EncryptionKeyNotAvailableError when no key', () => {
    expect(() => encryptionKeyStore.requireKey()).toThrow(
      EncryptionKeyNotAvailableError,
    )
  })

  it('never persists to localStorage or sessionStorage', async () => {
    const localSetItem = vi.spyOn(Storage.prototype, 'setItem')
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    encryptionKeyStore.wipe()

    expect(localSetItem).not.toHaveBeenCalled()
    localSetItem.mockRestore()
  })
})

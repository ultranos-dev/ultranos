import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  encryptionKeyStore,
  EncryptionKeyNotAvailableError,
  getOrCreateDeviceSalt,
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

  // AC 3: expired session cannot derive key — isReady() must return false until a key is
  // explicitly set after successful authentication. This verifies the pre-condition: the
  // AuthGuard only calls setKey() after a valid Supabase session is confirmed.
  it('expired session — isReady() is false until setKey() is called after successful auth', async () => {
    // Simulate the state before any session is available (page load with expired session)
    encryptionKeyStore.wipe()
    expect(encryptionKeyStore.isReady()).toBe(false)
    expect(encryptionKeyStore.getKey()).toBeNull()
    expect(() => encryptionKeyStore.requireKey()).toThrow(EncryptionKeyNotAvailableError)
  })
})

describe('getOrCreateDeviceSalt', () => {
  const SALT_KEY = 'ultranos:device-salt'

  beforeEach(() => {
    localStorage.removeItem(SALT_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(SALT_KEY)
  })

  // P4: device salt persists in localStorage across "page loads" (repeated calls)
  it('persists the salt in localStorage and returns the same bytes on subsequent calls', () => {
    const first = getOrCreateDeviceSalt()
    expect(first).toBeInstanceOf(Uint8Array)
    expect(first.length).toBe(16)

    // Verify it was written to localStorage
    expect(localStorage.getItem(SALT_KEY)).not.toBeNull()

    // Simulate a second call (page reload scenario — same localStorage entry)
    const second = getOrCreateDeviceSalt()
    expect(second).toEqual(first)
  })

  it('generates and persists a new salt when localStorage is empty', () => {
    expect(localStorage.getItem(SALT_KEY)).toBeNull()
    const salt = getOrCreateDeviceSalt()
    expect(salt.length).toBe(16)
    expect(localStorage.getItem(SALT_KEY)).not.toBeNull()
  })

  it('clears a corrupt stored salt and returns a fresh one', () => {
    // Simulate a corrupt entry (length < 16 when decoded)
    localStorage.setItem(SALT_KEY, btoa('short'))
    const salt = getOrCreateDeviceSalt()
    expect(salt.length).toBe(16)
    // Corrupt entry should have been cleared and replaced
    const stored = localStorage.getItem(SALT_KEY)
    expect(stored).not.toBeNull()
    const decoded = Uint8Array.from(atob(stored!), (c) => c.charCodeAt(0))
    expect(decoded.length).toBe(16)
    expect(decoded).toEqual(salt)
  })
})

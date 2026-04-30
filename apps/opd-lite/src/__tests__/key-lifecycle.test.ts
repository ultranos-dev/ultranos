import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '../lib/encryption-key-store'
import { useAuthSessionStore } from '../stores/auth-session-store'

describe('key lifecycle', () => {
  beforeEach(() => {
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()
  })

  afterEach(() => {
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()
  })

  it('wipe() clears the key so reads fail', async () => {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    expect(encryptionKeyStore.isReady()).toBe(true)

    encryptionKeyStore.wipe()
    expect(encryptionKeyStore.isReady()).toBe(false)
    expect(encryptionKeyStore.getKey()).toBeNull()
  })

  it('clearSession on auth store wipes encryption key', async () => {
    // Import the side-effect module that hooks auth → key wipe
    await import('../lib/key-lifecycle-hooks')

    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'clinician',
      sessionId: 's1',
    })

    expect(encryptionKeyStore.isReady()).toBe(true)

    // Simulate logout
    useAuthSessionStore.getState().clearSession()

    expect(encryptionKeyStore.isReady()).toBe(false)
  })

  it('key is never stored in localStorage or sessionStorage', async () => {
    const localSetItem = vi.spyOn(Storage.prototype, 'setItem')

    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)

    // Simulate full lifecycle
    encryptionKeyStore.wipe()

    expect(localSetItem).not.toHaveBeenCalled()
    localSetItem.mockRestore()
  })
})

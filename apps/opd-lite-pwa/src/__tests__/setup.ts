import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '../lib/encryption-key-store'

// Polyfill ResizeObserver for jsdom (required by cmdk)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Polyfill Element.scrollIntoView for jsdom (required by cmdk)
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {}
}

// Provide a test encryption key so encrypted Dexie tables work in tests.
// Tests that specifically test key-absent behavior manage their own key state.
beforeAll(async () => {
  if (!encryptionKeyStore.isReady()) {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
  }
})

afterEach(async () => {
  cleanup()
  // Re-establish test key if a test wiped it
  if (!encryptionKeyStore.isReady()) {
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
  }
})

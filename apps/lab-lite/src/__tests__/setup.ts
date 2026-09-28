import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

// Raise the async-utility timeout (default 1000ms) so waitFor/findBy in async render
// tests don't flake under full-suite parallel CPU load (300+ files). Passing tests are
// unaffected; only genuinely-stuck waits take longer to fail. See vitest.config.ts.
configure({ asyncUtilTimeout: 8000 })

// Story 58.3 (H-LAB-1): PHI tables are now AES-GCM field-encrypted via the Dexie
// middleware, which requires the session key to be installed for any read/write.
// Install a fresh random session key ONCE per test file (beforeAll) so the
// (pre-58.3) db tests that write/read PHI tables continue to pass transparently —
// mirroring how pharmacy-lite/opd-lite tests provision the key.
//
// beforeAll (not beforeEach): it runs once, fully awaited before any test body,
// and — crucially — does NOT insert an async hook before every test, which would
// perturb the microtask/timer ordering of fake-timer tests (e.g. the queue
// display board poll). Tests that exercise the "awaiting key / locked" path wipe
// the key in-test; tests that need a fresh key per case re-set it themselves.
beforeAll(async () => {
  encryptionKeyStore.setKey(await generateSessionKey())
})

afterEach(() => {
  cleanup()
})

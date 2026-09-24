/**
 * PHI cleanup lifecycle — Story 59.3, Task 3 (H-OPD-5).
 *
 * Codifies the settled decision (post-Story 61.2): OPD Lite wipes the in-memory
 * encryption KEY ONLY on tab close / refresh, and clears the encrypted PHI tables
 * ONLY on explicit auth-expiry or logout — never on ordinary refresh (which would
 * break offline-first). The dead, never-mounted PhiCleanupGuard was REMOVED rather
 * than mounted, because mounting it would have cleared PHI on every `beforeunload`.
 *
 * These tests assert:
 *  - the removed component's PHI-clearing behaviour does NOT run on tab close /
 *    refresh (PHI tables survive so the offline cache stays usable);
 *  - the explicit logout path (AuthGuard-style) clears PHI + wipes the key;
 *  - the auth-expiry path (SessionTimeoutWrapper-style) clears PHI + wipes the key;
 *  - in-session refresh preserves PHI.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateSessionKey } from '@ultranos/crypto'
import { db } from '../lib/db'
import {
  clearPhiTables,
  clearSyncedQueueEntries,
  PHI_TABLES,
} from '../lib/phi-cleanup'
import { encryptionKeyStore } from '../lib/encryption-key-store'
import { useAuthSessionStore } from '../stores/auth-session-store'

async function seedPhi() {
  await db.patients.add({ id: 'p-1', resourceType: 'Patient' } as never)
  await db.encounters.add({ id: 'e-1', resourceType: 'Encounter' } as never)
  await db.allergyIntolerances.add({
    id: 'a-1',
    resourceType: 'AllergyIntolerance',
  } as never)
}

async function authenticate() {
  const key = await generateSessionKey()
  encryptionKeyStore.setKey(key)
  useAuthSessionStore.getState().setSession({
    userId: 'u1',
    practitionerId: 'p1',
    role: 'clinician',
    sessionId: 's1',
    email: 'test@hospital.com',
  })
}

describe('PHI cleanup lifecycle (Story 59.3 Task 3 — no PhiCleanupGuard)', () => {
  beforeEach(async () => {
    // Ensure the auth→key-wipe side-effect hook is registered (mirrors runtime).
    await import('../lib/key-lifecycle-hooks')
    await Promise.all(db.tables.map((t) => t.clear()))
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()
  })

  afterEach(() => {
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()
  })

  it('the removed PhiCleanupGuard component file is no longer present in the app', () => {
    // Regression guard: the dead, never-mounted guard must stay deleted. If someone
    // re-introduces a guard that clears PHI on beforeunload, this catches it.
    // (Filesystem check, not a dynamic import — Vite statically resolves import
    // literals at transform time, which would fail the whole suite rather than
    // reject at runtime.) Vitest runs with cwd = the opd-lite app root.
    const guardPath = resolve(process.cwd(), 'src/components/PhiCleanupGuard.tsx')
    expect(existsSync(guardPath)).toBe(false)
  })

  it('tab close / refresh: firing beforeunload wipes the KEY but does NOT clear PHI tables', async () => {
    await authenticate()
    await seedPhi()

    expect(encryptionKeyStore.isReady()).toBe(true)
    expect(await db.patients.count()).toBe(1)
    expect(await db.encounters.count()).toBe(1)
    expect(await db.allergyIntolerances.count()).toBe(1)

    // encryption-key-store.ts registers a beforeunload → encryptionKeyStore.wipe()
    // hook on module load. Simulate a real tab close / refresh.
    window.dispatchEvent(new Event('beforeunload'))

    // Key is gone (blobs become opaque)…
    expect(encryptionKeyStore.isReady()).toBe(false)
    // …but the offline PHI cache SURVIVES — this is the offline-first guarantee.
    expect(await db.patients.count()).toBe(1)
    expect(await db.encounters.count()).toBe(1)
    expect(await db.allergyIntolerances.count()).toBe(1)
  })

  it('in-session (no beforeunload): PHI tables are untouched', async () => {
    await authenticate()
    await seedPhi()

    // A re-render / route change / focus event must never clear PHI.
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(encryptionKeyStore.isReady()).toBe(true)
    expect(await db.patients.count()).toBe(1)
    expect(await db.encounters.count()).toBe(1)
  })

  it('explicit logout: clears every PHI table AND wipes the key', async () => {
    await authenticate()
    await seedPhi()

    // Mirrors AuthGuard.handleSignOut / nav-user / UserDropdown ordering:
    // synced-queue prune → clear PHI tables → wipe key → clear session.
    await clearSyncedQueueEntries()
    await clearPhiTables()
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()

    for (const table of PHI_TABLES) {
      expect(await db.table(table).count()).toBe(0)
    }
    expect(encryptionKeyStore.isReady()).toBe(false)
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)
  })

  it('auth-expiry (session timeout): clears PHI tables AND wipes the key', async () => {
    await authenticate()
    await seedPhi()

    // Mirrors SessionTimeoutWrapper.handleExpired: queue prune → key wipe →
    // clearSession() (the auth→key-wipe hook also fires on clearSession).
    void clearSyncedQueueEntries()
    await clearPhiTables()
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()

    expect(await db.patients.count()).toBe(0)
    expect(await db.encounters.count()).toBe(0)
    expect(await db.allergyIntolerances.count()).toBe(0)
    expect(encryptionKeyStore.isReady()).toBe(false)
  })

  it('logout via auth store flip wipes the key (key-lifecycle-hooks)', async () => {
    await authenticate()
    expect(encryptionKeyStore.isReady()).toBe(true)

    // clearSession() flips isAuthenticated → false; the subscribed hook wipes the key.
    useAuthSessionStore.getState().clearSession()

    expect(encryptionKeyStore.isReady()).toBe(false)
  })
})

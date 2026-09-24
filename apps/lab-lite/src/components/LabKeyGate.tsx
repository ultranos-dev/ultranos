'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

/**
 * Story 58.3 regression fix — single key-readiness gate for the entire `(app)`
 * subtree.
 *
 * Lab-lite's Dexie tables are field-encrypted at rest (samples, orders, results,
 * uploadQueue, …). The AES session key is MEMORY-ONLY (wiped on tab close) and is
 * re-established ASYNCHRONOUSLY by AuthGuard on load (possibly a hub round-trip).
 * The authenticated app shell + its background sync components (useOrderSync,
 * MonitoringSyncInit, SyncDashboard, hydration, drains) key off the *session*,
 * which rehydrates from storage BEFORE the key exists — so they would run encrypted
 * reads/writes with no key and throw `EncryptionKeyNotAvailableError`.
 *
 * This gate renders a loading state until `encryptionKeyStore.isReady()`, so NOTHING
 * under `(app)` mounts or runs encrypted I/O before the key is installed. AuthGuard
 * (an ancestor) establishes the key and dispatches `ultranos:lab-key-ready`; we also
 * poll defensively in case the key is installed without an event (e.g. dev HMR reset).
 */
export function LabKeyGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => encryptionKeyStore.isReady())

  useEffect(() => {
    if (ready) return
    const check = () => {
      if (encryptionKeyStore.isReady()) setReady(true)
    }
    window.addEventListener('ultranos:lab-key-ready', check)
    // Defensive poll: covers the case where the key becomes ready without an event
    // (e.g. a dev Fast-Refresh module reset re-establishes it out of band).
    const interval = setInterval(check, 300)
    check() // race: key may have become ready between render and listener attach
    return () => {
      window.removeEventListener('ultranos:lab-key-ready', check)
      clearInterval(interval)
    }
  }, [ready])

  if (!ready) {
    return (
      <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="Unlocking secure data">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-5 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  return <>{children}</>
}

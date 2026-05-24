'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary, StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { triggerDrain } from '@/lib/sync-worker'
import { pullPatientChanges } from '@/lib/sync-pull'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'
import { AuthGuard } from './AuthGuard'
import { InstallPrompt } from './InstallPrompt'

const DB_NAME = 'opd-lite'

function AsyncErrorBridge({ children }: { children: ReactNode }) {
  const [asyncError, setAsyncError] = useState<Error | null>(null)

  useAsyncErrorBoundary({
    onStorageError: useCallback((error: unknown) => {
      setAsyncError(error instanceof Error ? error : new Error('Storage error'))
    }, []),
  })

  if (asyncError) throw asyncError

  return <>{children}</>
}

function SyncAwareStaleDataBanner() {
  const [mounted, setMounted] = useState(false)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isAuthenticated) return null

  return (
    <StaleDataBanner
      lastSyncedAt={lastSyncedAt}
      failedCount={failedCount}
      onSyncNow={async () => {
        // Push pending local changes
        await triggerDrain()

        // Pull for active patient if a chart is open
        const activePatientId = useSyncStore.getState().activePatientId
        if (activePatientId) {
          try {
            const { getSupabaseBrowserClient } = await import('@/lib/supabase')
            const { data } = await getSupabaseBrowserClient().auth.getSession()
            const token = data.session?.access_token ?? ''
            if (token) {
              await pullPatientChanges(activePatientId, () => token)
            }
          } catch {
            // Pull failed — push still completed
          }
        }

        // Update lastSyncedAt to clear the "never synced" banner
        const state = useSyncStore.getState()
        state.updateSyncStatus({
          isPending: state.isPending,
          isError: state.isError,
          lastSyncedAt: new Date().toISOString(),
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
        })
      }}
    />
  )
}

function handleClearEncryptionKey() {
  encryptionKeyStore.wipe()
}

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="opd-lite" dbName={DB_NAME} onClearData={handleClearEncryptionKey}>
      <AsyncErrorBridge>
        <AuthGuard>
          <SyncAwareStaleDataBanner />
          <SessionTimeoutWrapper>
            {children}
          </SessionTimeoutWrapper>
          <InstallPrompt />
        </AuthGuard>
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}

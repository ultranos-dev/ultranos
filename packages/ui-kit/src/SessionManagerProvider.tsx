'use client'

import type { ReactNode } from 'react'
import { useSessionManager } from './useSessionManager.js'
import { SessionWarningToast } from './SessionWarningToast.js'
import { ReAuthModal } from './ReAuthModal.js'

export interface SessionManagerProviderProps {
  maxDurationMs: number
  inactivityMs: number
  onExpired: () => void
  onReAuth: (password: string) => Promise<boolean>
  userEmail: string
  children: ReactNode
}

export function SessionManagerProvider({
  maxDurationMs,
  inactivityMs,
  onExpired,
  onReAuth,
  userEmail,
  children,
}: SessionManagerProviderProps) {
  const { sessionState, remainingSeconds, resetInactivity, forceExpire } = useSessionManager({
    maxDurationMs,
    inactivityMs,
    onExpired,
  })

  return (
    <>
      {children}
      {sessionState === 'warning' && (
        <SessionWarningToast
          remainingSeconds={remainingSeconds}
          onStaySignedIn={resetInactivity}
        />
      )}
      {sessionState === 'locked' && (
        <ReAuthModal
          userEmail={userEmail}
          onReAuth={async (password) => {
            const success = await onReAuth(password)
            if (success) {
              resetInactivity()
            }
            return success
          }}
          onSignOut={forceExpire}
        />
      )}
    </>
  )
}

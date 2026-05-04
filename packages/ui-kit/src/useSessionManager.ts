'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Constants ───────────────────────────────────────────────────────────

export const SESSION_DURATIONS = {
  CLINICIAN: 8 * 60 * 60 * 1000,
  DOCTOR: 8 * 60 * 60 * 1000,
  PHARMACIST: 12 * 60 * 60 * 1000,
  ADMIN: 4 * 60 * 60 * 1000,
  LAB_TECH: 8 * 60 * 60 * 1000,
} as const

export const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes
export const WARNING_BEFORE_MS = 5 * 60 * 1000 // 5 minutes

// ── Types ───────────────────────────────────────────────────────────────

export type SessionState = 'active' | 'warning' | 'locked' | 'expired'

export interface UseSessionManagerConfig {
  /** Absolute max session duration (ms). Never resets. */
  maxDurationMs: number
  /** Inactivity timeout (ms). Resets on user activity. */
  inactivityMs: number
  /** Called when session must be terminated. App must clear auth/PHI state and redirect. */
  onExpired: () => void
  /** Optional: called when entering warning state. */
  onWarning?: () => void
}

export interface UseSessionManagerReturn {
  sessionState: SessionState
  remainingSeconds: number
  resetInactivity: () => void
  forceExpire: () => void
}

// ── Activity Events ─────────────────────────────────────────────────────

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'mousedown', 'scroll'] as const

// ── Hook ────────────────────────────────────────────────────────────────

export function useSessionManager(config: UseSessionManagerConfig): UseSessionManagerReturn {
  const { maxDurationMs, inactivityMs, onExpired, onWarning } = config

  const [sessionState, setSessionState] = useState<SessionState>('active')
  const [remainingSeconds, setRemainingSeconds] = useState(Math.ceil(inactivityMs / 1000))

  const lastActivityRef = useRef(Date.now())
  const sessionStateRef = useRef<SessionState>('active')
  const warningFiredRef = useRef(false)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Keep ref in sync with state for use in callbacks
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired
  const onWarningRef = useRef(onWarning)
  onWarningRef.current = onWarning

  const expire = useCallback(() => {
    if (sessionStateRef.current === 'expired') return
    sessionStateRef.current = 'expired'
    setSessionState('expired')
    setRemainingSeconds(0)
    onExpiredRef.current()
  }, [])

  const resetInactivity = useCallback(() => {
    if (sessionStateRef.current === 'expired') return
    lastActivityRef.current = Date.now()
    warningFiredRef.current = false
    sessionStateRef.current = 'active'
    setSessionState('active')
    setRemainingSeconds(Math.ceil(inactivityMs / 1000))
  }, [inactivityMs])

  // Activity event handler with 1-second throttle
  useEffect(() => {
    let lastHandledTime = Date.now()

    function handleActivity() {
      const now = Date.now()
      if (now - lastHandledTime < 1000) return
      lastHandledTime = now

      const state = sessionStateRef.current
      if (state === 'locked' || state === 'expired') return

      lastActivityRef.current = now
      warningFiredRef.current = false

      if (state === 'warning') {
        sessionStateRef.current = 'active'
        setSessionState('active')
      }
    }

    ACTIVITY_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleActivity, { passive: true })
    )
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity))
    }
  }, [])

  // 1-second tick for inactivity countdown and state transitions
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const state = sessionStateRef.current
      if (state === 'expired' || state === 'locked') return

      const elapsed = Date.now() - lastActivityRef.current
      const remaining = Math.max(0, inactivityMs - elapsed)
      const remainingSec = Math.ceil(remaining / 1000)
      setRemainingSeconds(remainingSec)

      if (remaining <= 0) {
        // Inactivity fully elapsed → locked
        sessionStateRef.current = 'locked'
        setSessionState('locked')
      } else if (remaining <= WARNING_BEFORE_MS && state === 'active') {
        // Entering warning zone
        sessionStateRef.current = 'warning'
        setSessionState('warning')
        if (!warningFiredRef.current) {
          warningFiredRef.current = true
          onWarningRef.current?.()
        }
      }
    }, 1000)

    return () => clearInterval(tickRef.current)
  }, [inactivityMs])

  // Absolute session duration timer (never resets)
  useEffect(() => {
    sessionTimerRef.current = setTimeout(() => {
      expire()
    }, maxDurationMs)

    return () => clearTimeout(sessionTimerRef.current)
  }, [maxDurationMs, expire])

  return {
    sessionState,
    remainingSeconds,
    resetInactivity,
    forceExpire: expire,
  }
}

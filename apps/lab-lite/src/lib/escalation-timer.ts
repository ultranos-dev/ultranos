/**
 * Escalation Timer Service — Story 48.4
 *
 * Client-side timer that drives escalation chain advancement.
 * Timers are ephemeral (setInterval) but escalation state persists in Dexie.
 * On app restart, resumeActiveEscalations() re-creates timers from stored state.
 *
 * AC 3–6: Fires the correct notification action at each step.
 * Timer resolution: 1-minute intervals (acceptable latency for SMS).
 */

import {
  advanceEscalation,
  getActiveEscalations,
  catchUpMissedSteps,
} from './escalation-manager'
import type { EscalationStep } from './db'

// ---------------------------------------------------------------------------
// Event system — UI subscribes to receive step-fire notifications
// ---------------------------------------------------------------------------

export type EscalationStepEvent = {
  chainId: string
  step: EscalationStep
}

type StepListener = (event: EscalationStepEvent) => void

const stepListeners = new Set<StepListener>()

/** Subscribe to escalation step events. Returns an unsubscribe function. */
export function onEscalationStep(listener: StepListener): () => void {
  stepListeners.add(listener)
  return () => stepListeners.delete(listener)
}

function emitStep(event: EscalationStepEvent): void {
  stepListeners.forEach((l) => {
    try {
      l(event)
    } catch {
      // Never allow listener errors to break the timer loop
    }
  })
}

// ---------------------------------------------------------------------------
// Timer registry — one setInterval per active chain
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS = 60_000 // 1 minute

const activeTimers = new Map<string, ReturnType<typeof setInterval>>()

/**
 * Start a 1-minute interval timer for a given escalation chain.
 * At each tick, checks if the current step is due and executes it.
 * If already running, does nothing.
 */
export function startEscalationTimer(chainId: string): void {
  if (activeTimers.has(chainId)) return

  const handle = setInterval(async () => {
    try {
      const step = await advanceEscalation(chainId)
      if (step) {
        emitStep({ chainId, step })
      } else {
        // If chain is complete (null returned after step 5), clean up timer
        const { getEscalationChainById } = await import('./db')
        const chain = await getEscalationChainById(chainId)
        if (chain && chain.status !== 'active') {
          stopEscalationTimer(chainId)
        }
      }
    } catch {
      // Never let timer errors crash — the chain state in Dexie is the source of truth
    }
  }, TICK_INTERVAL_MS)

  activeTimers.set(chainId, handle)
}

/**
 * Stop the timer for a given escalation chain (called on acknowledgment or expiry).
 */
export function stopEscalationTimer(chainId: string): void {
  const handle = activeTimers.get(chainId)
  if (handle !== undefined) {
    clearInterval(handle)
    activeTimers.delete(chainId)
  }
}

/**
 * On app startup, query Dexie for all active escalation chains and:
 *   1. Catch up any steps that were missed during downtime (mark as 'escalated')
 *   2. Restart the timer for each active chain
 *
 * Called once from the app root on mount (client-side only).
 */
export async function resumeActiveEscalations(): Promise<void> {
  if (typeof window === 'undefined') return // SSR guard

  try {
    const activeChains = await getActiveEscalations()

    for (const chain of activeChains) {
      // Catch up any missed steps from the downtime gap
      const missed = await catchUpMissedSteps(chain.chainId)
      for (const step of missed) {
        emitStep({ chainId: chain.chainId, step })
      }

      // Restart the timer for this chain
      startEscalationTimer(chain.chainId)
    }
  } catch {
    // Never throw — startup must not be blocked by escalation timer failures
  }
}

/**
 * Stop all active timers. Useful for testing and cleanup.
 */
export function stopAllEscalationTimers(): void {
  for (const [chainId] of activeTimers) {
    stopEscalationTimer(chainId)
  }
}

/** Return the count of currently active timers (for testing). */
export function getActiveTimerCount(): number {
  return activeTimers.size
}

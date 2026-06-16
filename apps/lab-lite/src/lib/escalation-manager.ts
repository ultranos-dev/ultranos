/**
 * Escalation Chain Manager — Story 48.4
 *
 * Manages the lifecycle of critical value escalation chains:
 *   - Initiation (5 steps pre-computed)
 *   - Step acknowledgment
 *   - Step advancement (timeout-based)
 *   - Active chain queries
 *
 * AC 9: Pure rule-based state machine — no AI judgment.
 * AC 7: Every state transition is audit-logged by the caller via reportEscalationEvent().
 *
 * PHI note: patientRef is opaque. Physician ID is stored as a practitioner ID only.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  createEscalationChain,
  getEscalationChainById,
  updateEscalationChain,
  getActiveEscalationChains,
  getEscalationHistory,
  getDefaultEscalationContact,
} from './db'
import type { EscalationChain, EscalationStep, EscalationContact } from './db'
import type { CriticalValueResult } from './critical-value-engine'

// Escalation timing offsets from chain creation (in minutes)
const STEP_OFFSETS_MINUTES = {
  1: 0,   // Immediately — full-screen tech alert
  2: 0,   // Immediately after tech ack — in-app to physician
  3: 15,  // T+15 min — SMS to physician
  4: 30,  // T+30 min — SMS to medical director
  5: 60,  // T+60 min — flag to district health officer
} as const

/**
 * Build the 5 pre-computed escalation steps at chain initiation.
 * All times are relative to createdAt (the initiation timestamp).
 */
function buildSteps(
  orderingPhysicianId: string,
  medicalDirectorId: string,
  districtOfficerId: string,
  createdAt: Date,
): EscalationStep[] {
  const steps: EscalationStep[] = [
    {
      stepNumber: 1,
      type: 'tech_alert',
      recipientId: 'releasing_tech',
      recipientRole: 'lab_tech',
      scheduledAt: createdAt.toISOString(),
      sentAt: null,
      acknowledgedAt: null,
      status: 'pending',
    },
    {
      stepNumber: 2,
      type: 'inapp_notification',
      recipientId: orderingPhysicianId,
      recipientRole: 'physician',
      scheduledAt: createdAt.toISOString(), // fires after step 1 ack
      sentAt: null,
      acknowledgedAt: null,
      status: 'pending',
    },
    {
      stepNumber: 3,
      type: 'sms_physician',
      recipientId: orderingPhysicianId,
      recipientRole: 'physician',
      scheduledAt: new Date(createdAt.getTime() + STEP_OFFSETS_MINUTES[3] * 60_000).toISOString(),
      sentAt: null,
      acknowledgedAt: null,
      status: 'pending',
    },
    {
      stepNumber: 4,
      type: 'sms_director',
      recipientId: medicalDirectorId,
      recipientRole: 'medical_director',
      scheduledAt: new Date(createdAt.getTime() + STEP_OFFSETS_MINUTES[4] * 60_000).toISOString(),
      sentAt: null,
      acknowledgedAt: null,
      status: 'pending',
    },
    {
      stepNumber: 5,
      type: 'flag_district',
      recipientId: districtOfficerId,
      recipientRole: 'district_officer',
      scheduledAt: new Date(createdAt.getTime() + STEP_OFFSETS_MINUTES[5] * 60_000).toISOString(),
      sentAt: null,
      acknowledgedAt: null,
      status: 'pending',
    },
  ]
  return steps
}

/**
 * Initiate a new escalation chain for a critical value finding.
 *
 * All 5 steps are pre-computed with their scheduled timestamps.
 * Returns the persisted EscalationChain (without the auto-id).
 */
export async function initiateEscalation(
  criticalResult: CriticalValueResult,
  resultId: string,
  patientRef: string,
  orderingPhysicianId: string,
): Promise<EscalationChain> {
  const now = new Date()
  const chainId = uuidv4()

  // Resolve escalation contacts (graceful fallbacks if not configured)
  const [directorContact, districtContact] = await Promise.all([
    getDefaultEscalationContact('medical_director'),
    getDefaultEscalationContact('district_officer'),
  ])

  const medicalDirectorId = directorContact ? 'medical_director' : 'medical_director_unset'
  const districtOfficerId = districtContact ? 'district_officer' : 'district_officer_unset'

  const steps = buildSteps(orderingPhysicianId, medicalDirectorId, districtOfficerId, now)

  const chain: Omit<EscalationChain, 'id'> = {
    chainId,
    resultId,
    loincCode: criticalResult.loincCode,
    analyte: criticalResult.analyte,
    criticalValue: criticalResult.value,
    unit: criticalResult.unit ?? '',
    criticalDirection: criticalResult.direction!,
    patientRef,
    orderingPhysicianId,
    currentStep: 1,
    status: 'active',
    steps,
    createdAt: now.toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  }

  await createEscalationChain(chain)
  return chain as EscalationChain
}

/**
 * Acknowledge a step in the escalation chain.
 *
 * When the physician (or higher authority) acknowledges, the chain is marked
 * as acknowledged and all remaining steps are skipped.
 * Tech acknowledgment (step 1) only advances the chain to step 2.
 */
export async function acknowledgeStep(
  chainId: string,
  stepNumber: number,
  acknowledgedBy: string,
): Promise<void> {
  const chain = await getEscalationChainById(chainId)
  if (!chain) return
  if (chain.status !== 'active') return

  const now = new Date().toISOString()

  // Mark the specific step acknowledged
  const updatedSteps = chain.steps.map((s) =>
    s.stepNumber === stepNumber
      ? { ...s, acknowledgedAt: now, status: 'acknowledged' as const }
      : s,
  )

  // Step 1 (tech alert): acknowledge and advance — do NOT close the chain
  if (stepNumber === 1) {
    await updateEscalationChain(chainId, {
      steps: updatedSteps,
      currentStep: 2,
    })

    // D4: Immediately advance step 2 (in-app physician notification) without waiting for timer tick
    try {
      const step2 = await advanceEscalation(chainId)
      if (step2) {
        // Emit step event asynchronously so callers can trigger in-app notification
        import('./escalation-timer').then(({ emitStep }) => {
          emitStep(chainId, step2)
        }).catch(() => { /* best-effort */ })
      }
    } catch {
      // Non-fatal: timer will catch step 2 on next tick if this fails
    }

    return
  }

  // Any other step: physician or above → close the chain
  const allSkipped = updatedSteps.map((s) =>
    s.stepNumber > stepNumber && s.status === 'pending'
      ? { ...s, status: 'skipped' as const }
      : s,
  )

  await updateEscalationChain(chainId, {
    steps: allSkipped,
    status: 'acknowledged',
    acknowledgedAt: now,
    acknowledgedBy,
  })

  // Stop the escalation timer for this chain immediately
  import('./escalation-timer').then(({ stopEscalationTimer }) => {
    stopEscalationTimer(chainId)
  }).catch(() => { /* best-effort */ })
}

/**
 * Advance the escalation chain if the current step has timed out.
 *
 * Re-queries chain status before advancing to avoid race conditions
 * (e.g., physician acknowledges at T+14:59 and SMS fires at T+15:00).
 *
 * Returns the next EscalationStep to execute, or null if:
 *   - Chain is acknowledged / expired
 *   - Current step has not timed out yet
 *   - No more steps remain
 */
export async function advanceEscalation(chainId: string): Promise<EscalationStep | null> {
  // Re-query to get the freshest state (race-condition guard)
  const chain = await getEscalationChainById(chainId)
  if (!chain) return null
  if (chain.status !== 'active') return null

  const now = new Date()
  const currentStepDef = chain.steps.find((s) => s.stepNumber === chain.currentStep)
  if (!currentStepDef) return null

  // Step 1 is handled by the UI (full-screen alert), not by the timer
  if (chain.currentStep === 1) return null

  // Check if the scheduled time for the current step has passed
  const scheduledAt = new Date(currentStepDef.scheduledAt)
  if (now < scheduledAt) return null // not yet due

  // Check the step hasn't already been sent
  if (currentStepDef.status !== 'pending') return null

  // Mark step as sent and advance currentStep pointer
  const nextStepNumber = chain.currentStep + 1
  const updatedSteps = chain.steps.map((s) =>
    s.stepNumber === chain.currentStep
      ? { ...s, sentAt: now.toISOString(), status: 'sent' as const }
      : s,
  )

  const isLastStep = chain.currentStep >= 5

  await updateEscalationChain(chainId, {
    steps: updatedSteps,
    currentStep: isLastStep ? chain.currentStep : nextStepNumber,
    ...(isLastStep ? { status: 'expired' as const } : {}),
  })

  // Emit ESCALATION_EXPIRED audit event when chain reaches terminal state
  if (isLastStep) {
    import('./audit-client').then(({ reportEscalationEvent }) => {
      reportEscalationEvent({
        action: 'ESCALATION_EXPIRED',
        chainId,
        resultId: chain.resultId,
        stepNumber: chain.currentStep,
        recipientRole: currentStepDef.recipientRole,
        notificationType: currentStepDef.type,
        timestamp: new Date().toISOString(),
      })
    }).catch(() => { /* best-effort */ })
  }

  return currentStepDef
}

/**
 * Return all active escalation chains.
 * Used by the timer service on startup to resume in-flight escalations.
 */
export async function getActiveEscalations(): Promise<EscalationChain[]> {
  return getActiveEscalationChains()
}

/**
 * Return escalation history (completed/acknowledged).
 * Pass resultId to filter by a specific lab result.
 */
export { getEscalationHistory }

/**
 * Check whether any step in the chain was missed during a downtime gap
 * (app restart, tab close, etc.) and mark them as escalated if so.
 *
 * Called by the timer on startup for each active chain.
 * Missed steps are marked 'escalated' (not executed retroactively for SMS —
 * audit log flags them for manual follow-up).
 */
export async function catchUpMissedSteps(chainId: string): Promise<EscalationStep[]> {
  const chain = await getEscalationChainById(chainId)
  if (!chain || chain.status !== 'active') return []

  const now = new Date()
  const missed: EscalationStep[] = []

  const updatedSteps = chain.steps.map((s) => {
    if (s.status !== 'pending') return s
    if (s.stepNumber === 1) return s // handled by UI
    const scheduledAt = new Date(s.scheduledAt)
    if (now > scheduledAt) {
      missed.push(s)
      return { ...s, status: 'escalated' as const, sentAt: now.toISOString() }
    }
    return s
  })

  if (missed.length > 0) {
    const nextPending = updatedSteps.find((s) => s.status === 'pending')
    await updateEscalationChain(chainId, {
      steps: updatedSteps,
      currentStep: nextPending?.stepNumber ?? chain.currentStep,
    })
  }

  return missed
}

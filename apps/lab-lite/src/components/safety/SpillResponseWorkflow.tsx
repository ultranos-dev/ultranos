'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CountdownTimer } from './CountdownTimer'
import { getSpillProtocol } from '@/lib/safety/spill-protocols'
import { startSpillIncident, completeStep, completeSpillIncident } from '@/lib/safety/spill-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { SpillType, RiskTier } from '@/types/spill-protocol'
import type { SpillIncident, SpillProtocol, DecontaminationStep } from '@/types/spill-protocol'

/**
 * SpillResponseWorkflow — Story 47.5
 *
 * Full-screen guided step-by-step spill response workflow.
 *
 * Flow:
 *   0. Location input
 *   1. PPE checklist (pre-step — all items must be confirmed before proceeding)
 *   2..N. Decontamination steps (one per screen, with optional countdown for contact times)
 *   N+1. Notes + completion
 *
 * Emergency UI principles: large touch targets (64px), large text (18px+),
 * high contrast, one step per screen, warnings in red alert boxes.
 * RTL-safe via logical CSS properties.
 */

interface SpillResponseWorkflowProps {
  spillType: SpillType
  onClose: () => void
  onComplete?: (incidentId: string) => void
}

// Risk tier → header color mapping
const RISK_COLORS: Record<RiskTier, string> = {
  [RiskTier.LOW]: '#1d4ed8',
  [RiskTier.MODERATE]: '#b45309',
  [RiskTier.HIGH]: '#ea580c',
  [RiskTier.CRITICAL]: '#dc2626',
}

const styles = {
  container: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 10000,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
  },
  body: {
    flex: 1,
    padding: '1.5rem',
    maxWidth: '40rem',
    margin: '0 auto',
    width: '100%',
  },
  stepTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 1rem 0',
  },
  stepText: {
    fontSize: '1.125rem',
    color: '#1f2937',
    lineHeight: 1.6,
    margin: '0 0 1rem 0',
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '1rem 2rem',
    fontSize: '1.125rem',
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: '56px',
    width: '100%',
    marginTop: '1.5rem',
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '48px',
    marginTop: '1rem',
  },
  warningBox: {
    backgroundColor: '#fee2e2',
    border: '2px solid #dc2626',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '1rem',
  },
  warningText: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#991b1b',
    margin: 0,
  },
}

type WorkflowPhase =
  | { kind: 'location' }
  | { kind: 'ppe' }
  | { kind: 'step'; stepIndex: number }
  | { kind: 'notes' }
  | { kind: 'complete'; incidentId: string }

export function SpillResponseWorkflow({ spillType, onClose, onComplete }: SpillResponseWorkflowProps) {
  const t = useTranslations()
  const session = useAuthSessionStore((s) => s.session)
  const techId = session?.practitionerId ?? session?.userId ?? 'unknown'

  const protocol: SpillProtocol = getSpillProtocol(spillType)
  const headerColor = RISK_COLORS[protocol.riskTier]

  const [phase, setPhase] = useState<WorkflowPhase>({ kind: 'location' })
  const [location, setLocation] = useState('')
  const [ppeChecked, setPpeChecked] = useState<Record<number, boolean>>({})
  const [incident, setIncident] = useState<SpillIncident | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Total screens: location + PPE + N steps + notes
  const totalScreens = 1 + 1 + protocol.steps.length + 1
  const currentScreen = (() => {
    if (phase.kind === 'location') return 1
    if (phase.kind === 'ppe') return 2
    if (phase.kind === 'step') return 3 + phase.stepIndex
    if (phase.kind === 'notes') return totalScreens
    return totalScreens
  })()

  const allPpeChecked = protocol.ppe
    .filter((p) => p.required)
    .every((_, i) => ppeChecked[i])

  // Start incident when location is confirmed
  const handleLocationConfirm = async () => {
    if (!location.trim()) return
    try {
      const inc = await startSpillIncident({ spillType, location: location.trim(), techId })
      setIncident(inc)
      setPhase({ kind: 'ppe' })
    } catch {
      // Silent — never block emergency workflow
      setPhase({ kind: 'ppe' })
    }
  }

  // Confirm PPE and move to first step
  const handlePpeConfirm = () => {
    setPhase({ kind: 'step', stepIndex: 0 })
  }

  // Confirm a decontamination step
  const handleStepConfirm = async (step: DecontaminationStep) => {
    if (incident) {
      try {
        await completeStep(incident.id, step.order, techId)
      } catch {
        // Silent — never block emergency workflow
      }
    }

    const nextIndex = (phase as { kind: 'step'; stepIndex: number }).stepIndex + 1
    if (nextIndex < protocol.steps.length) {
      setPhase({ kind: 'step', stepIndex: nextIndex })
    } else {
      setPhase({ kind: 'notes' })
    }
  }

  // Complete the incident
  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      if (incident) {
        await completeSpillIncident(incident.id, notes, techId)
        setPhase({ kind: 'complete', incidentId: incident.id })
        onComplete?.(incident.id)
      } else {
        setPhase({ kind: 'complete', incidentId: 'unknown' })
      }
    } catch {
      setPhase({ kind: 'complete', incidentId: incident?.id ?? 'unknown' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const goBack = () => {
    if (phase.kind === 'ppe') setPhase({ kind: 'location' })
    else if (phase.kind === 'step') {
      const idx = phase.stepIndex
      if (idx === 0) setPhase({ kind: 'ppe' })
      else setPhase({ kind: 'step', stepIndex: idx - 1 })
    } else if (phase.kind === 'notes') {
      setPhase({ kind: 'step', stepIndex: protocol.steps.length - 1 })
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={styles.container} dir="auto">
      {/* Header */}
      <div
        style={{
          backgroundColor: headerColor,
          color: 'white',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
            {t(`safety.spill.types.${spillType.toLowerCase().replace(/_/g, '')}` as any)} —{' '}
            {t(`safety.spill.riskTiers.${protocol.riskTier.toLowerCase()}` as any)}{' '}
            {t('safety.spill.workflow.riskLabel')}
          </div>
          {phase.kind !== 'complete' && (
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
              {t('safety.spill.workflow.stepOf', { current: currentScreen, total: totalScreens })}
            </div>
          )}
        </div>
        {/* Progress dots */}
        {phase.kind !== 'complete' && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '120px', justifyContent: 'flex-end' }}>
            {Array.from({ length: Math.min(totalScreens, 12) }, (_, i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: i + 1 <= currentScreen ? 'white' : 'rgba(255,255,255,0.35)',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={styles.body}>

        {/* ------------------------------------------------------------------ */}
        {/* Phase: Location input */}
        {/* ------------------------------------------------------------------ */}
        {phase.kind === 'location' && (
          <div>
            <h2 style={styles.stepTitle}>{t('safety.spill.workflow.locationTitle')}</h2>
            <p style={styles.stepText}>{t('safety.spill.workflow.locationPrompt')}</p>
            <input
              type="text"
              autoFocus
              placeholder={t('safety.spill.workflow.locationPlaceholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && location.trim()) void handleLocationConfirm() }}
              style={{
                width: '100%',
                padding: '0.875rem',
                fontSize: '1.125rem',
                border: '2px solid #d1d5db',
                borderRadius: '0.5rem',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => void handleLocationConfirm()}
              disabled={!location.trim()}
              style={{
                ...styles.confirmButton,
                opacity: location.trim() ? 1 : 0.5,
                cursor: location.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {t('safety.spill.workflow.next')}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Phase: PPE Checklist */}
        {/* ------------------------------------------------------------------ */}
        {phase.kind === 'ppe' && (
          <div>
            <h2 style={styles.stepTitle}>{t('safety.spill.workflow.ppeTitle')}</h2>
            <p style={styles.stepText}>{t('safety.spill.workflow.ppeSubtitle')}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {protocol.ppe.map((ppe, i) => (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.875rem',
                    padding: '0.875rem 1rem',
                    borderRadius: '0.5rem',
                    backgroundColor: ppeChecked[i] ? '#f0fdf4' : '#f9fafb',
                    border: `2px solid ${ppeChecked[i] ? '#16a34a' : '#e5e7eb'}`,
                    cursor: 'pointer',
                    minHeight: '48px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!ppeChecked[i]}
                    onChange={(e) => setPpeChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                    style={{ width: '20px', height: '20px', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }}
                  />
                  <div>
                    <span style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                      {t(`safety.spill.ppe.${ppe.item}` as any)}
                      {!ppe.required && (
                        <span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#6b7280', marginInlineStart: '0.5rem' }}>
                          ({t('safety.spill.ppe.optional')})
                        </span>
                      )}
                    </span>
                    {ppe.notes && (
                      <p style={{ fontSize: '0.9375rem', color: '#92400e', margin: '0.25rem 0 0 0' }}>
                        {ppe.notes}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {!allPpeChecked && (
              <div style={{ ...styles.warningBox, backgroundColor: '#fef3c7', borderColor: '#d97706' }}>
                <p style={{ ...styles.warningText, color: '#92400e' }}>
                  {t('safety.spill.workflow.ppeRequired')}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handlePpeConfirm}
              disabled={!allPpeChecked}
              style={{
                ...styles.confirmButton,
                opacity: allPpeChecked ? 1 : 0.5,
                cursor: allPpeChecked ? 'pointer' : 'not-allowed',
              }}
            >
              {t('safety.spill.workflow.ppeConfirm')}
            </button>
            <button type="button" onClick={goBack} style={styles.backButton}>
              {t('safety.spill.workflow.back')}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Phase: Decontamination steps */}
        {/* ------------------------------------------------------------------ */}
        {phase.kind === 'step' && (() => {
          const step = protocol.steps[phase.stepIndex]
          const isLastStep = phase.stepIndex === protocol.steps.length - 1
          return (
            <div>
              {/* Step number badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: headerColor,
                  color: 'white',
                  borderRadius: '9999px',
                  padding: '0.25rem 0.875rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginBottom: '0.75rem',
                }}
              >
                {t('safety.spill.workflow.stepLabel', { n: step.order, total: protocol.steps.length })}
              </div>

              <h2 style={styles.stepTitle}>
                {t('safety.spill.workflow.stepInstructionTitle')}
              </h2>

              {/* Warnings for this step — displayed before instruction */}
              {protocol.additionalWarnings.length > 0 && phase.stepIndex === 0 && (
                protocol.additionalWarnings.map((warning, i) => (
                  <div key={i} style={styles.warningBox}>
                    <p style={styles.warningText}>⚠️ {warning}</p>
                  </div>
                ))
              )}

              {/* Step instruction */}
              <p style={styles.stepText}>{step.instruction}</p>

              {/* Notes */}
              {step.notes && (
                <div
                  style={{
                    backgroundColor: '#f0f9ff',
                    border: '1px solid #7dd3fc',
                    borderRadius: '0.375rem',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <p style={{ fontSize: '0.9375rem', color: '#0c4a6e', margin: 0 }}>
                    {step.notes}
                  </p>
                </div>
              )}

              {/* Contact time countdown */}
              {step.contactTimeMinutes != null && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ ...styles.stepText, fontWeight: 600 }}>
                    {t('safety.spill.workflow.contactTime', { minutes: step.contactTimeMinutes })}
                  </p>
                  {step.agentName && (
                    <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '0.75rem' }}>
                      {t('safety.spill.workflow.agent')}: <strong>{step.agentName}</strong>
                    </p>
                  )}
                  <CountdownTimer
                    minutes={step.contactTimeMinutes}
                    onSkip={() => void handleStepConfirm(step)}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleStepConfirm(step)}
                style={styles.confirmButton}
              >
                {isLastStep
                  ? t('safety.spill.workflow.lastStepDone')
                  : t('safety.spill.workflow.stepDone')}
              </button>
              <button type="button" onClick={goBack} style={styles.backButton}>
                {t('safety.spill.workflow.back')}
              </button>
            </div>
          )
        })()}

        {/* ------------------------------------------------------------------ */}
        {/* Phase: Notes + completion */}
        {/* ------------------------------------------------------------------ */}
        {phase.kind === 'notes' && (
          <div>
            <h2 style={styles.stepTitle}>{t('safety.spill.workflow.notesTitle')}</h2>
            <p style={styles.stepText}>{t('safety.spill.workflow.notesSubtitle')}</p>
            <textarea
              placeholder={t('safety.spill.workflow.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '0.875rem',
                fontSize: '1.125rem',
                border: '2px solid #d1d5db',
                borderRadius: '0.5rem',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={isSubmitting}
              style={{ ...styles.confirmButton, backgroundColor: '#1d4ed8', opacity: isSubmitting ? 0.6 : 1 }}
            >
              {t('safety.spill.workflow.complete')}
            </button>
            <button type="button" onClick={goBack} style={styles.backButton}>
              {t('safety.spill.workflow.back')}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Phase: Complete */}
        {/* ------------------------------------------------------------------ */}
        {phase.kind === 'complete' && (
          <div>
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '2px solid #16a34a',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
              <h2 style={{ ...styles.stepTitle, color: '#15803d', textAlign: 'center' }}>
                {t('safety.spill.workflow.completedTitle')}
              </h2>
              <p style={{ ...styles.stepText, color: '#166534', textAlign: 'center', marginBottom: 0 }}>
                {t('safety.spill.workflow.completedSubtitle')}
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ fontSize: '0.9375rem', color: '#374151', margin: 0 }}>
                {t('safety.spill.workflow.incidentLogged')}:{' '}
                <code style={{ fontSize: '0.875rem', backgroundColor: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                  {(phase as { kind: 'complete'; incidentId: string }).incidentId.slice(0, 16)}…
                </code>
              </p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.5rem 0 0 0' }}>
                {t('safety.spill.workflow.syncPending')}
              </p>
            </div>

            {/* Clearance time reminder */}
            <div
              style={{
                backgroundColor: '#fef3c7',
                border: '2px solid #d97706',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ fontWeight: 700, color: '#92400e', margin: '0 0 0.25rem 0', fontSize: '1rem' }}>
                {t('safety.spill.workflow.clearanceTitle')}
              </p>
              <p style={{ color: '#92400e', margin: 0, fontSize: '1rem' }}>
                {t('safety.spill.workflow.clearanceNote', { minutes: protocol.clearanceTimeMinutes })}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{ ...styles.confirmButton, backgroundColor: '#1d4ed8' }}
            >
              {t('safety.spill.workflow.done')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

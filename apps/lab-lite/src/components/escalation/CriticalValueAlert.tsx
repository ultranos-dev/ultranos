'use client'

/**
 * CriticalValueAlert — Story 48.4 (AC: 2)
 *
 * Full-screen modal displayed when a critical lab value is detected.
 * CANNOT be dismissed by clicking outside or pressing Escape.
 * Requires explicit acknowledgment (checkbox + button) before the tech can proceed.
 *
 * PHI: shows patient first name + age ONLY (CLAUDE.md Rule #7).
 * Audio: plays a repeating tone until acknowledged. Web Audio API with <audio> fallback.
 * RTL: logical CSS properties throughout. Warning icon does NOT mirror.
 * Accessibility: focus trap — Tab cycles only through checkbox and button.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { acknowledgeStep } from '@/lib/escalation-manager'
import { reportEscalationEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { EscalationChain } from '@/lib/db'
import type { CriticalValueResult } from '@/lib/critical-value-engine'

interface CriticalValueAlertProps {
  chains: EscalationChain[]             // all chains sharing the same result (may be multiple criticals)
  criticalValues: CriticalValueResult[] // parallel to chains, same length
  patientFirstName: string              // first name only — CLAUDE.md Rule #7
  patientAge: number
  orderingPhysicianName: string
  onAcknowledged: () => void
}

/** Warning triangle — semantic medical alert icon. Does NOT mirror in RTL. */
function WarningIcon() {
  return (
    <AlertTriangle
      size={64}
      aria-hidden="true"
      style={{ transform: 'none' }} // explicit: never mirror this icon
    />
  )
}

export function CriticalValueAlert({
  chains,
  criticalValues,
  patientFirstName,
  patientAge,
  orderingPhysicianName,
  onAcknowledged,
}: CriticalValueAlertProps) {
  const t = useTranslations('escalation.alert')
  const session = useAuthSessionStore((s) => s.session)
  const [checked, setChecked] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)

  const checkboxRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const soundButtonRef = useRef<HTMLButtonElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioBeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Focus trap: on mount, focus the checkbox
  useEffect(() => {
    checkboxRef.current?.focus()
  }, [])

  // Focus trap: constrain Tab to checkbox and button only
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault() // Block Escape dismissal
      return
    }
    if (e.key === 'Tab') {
      const focusable = [
        !soundEnabled ? soundButtonRef.current : null,
        checkboxRef.current,
        buttonRef.current,
      ].filter((el): el is HTMLElement => el !== null)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
  }, [])

  // Audio: attempt to play on first user interaction (browser autoplay restrictions)
  const startAudio = useCallback(() => {
    if (soundEnabled) return
    setSoundEnabled(true)

    // Try Web Audio API first
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx

      function playBeep() {
        if (!audioCtxRef.current) return
        const oscillator = audioCtxRef.current.createOscillator()
        const gainNode = audioCtxRef.current.createGain()
        oscillator.connect(gainNode)
        gainNode.connect(audioCtxRef.current.destination)
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(880, audioCtxRef.current.currentTime)
        gainNode.gain.setValueAtTime(0.3, audioCtxRef.current.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.5)
        oscillator.start(audioCtxRef.current.currentTime)
        oscillator.stop(audioCtxRef.current.currentTime + 0.5)
      }

      playBeep()
      // Repeat every 2 seconds
      audioBeatIntervalRef.current = setInterval(playBeep, 2000)
    } catch {
      // Fallback: <audio> element
      if (audioRef.current) {
        audioRef.current.loop = true
        void audioRef.current.play().catch(() => {
          // Autoplay blocked — user must interact
        })
      }
    }
  }, [soundEnabled])

  // Stop audio on cleanup
  useEffect(() => {
    return () => {
      clearInterval(audioBeatIntervalRef.current ?? undefined)
      audioBeatIntervalRef.current = null
      audioCtxRef.current?.close()
      audioRef.current?.pause()
    }
  }, [])

  // Prevent background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const handleAcknowledge = useCallback(async () => {
    if (!checked || acknowledging) return
    setAcknowledging(true)

    const techId = session?.userId ?? 'unknown'
    const now = new Date().toISOString()

    try {
      // Acknowledge step 1 (tech alert) for each chain from this result
      for (const chain of chains) {
        await acknowledgeStep(chain.chainId, 1, techId)
        reportEscalationEvent({
          action: 'ESCALATION_STEP_ACKNOWLEDGED',
          chainId: chain.chainId,
          stepNumber: 1,
          recipientRole: 'lab_tech',
          notificationType: 'tech_alert',
          timestamp: now,
          resultId: chain.resultId,
        })
      }

      // Stop audio
      audioCtxRef.current?.close()
      audioRef.current?.pause()

      onAcknowledged()
    } catch {
      setAcknowledging(false)
    }
  }, [checked, acknowledging, chains, session, onAcknowledged])

  const timestamp = new Date(chains[0]?.createdAt ?? new Date()).toLocaleTimeString()

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="critical-alert-title"
      aria-describedby="critical-alert-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-950"
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      {/* Hidden audio fallback */}
      <audio ref={audioRef} aria-hidden="true" preload="auto">
        <source src="/sounds/critical-alert.mp3" type="audio/mpeg" />
      </audio>

      <div className="w-full max-w-lg mx-4 rounded-2xl border-4 border-red-500 bg-card p-8 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-red-600">
            <WarningIcon />
          </span>
          <h1
            id="critical-alert-title"
            className="text-3xl font-black text-red-700 uppercase tracking-wide"
          >
            {t('title')}
          </h1>
        </div>

        {/* Enable sound prompt (shown before first interaction) */}
        {!soundEnabled && (
          <button
            ref={soundButtonRef}
            type="button"
            className="mt-4 w-full rounded-lg border border-red-300 bg-red-50 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            onClick={startAudio}
          >
            {t('enableSound')}
          </button>
        )}

        {/* Critical values */}
        <div id="critical-alert-desc" className="mt-6 space-y-3">
          {criticalValues.map((cv, i) => (
            <div key={i} className="rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3">
              <p className="text-lg font-bold text-red-800">
                {cv.analyte}:{' '}
                <span className="font-black">
                  {cv.value} {cv.unit}
                </span>
              </p>
              <p className="text-sm text-red-600">
                {cv.direction === 'high'
                  ? t('criticalHigh', { threshold: cv.threshold, unit: cv.unit })
                  : t('criticalLow', { threshold: cv.threshold, unit: cv.unit })}
              </p>
            </div>
          ))}
        </div>

        {/* Patient info — first name + age only (CLAUDE.md Rule #7) */}
        <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-foreground">
          <div className="flex justify-between">
            <span className="font-medium">{t('patient')}:</span>
            <span>
              {patientFirstName}, {patientAge} {t('yearsOld')}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-medium">{t('orderingPhysician')}:</span>
            <span>{orderingPhysicianName}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-medium">{t('time')}:</span>
            <span>{timestamp}</span>
          </div>
        </div>

        {/* Mandatory acknowledgment */}
        <div className="mt-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              ref={checkboxRef}
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-5 w-5 flex-shrink-0 accent-red-600"
              aria-required="true"
            />
            <span className="text-sm font-medium text-foreground leading-snug">
              {t('acknowledgmentText')}
            </span>
          </label>

          <button
            ref={buttonRef}
            type="button"
            disabled={!checked || acknowledging}
            onClick={handleAcknowledge}
            className="w-full rounded-xl bg-red-600 py-3 text-base font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-disabled={!checked || acknowledging}
          >
            {acknowledging ? t('acknowledging') : t('acknowledgeButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

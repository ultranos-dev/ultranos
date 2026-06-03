'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'

/**
 * CountdownTimer — Story 47.5
 *
 * Visual countdown for mandatory decontamination wait times (contact time).
 * Shows:
 *   - Circular progress ring that depletes over time
 *   - MM:SS countdown label
 *   - Audio notification when time reaches zero (if device supports)
 *
 * The timer is optional — the tech can skip it to proceed without waiting.
 * Timer state is component-local — not persisted to Dexie.
 *
 * Design: no animations that delay information; high contrast; large text.
 */

interface CountdownTimerProps {
  /** Total duration in minutes */
  minutes: number
  onComplete?: () => void
  onSkip?: () => void
}

const RING_RADIUS = 54
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function CountdownTimer({ minutes, onComplete, onSkip }: CountdownTimerProps) {
  const t = useTranslations()
  const totalSeconds = minutes * 60
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)

  const playCompletionSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      audioRef.current = ctx

      // Simple two-tone beep to signal completion
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.frequency.value = 880
      osc2.frequency.value = 1100
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)

      osc1.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.5)
      osc2.start(ctx.currentTime + 0.6)
      osc2.stop(ctx.currentTime + 1.5)
    } catch {
      // Audio unavailable — silent fail
    }
  }, [])

  useEffect(() => {
    if (!isRunning || secondsLeft <= 0) return

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setIsRunning(false)
          setIsDone(true)
          playCompletionSound()
          onComplete?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, secondsLeft, onComplete, playCompletionSound])

  const progressRatio = secondsLeft / totalSeconds
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progressRatio)

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timeLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const ringColor = isDone ? '#16a34a' : secondsLeft <= 60 ? '#dc2626' : '#f59e0b'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.75rem',
        border: `2px solid ${isDone ? '#16a34a' : '#e5e7eb'}`,
      }}
      role="timer"
      aria-live="polite"
      aria-label={isDone ? t('safety.spill.timer.complete') : t('safety.spill.timer.remaining', { time: timeLabel })}
    >
      {/* Circular progress ring */}
      <svg
        width="128"
        height="128"
        viewBox="0 0 128 128"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx="64"
          cy="64"
          r={RING_RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        {/* Progress arc */}
        <circle
          cx="64"
          cy="64"
          r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 64 64)"
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
        />
        {/* Time label in center */}
        <text
          x="64"
          y="64"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill={isDone ? '#16a34a' : '#111827'}
          fontFamily="monospace"
        >
          {isDone ? '✓' : timeLabel}
        </text>
      </svg>

      {/* Status text */}
      <p
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: isDone ? '#16a34a' : '#374151',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {isDone
          ? t('safety.spill.timer.complete')
          : isRunning
            ? t('safety.spill.timer.running', { minutes })
            : t('safety.spill.timer.start', { minutes })}
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {!isDone && !isRunning && (
          <button
            type="button"
            onClick={() => setIsRunning(true)}
            style={{
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            {t('safety.spill.timer.startButton')}
          </button>
        )}

        {isRunning && (
          <button
            type="button"
            onClick={() => setIsRunning(false)}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            {t('safety.spill.timer.pauseButton')}
          </button>
        )}

        {/* Always show skip to avoid blocking tech in emergency */}
        {!isDone && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              backgroundColor: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.25rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            {t('safety.spill.timer.skipButton')}
          </button>
        )}
      </div>
    </div>
  )
}

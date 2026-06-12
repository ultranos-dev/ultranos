'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ConfidenceLevel, shouldAutoEscalate } from '@/lib/confidence'

export interface ConfidenceIndicatorProps {
  level: ConfidenceLevel
  score?: number
  context: string
  onAcknowledge?: () => void
  onEscalate?: () => void
  showExplanation?: boolean
}

/**
 * Confidence Inversion Principle indicator — Story 53.5
 *
 * HIGH  → subtle green badge (no animation, expandable)
 * MEDIUM → yellow full-width banner with explanation
 * LOW   → red full-screen overlay, dismiss requires explicit acknowledgment
 *
 * On LOW render, auto-escalation fires immediately if onEscalate is provided
 * and shouldAutoEscalate() returns true.
 *
 * All text sourced from useTranslations('confidence') for i18n + RTL support.
 */
export function ConfidenceIndicator({
  level,
  score,
  context,
  onAcknowledge,
  onEscalate,
}: ConfidenceIndicatorProps) {
  const t = useTranslations('confidence')
  const [dismissed, setDismissed] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Clamp score to [0, 1] for display — raw AI scores may occasionally exceed bounds
  const displayScore = score !== undefined ? Math.min(1, Math.max(0, score)) : undefined

  // Focus trap for LOW overlay — moves focus to first button on mount, cycles Tab within overlay
  useEffect(() => {
    if (level !== ConfidenceLevel.LOW || dismissed) return
    const el = overlayRef.current
    if (!el) return
    const firstBtn = el.querySelector<HTMLElement>('button')
    firstBtn?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = Array.from(el!.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [level, dismissed])

  // Auto-escalate on render when confidence is at or below the configured threshold.
  // Uses shouldAutoEscalate() so raising AUTO_ESCALATION_THRESHOLD to MEDIUM
  // automatically enables escalation for MEDIUM without changing this component.
  useEffect(() => {
    if (shouldAutoEscalate(level) && onEscalate) {
      onEscalate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on mount / level change
  }, [level])

  if (level === ConfidenceLevel.HIGH) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200"
        aria-label={t('high.label')}
      >
        {/* Checkmark icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="5.5" fill="#dcfce7" stroke="#16a34a" />
          <polyline
            points="3.5,6 5,7.5 8.5,4"
            stroke="#16a34a"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('high.label')}
        {displayScore !== undefined && (
          <span className="text-green-500 font-normal">({Math.round(displayScore * 100)}%)</span>
        )}
      </span>
    )
  }

  if (level === ConfidenceLevel.MEDIUM) {
    return (
      <div
        data-testid="medium-banner"
        role="alert"
        className="flex items-start gap-3 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
      >
        {/* Warning icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="shrink-0 mt-0.5 text-amber-600"
        >
          <path
            d="M9.05 3.22L2.27 15a1 1 0 0 0 .88 1.5h13.7a1 1 0 0 0 .88-1.5L10.95 3.22a1.05 1.05 0 0 0-1.9 0Z"
            fill="#fef3c7"
            stroke="#d97706"
            strokeWidth="1.2"
          />
          <line x1="10" y1="8" x2="10" y2="12" stroke="#d97706" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="14" r="0.75" fill="#d97706" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">{t('medium.label')}</p>
          <p className="text-sm text-amber-800 mt-0.5">{t('medium.explanation')}</p>
          {context && (
            <p className="text-xs text-amber-700 mt-1">{context}</p>
          )}
          {displayScore !== undefined && (
            <p className="text-xs text-amber-600 mt-0.5">
              {Math.round(displayScore * 100)}%
            </p>
          )}
        </div>
      </div>
    )
  }

  // LOW confidence — full-screen overlay
  if (dismissed) return null

  return (
    <div
      ref={overlayRef}
      data-testid="low-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="low-confidence-heading"
      aria-describedby="low-confidence-body"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-900/80 backdrop-blur-sm"
    >
      <div className="mx-4 max-w-lg w-full rounded-xl bg-white shadow-2xl border-2 border-red-500 p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5" />
              <line x1="11" y1="6" x2="11" y2="13" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
              <circle cx="11" cy="16" r="1" fill="#dc2626" />
            </svg>
          </div>
          <h2
            id="low-confidence-heading"
            className="text-base font-bold text-red-900"
          >
            {t('low.label')}
          </h2>
        </div>

        {/* Body */}
        <p id="low-confidence-body" className="text-sm text-red-800">
          {t('low.body')}
        </p>
        {context && (
          <p className="text-xs text-neutral-600 bg-neutral-50 rounded-md px-3 py-2">
            {context}
          </p>
        )}
        {displayScore !== undefined && (
          <p className="text-xs text-red-600 font-medium">
            {Math.round(displayScore * 100)}%
          </p>
        )}

        {/* Action buttons — cannot dismiss without explicit acknowledgment */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setDismissed(true)
              onAcknowledge?.()
            }}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition-colors"
          >
            {t('low.acknowledge')}
          </button>
          <button
            type="button"
            onClick={() => onEscalate?.()}
            className="w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 transition-colors"
          >
            {t('low.escalate')}
          </button>
        </div>
      </div>
    </div>
  )
}

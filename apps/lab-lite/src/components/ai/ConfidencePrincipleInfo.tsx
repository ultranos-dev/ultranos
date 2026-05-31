'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Explains the Confidence Inversion Principle to end users.
 *
 * Renders as:
 *   - A persistent info (ℹ) icon that opens a tooltip on click,
 *     usable inline next to any AI confidence indicator.
 *   - A standalone panel for the Lab Settings page under "AI Behavior".
 *
 * Story 53.5 — Task 6 (AC: 5, 9)
 */

interface ConfidencePrincipleInfoProps {
  /** 'tooltip' → inline icon + popover; 'panel' → expanded card (for settings page) */
  variant?: 'tooltip' | 'panel'
}

export function ConfidencePrincipleInfo({ variant = 'tooltip' }: ConfidencePrincipleInfoProps) {
  const t = useTranslations('confidence')
  const [open, setOpen] = useState(false)

  if (variant === 'panel') {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <InfoIcon className="text-blue-600 shrink-0" />
          <h3 className="text-sm font-semibold text-blue-900">{t('principle.title')}</h3>
        </div>
        <p className="text-sm text-blue-800 leading-relaxed">{t('principle.body')}</p>
      </div>
    )
  }

  // Tooltip variant — inline icon + popover
  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label={t('principle.title')}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <InfoIcon />
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <button
            type="button"
            aria-hidden="true"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            role="tooltip"
            className="absolute z-20 start-1/2 -translate-x-1/2 mt-2 w-72 rounded-lg border border-blue-200 bg-white shadow-lg p-4"
          >
            <p className="text-xs font-semibold text-blue-900 mb-1">{t('principle.title')}</p>
            <p className="text-xs text-neutral-700 leading-relaxed">{t('principle.body')}</p>
          </div>
        </>
      )}
    </div>
  )
}

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="7" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.5" r="0.9" fill="currentColor" />
    </svg>
  )
}

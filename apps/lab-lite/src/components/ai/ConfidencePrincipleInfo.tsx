'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from '@ultranos/ui-kit/icons'

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
      <div className="rounded-lg border border-primary bg-primary/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info size={16} className="text-primary shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-primary">{t('principle.title')}</h3>
        </div>
        <p className="text-sm text-primary leading-relaxed">{t('principle.body')}</p>
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
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info size={16} aria-hidden="true" />
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
            className="absolute z-20 left-1/2 -translate-x-1/2 mt-2 w-72 rounded-lg border border-primary bg-card shadow-lg p-4"
          >
            <p className="text-xs font-semibold text-primary mb-1">{t('principle.title')}</p>
            <p className="text-xs text-foreground leading-relaxed">{t('principle.body')}</p>
          </div>
        </>
      )}
    </div>
  )
}


'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — Pictographic Sample Type Selector
// Grid of large icon cards (min 80x80px icon area). Comprehension relies on
// icons, not text (CHW may have limited reading ability).
//
// Icon rule (CLAUDE.md): medical/semantic icons must NOT mirror in RTL.
// These icons represent physical objects — they use DirectionalIcon with
// category="medical" so they never flip.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import type { CHWSampleType } from '@/types/chw-mode'

interface SampleTypeOption {
  type: CHWSampleType
  // Inline SVG icons — these medical icons are intentionally NOT from Lucide
  // because we need specific color fills and sizes that Lucide doesn't provide.
  icon: React.ReactNode
  bgColor: string
  borderColor: string
  selectedBg: string
}

// Medical icons as inline SVGs — NEVER mirror (physical objects, not directional)
const SAMPLE_TYPES: SampleTypeOption[] = [
  {
    type: 'blood',
    icon: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        {/* Blood tube */}
        <rect x="20" y="6" width="16" height="36" rx="8" fill="#ef4444" />
        <rect x="22" y="8" width="12" height="6" rx="3" fill="#fca5a5" opacity="0.6" />
        <rect x="24" y="44" width="8" height="6" rx="4" fill="#dc2626" />
      </svg>
    ),
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    selectedBg: 'bg-red-100 border-red-500',
  },
  {
    type: 'urine',
    icon: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        {/* Urine cup */}
        <path d="M14 12h28l-4 32H18L14 12z" fill="#fbbf24" />
        <path d="M14 12h28" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 20h22" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <rect x="22" y="6" width="12" height="8" rx="2" fill="#f59e0b" />
      </svg>
    ),
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    selectedBg: 'bg-yellow-100 border-yellow-500',
  },
  {
    type: 'swab',
    icon: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        {/* Cotton swab */}
        <rect x="26" y="4" width="4" height="48" rx="2" fill="#e5e7eb" />
        <ellipse cx="28" cy="8" rx="8" ry="6" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.5" />
        <ellipse cx="28" cy="48" rx="8" ry="6" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.5" />
      </svg>
    ),
    bgColor: 'bg-muted',
    borderColor: 'border-border',
    selectedBg: 'bg-muted border-gray-500',
  },
  {
    type: 'stool',
    icon: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        {/* Stool container */}
        <rect x="12" y="16" width="32" height="28" rx="6" fill="#92400e" />
        <rect x="16" y="20" width="24" height="4" rx="2" fill="#b45309" opacity="0.5" />
        <rect x="14" y="10" width="28" height="8" rx="4" fill="#78350f" />
        <circle cx="28" cy="14" r="4" fill="#a16207" />
      </svg>
    ),
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    selectedBg: 'bg-amber-100 border-amber-500',
  },
]

interface Props {
  onConfirm: (sampleType: CHWSampleType) => void
}

export function SampleTypeSelector({ onConfirm }: Props) {
  const t = useTranslations('chw.sampleType')
  const [selected, setSelected] = useState<CHWSampleType | null>(null)

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-center text-2xl font-bold text-foreground">{t('title')}</h2>

      <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label={t('title')}>
        {SAMPLE_TYPES.map((option) => {
          const isSelected = selected === option.type
          return (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(option.type)}
              className={`
                flex min-h-[140px] flex-col items-center justify-center gap-3
                rounded-2xl border-2 p-4 transition-all
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
                ${isSelected
                  ? option.selectedBg + ' ring-2 ring-offset-2 ring-primary'
                  : option.bgColor + ' ' + option.borderColor + ' hover:opacity-80'
                }
              `}
            >
              {/* Medical icon: DirectionalIcon with category="medical" prevents RTL mirror */}
              <DirectionalIcon category="medical">
                {option.icon}
              </DirectionalIcon>
              <span className="text-lg font-semibold text-foreground">
                {t(option.type)}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onConfirm(selected)}
        className="mt-2 min-h-[56px] w-full rounded-xl bg-primary px-6 py-4 text-xl font-semibold text-white hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('confirm')}
      </button>
    </div>
  )
}

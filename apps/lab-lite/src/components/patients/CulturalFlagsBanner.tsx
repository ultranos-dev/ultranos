'use client'

import { useTranslations } from 'next-intl'
import type { CulturalFlag } from '@/lib/cultural-flags'
import {
  CulturalFlagType,
  CULTURAL_FLAG_COLORS,
  FLAG_ICON_PATHS,
  flagLabelKey,
} from '@/lib/cultural-flags'

interface CulturalFlagsBannerProps {
  flags: CulturalFlag[]
  onEditClick?: () => void
}

function FlagIcon({ type }: { type: CulturalFlagType }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 ${CULTURAL_FLAG_COLORS.icon}`}
      aria-hidden="true"
    >
      <path d={FLAG_ICON_PATHS[type]} />
    </svg>
  )
}

/**
 * Displays active cultural flags as a horizontal strip of icon+text badges.
 * Renders BELOW the allergy banner (CLAUDE.md Rule #4 — allergies first).
 * Uses blue/purple accent (NOT red — cultural flags are guidance, not warnings).
 * Non-dismissible during the encounter.
 * Renders nothing if no active flags exist.
 */
export function CulturalFlagsBanner({ flags, onEditClick }: CulturalFlagsBannerProps) {
  const t = useTranslations()
  const activeFlags = flags.filter((f) => f.isActive)

  if (activeFlags.length === 0) return null

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${CULTURAL_FLAG_COLORS.bg} ${CULTURAL_FLAG_COLORS.border}`}
      data-testid="cultural-flags-banner"
      role="status"
      aria-label={t('culturalFlags.title')}
    >
      {activeFlags.map((flag) => (
        <span
          key={flag.type === CulturalFlagType.CUSTOM ? `custom-${flag.customDescription}` : flag.type}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${CULTURAL_FLAG_COLORS.bg} ${CULTURAL_FLAG_COLORS.text}`}
          data-testid={`cultural-flag-${flag.type}`}
        >
          <FlagIcon type={flag.type} />
          {flag.type === CulturalFlagType.CUSTOM
            ? flag.customDescription
            : t(flagLabelKey(flag.type))}
        </span>
      ))}

      {onEditClick && (
        <button
          type="button"
          onClick={onEditClick}
          className={`ms-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${CULTURAL_FLAG_COLORS.text} hover:bg-indigo-100 dark:hover:bg-indigo-900`}
          aria-label={t('culturalFlags.editPreferences')}
          data-testid="cultural-flags-edit-btn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {t('culturalFlags.editPreferences')}
        </button>
      )}
    </div>
  )
}

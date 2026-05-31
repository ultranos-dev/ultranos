'use client'

/**
 * Story 43.2 — QC Advisory Badge
 *
 * Compact badge rendered in result list rows to indicate a QC warning.
 * Used alongside existing abnormality flag badges.
 *
 * RTL: uses logical CSS properties. Badge icons do NOT mirror (safety icons).
 */

import { useTranslations } from 'next-intl'
import type { QcWarning } from '@/lib/db'

interface QcAdvisoryBadgeProps {
  qcWarning: QcWarning
}

export function QcAdvisoryBadge({ qcWarning }: QcAdvisoryBadgeProps) {
  const t = useTranslations('qc')

  if (!qcWarning) return null

  const config: Record<
    NonNullable<QcWarning>,
    { label: string; bg: string; border: string; color: string }
  > = {
    QC_FAILING: {
      label: t('badge.qcAdvisory'),
      bg: '#fef2f2',
      border: '#fca5a5',
      color: '#991b1b',
    },
    QC_DRIFT: {
      label: t('badge.qcDrift'),
      bg: '#fff7ed',
      border: '#fdba74',
      color: '#9a3412',
    },
    NO_QC_TODAY: {
      label: t('badge.noQc'),
      bg: '#fffbeb',
      border: '#fcd34d',
      color: '#92400e',
    },
  }

  const { label, bg, border, color } = config[qcWarning]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        paddingInline: '0.375rem',
        paddingBlock: '0.125rem',
        borderRadius: '0.25rem',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

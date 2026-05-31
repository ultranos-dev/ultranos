'use client'

import type { PipelineStatus } from '@ultranos/shared-types'
import { useTranslations } from 'next-intl'

interface SampleStatusBadgeProps {
  status: PipelineStatus
}

const STATUS_CONFIG: Record<PipelineStatus, { labelKey: string; className: string }> = {
  received: { labelKey: 'received', className: 'bg-blue-50 text-blue-700' },
  'in-processing': { labelKey: 'inProcessing', className: 'bg-amber-50 text-amber-700' },
  completed: { labelKey: 'completed', className: 'bg-green-50 text-green-700' },
  reported: { labelKey: 'reported', className: 'bg-indigo-50 text-indigo-700' },
  rejected: { labelKey: 'rejected', className: 'bg-red-50 text-red-700' },
}

export function SampleStatusBadge({ status }: SampleStatusBadgeProps) {
  const t = useTranslations('samples.status')
  const { labelKey, className } = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      data-testid={`sample-status-badge-${status}`}
    >
      {t(labelKey)}
    </span>
  )
}

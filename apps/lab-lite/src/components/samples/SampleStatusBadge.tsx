'use client'

import type { PipelineStatus } from '@ultranos/shared-types'
import { useTranslations } from 'next-intl'

interface SampleStatusBadgeProps {
  status: PipelineStatus
}

const STATUS_CONFIG: Record<PipelineStatus, { labelKey: string; className: string }> = {
  received: { labelKey: 'received', className: 'bg-primary/10 text-primary' },
  'in-processing': { labelKey: 'inProcessing', className: 'bg-warning/10 text-warning' },
  completed: { labelKey: 'completed', className: 'bg-success/10 text-success' },
  reported: { labelKey: 'reported', className: 'bg-primary/10 text-primary' },
  rejected: { labelKey: 'rejected', className: 'bg-destructive/10 text-destructive' },
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

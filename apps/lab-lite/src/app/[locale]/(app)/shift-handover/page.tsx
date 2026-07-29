'use client'

import { useTranslations } from 'next-intl'
import { useRequireLabRole } from '@/hooks/useLabPermission'
import { HandoverHistory } from '@/components/shift/HandoverHistory'
import { LabRole } from '@ultranos/shared-types'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Lock } from '@ultranos/ui-kit/icons'

function ShiftHandoverContent() {
  const t = useTranslations('shift')
  const canViewHistory = useRequireLabRole(LabRole.SUPERVISOR)

  if (!canViewHistory) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        <EmptyState icon={Lock} title={t('historyRestricted')} />
      </div>
    )
  }

  return <HandoverHistory />
}

export default function ShiftHandoverPage() {
  return (
      <div className="flex flex-col gap-4">
        <ShiftHandoverContent />
      </div>
  )
}

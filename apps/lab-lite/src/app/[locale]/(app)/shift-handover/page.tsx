'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { useRequireLabRole } from '@/hooks/useLabPermission'
import { HandoverHistory } from '@/components/shift/HandoverHistory'
import { LabRole } from '@ultranos/shared-types'

function ShiftHandoverContent() {
  const canViewHistory = useRequireLabRole(LabRole.SUPERVISOR)

  if (!canViewHistory) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Handover history is available to Supervisors and Lab Managers only.
        </p>
      </div>
    )
  }

  return <HandoverHistory />
}

export default function ShiftHandoverPage() {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-4xl flex flex-col gap-4">
        <ShiftHandoverContent />
      </div>
    </AuthGuard>
  )
}

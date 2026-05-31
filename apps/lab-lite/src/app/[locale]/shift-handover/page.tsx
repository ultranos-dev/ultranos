'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { useRequireLabRole } from '@/hooks/useLabPermission'
import { HandoverHistory } from '@/components/shift/HandoverHistory'
import { LabRole } from '@ultranos/shared-types'

function ShiftHandoverContent() {
  const canViewHistory = useRequireLabRole(LabRole.SUPERVISOR)

  if (!canViewHistory) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-500">
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
      <div className="mx-auto max-w-4xl px-4 py-6">
        <ShiftHandoverContent />
      </div>
    </AuthGuard>
  )
}

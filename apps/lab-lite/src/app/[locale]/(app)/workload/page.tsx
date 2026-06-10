'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { WorkloadDashboard } from '@/components/workload/WorkloadDashboard'

export default function WorkloadPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col gap-4">
        <WorkloadDashboard />
      </div>
    </AuthGuard>
  )
}

'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { WorkloadDashboard } from '@/components/workload/WorkloadDashboard'

export default function WorkloadPage() {
  return (
    <AuthGuard>
      <main className="p-4 sm:p-6">
        <WorkloadDashboard />
      </main>
    </AuthGuard>
  )
}

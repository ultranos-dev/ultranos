'use client'

import { useAuthSessionStore } from '@/stores/auth-session-store'

export function LabIdentityCard() {
  const session = useAuthSessionStore((s) => s.session)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">Lab Identity</h2>
      <p className="mt-1 text-lg font-semibold text-neutral-900">
        {session?.labName ?? 'Lab'}
      </p>
      <p className="mt-0.5 text-sm text-neutral-600">
        {session?.technicianName ?? 'Technician'}
      </p>
    </div>
  )
}

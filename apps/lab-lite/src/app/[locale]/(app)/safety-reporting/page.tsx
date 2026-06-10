'use client'

import { useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { useRequireLabRole } from '@/hooks/useLabPermission'
import { AnonymousReportForm } from '@/components/safety/AnonymousReportForm'
import { SafetyReportManagement } from '@/components/safety/SafetyReportManagement'
import { SafetyTrendDashboard } from '@/components/safety/SafetyTrendDashboard'

type View = 'submit' | 'manage' | 'trends'

function SafetyReportingContent() {
  const isManager = useRequireLabRole('LAB_MANAGER' as any)
  const [view, setView] = useState<View>('submit')

  // Managers can switch between views; non-managers only see the form
  if (!isManager) {
    return <AnonymousReportForm />
  }

  if (view === 'trends') {
    return <SafetyTrendDashboard onBack={() => setView('manage')} />
  }

  if (view === 'manage') {
    return (
      <SafetyReportManagement onViewTrends={() => setView('trends')} />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <AnonymousReportForm onSubmitted={() => {}} />
      <div className="text-center">
        <button
          type="button"
          onClick={() => setView('manage')}
          className="text-sm text-primary-600 hover:underline"
        >
          Manage Reports →
        </button>
      </div>
    </div>
  )
}

export default function SafetyReportingPage() {
  return (
    <AuthGuard>
      <SafetyReportingContent />
    </AuthGuard>
  )
}

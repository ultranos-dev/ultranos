'use client'

import { use } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { SessionTimeoutWrapper } from '@/components/SessionTimeoutWrapper'
import { PatientChartPage } from '@/components/patient/PatientChartPage'

interface PatientChartRouteProps {
  params: Promise<{ patientId: string }>
}

export default function PatientChartRoute({ params }: PatientChartRouteProps) {
  const { patientId } = use(params)
  return (
    <AuthGuard>
      <SessionTimeoutWrapper>
        <PatientChartPage patientId={patientId} />
      </SessionTimeoutWrapper>
    </AuthGuard>
  )
}

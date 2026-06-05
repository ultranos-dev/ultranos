'use client'

import { use } from 'react'
import { PatientChartPage } from '@/components/patient/PatientChartPage'

interface PatientChartRouteProps {
  params: Promise<{ patientId: string }>
}

export default function PatientChartRoute({ params }: PatientChartRouteProps) {
  const { patientId } = use(params)
  return <PatientChartPage patientId={patientId} />
}

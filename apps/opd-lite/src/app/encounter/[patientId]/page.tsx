'use client'

import { use } from 'react'
import { EncounterDashboard } from '@/components/encounter-dashboard'

interface EncounterPageProps {
  params: Promise<{ patientId: string }>
}

export default function EncounterPage({ params }: EncounterPageProps) {
  const { patientId } = use(params)
  return <EncounterDashboard patientId={patientId} />
}

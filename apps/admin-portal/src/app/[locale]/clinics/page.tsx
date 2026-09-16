'use client'
import { FacilityManager } from '@/components/facilities/FacilityManager'
import { clinicalKind } from '@/components/facilities/config'
import { Hospital } from '@ultranos/ui-kit/icons'

export default function ClinicsPage() {
  return (
    <FacilityManager
      kindConfig={clinicalKind}
      titleKey="clinics.title"
      icon={Hospital}
      showTypeColumn
    />
  )
}

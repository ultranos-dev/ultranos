'use client'
import { FacilityManager } from '@/components/facilities/FacilityManager'
import { pharmacyKind } from '@/components/facilities/config'
import { Building2 } from '@ultranos/ui-kit/icons'

export default function PharmaciesPage() {
  return (
    <FacilityManager
      kindConfig={pharmacyKind}
      titleKey="pharmacies.title"
      icon={Building2}
    />
  )
}

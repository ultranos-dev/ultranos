'use client'

import { useParams } from 'next/navigation'
import { FacilityLocationsManager } from '@/components/pharmacies/FacilityLocationsManager'

export default function Page() {
  const params = useParams()
  return <FacilityLocationsManager facilityId={params.facilityId as string} />
}

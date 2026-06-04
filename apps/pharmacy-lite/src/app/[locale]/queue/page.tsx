'use client'

import { TopHeader } from '@/components/TopHeader'
import { PrescriptionQueueView } from '@/components/pharmacy/PrescriptionQueueView'

export default function QueuePage() {
  return (
    <>
      <TopHeader title="Prescription Queue" />
      <PrescriptionQueueView />
    </>
  )
}

'use client'

import { PrescriptionQueueView } from '@/components/pharmacy/PrescriptionQueueView'

export default function QueuePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900">Prescription Queue</h2>
      </div>
      <PrescriptionQueueView />
    </div>
  )
}

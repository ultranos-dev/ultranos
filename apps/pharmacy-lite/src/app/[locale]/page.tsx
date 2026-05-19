'use client'

import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'
import { SyncPulse } from '@/components/pharmacy/SyncPulse'

export default function PharmacyHomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900">Scan Prescription</h2>
        <SyncPulse />
      </div>
      <PharmacyScannerView />
    </div>
  )
}

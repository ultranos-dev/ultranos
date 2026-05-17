'use client'

import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'

export default function ScanPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900">Scan Prescription</h2>
      </div>
      <PharmacyScannerView />
    </div>
  )
}

'use client'

import { TopHeader } from '@/components/TopHeader'
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'

export default function ScanPage() {
  return (
    <>
      <TopHeader title="Scan Prescription" />
      <PharmacyScannerView />
    </>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'

export default function ScanPage() {
  const router = useRouter()
  return <PharmacyScannerView onNavigateToReview={() => router.push('/fulfillment')} />
}

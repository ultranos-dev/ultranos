'use client'

import { TopHeader } from '@/components/TopHeader'
import { DispensingHistoryView } from '@/components/pharmacy/DispensingHistoryView'

export default function HistoryPage() {
  return (
    <>
      <TopHeader title="Dispensing History" />
      <DispensingHistoryView />
    </>
  )
}

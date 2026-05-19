'use client'

import { DispensingHistoryView } from '@/components/pharmacy/DispensingHistoryView'

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900">Dispensing History</h2>
      </div>
      <DispensingHistoryView />
    </div>
  )
}

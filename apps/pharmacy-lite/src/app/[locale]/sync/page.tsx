'use client'

import { TopHeader } from '@/components/TopHeader'
import { SyncQueueDashboard } from '@/components/pharmacy/SyncQueueDashboard'

export default function SyncPage() {
  return (
    <>
      <TopHeader title="Sync Queue" description="Offline sync status and queue management." />
      <SyncQueueDashboard />
    </>
  )
}

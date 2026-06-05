'use client'

import { TopHeader } from '@/components/TopHeader'
import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader
        title="Conflict Resolution"
        description="Review and resolve Tier 1 safety-critical sync conflicts."
      />
      <div className="px-6 pb-6">
        <ConflictList />
      </div>
    </div>
  )
}

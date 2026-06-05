'use client'

import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="px-6 pb-6">
        <ConflictList />
      </div>
    </div>
  )
}

'use client'

import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  return (
    <div className="flex flex-col gap-4">
      <ConflictList />
    </div>
  )
}

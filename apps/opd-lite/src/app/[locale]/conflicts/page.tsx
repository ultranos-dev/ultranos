'use client'

import Link from 'next/link'
import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  return (
    <main className="mx-auto max-w-3xl ps-4 pe-4 py-8">
      <header className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-block text-sm font-semibold text-primary-500 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          Conflict Resolution
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Review and resolve Tier 1 safety-critical sync conflicts.
        </p>
      </header>
      <ConflictList />
    </main>
  )
}

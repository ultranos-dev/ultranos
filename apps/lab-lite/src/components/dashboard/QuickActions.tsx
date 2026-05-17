'use client'

import Link from 'next/link'

export function QuickActions() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <Link
        href="/upload"
        className="block w-full rounded-md bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-green-800 transition-colors"
      >
        Upload New Result
      </Link>
    </div>
  )
}

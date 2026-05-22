'use client'

import Link from 'next/link'

export function QuickActions() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <Link
        href="/upload"
        className="block w-full rounded-md bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white [@media(hover:hover)and(pointer:fine)]:hover:bg-green-800 active:brightness-[0.88] transition-all duration-150"
      >
        Upload New Result
      </Link>
    </div>
  )
}

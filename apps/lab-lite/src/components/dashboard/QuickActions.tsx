'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <Link
        href="/upload"
        className="block w-full rounded-md bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 [@media(hover:hover)and(pointer:fine)]:hover:bg-green-800 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
      >
        {t('uploadNewResult')}
      </Link>
    </div>
  )
}

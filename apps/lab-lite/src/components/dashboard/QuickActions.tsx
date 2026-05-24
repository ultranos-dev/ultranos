'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')

  return (
    <Link
      href="/upload"
      className="flex items-center justify-center gap-2 rounded-pill bg-pill-green px-5 py-3 text-sm font-semibold text-pill-text transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
      </svg>
      {t('uploadNewResult')}
    </Link>
  )
}

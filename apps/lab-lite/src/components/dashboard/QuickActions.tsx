'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plus } from '@ultranos/ui-kit/icons'

export function QuickActions() {
  const t = useTranslations('dashboard')

  return (
    <Link
      href="/upload"
      className="flex items-center justify-center gap-2 rounded-pill bg-pill-green px-5 py-3 text-sm font-semibold text-pill-text transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
    >
      <Plus size={16} aria-hidden="true" />
      {t('uploadNewResult')}
    </Link>
  )
}

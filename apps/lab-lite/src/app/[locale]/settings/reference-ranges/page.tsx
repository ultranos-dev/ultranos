'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReferenceRangeEditor } from '@/components/settings/ReferenceRangeEditor'

export default function ReferenceRangesPage() {
  const t = useTranslations('settings')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <Link
          href="/settings"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {t('title')}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">
        {t('referenceRanges')}
      </h1>

      <ReferenceRangeEditor />
    </div>
  )
}

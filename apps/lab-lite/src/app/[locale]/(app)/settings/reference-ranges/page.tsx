'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReferenceRangeEditor } from '@/components/settings/ReferenceRangeEditor'

export default function ReferenceRangesPage() {
  const t = useTranslations('settings')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {t('title')}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-foreground">
        {t('referenceRanges')}
      </h1>

      <ReferenceRangeEditor />
    </div>
  )
}

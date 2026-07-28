'use client'

import { useTranslations } from 'next-intl'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('sidebar')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('duplicateReviews')}</h1>
      <DuplicateReviewTable />
    </div>
  )
}

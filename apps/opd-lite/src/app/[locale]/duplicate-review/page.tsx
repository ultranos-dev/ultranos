'use client'

import { useTranslations } from 'next-intl'
import { TopHeader } from '@/components/TopHeader'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('duplicateReview')

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title={t('title')} />
      <div className="px-6 pb-6">
        <DuplicateReviewTable />
      </div>
    </div>
  )
}

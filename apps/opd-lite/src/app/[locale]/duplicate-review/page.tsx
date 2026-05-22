'use client'

import { useTranslations } from 'next-intl'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('duplicateReview')

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <DuplicateReviewTable />
    </main>
  )
}

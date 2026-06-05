'use client'

import { useTranslations } from 'next-intl'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('duplicateReview')

  return (
    <div className="flex flex-col gap-4">
      <DuplicateReviewTable />
    </div>
  )
}

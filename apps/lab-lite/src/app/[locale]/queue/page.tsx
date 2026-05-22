'use client'

import { useTranslations } from 'next-intl'
import { UploadQueue } from '@/components/UploadQueue'

export default function QueuePage() {
  const t = useTranslations('queuePage')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-neutral-900 mb-4">{t('title')}</h1>
      <UploadQueue />
    </div>
  )
}

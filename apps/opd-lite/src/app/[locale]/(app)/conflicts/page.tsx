'use client'

import { useTranslations } from 'next-intl'
import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  const t = useTranslations('sidebar')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('conflicts')}</h1>
      <ConflictList />
    </div>
  )
}

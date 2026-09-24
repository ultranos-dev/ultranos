'use client'

import { useTranslations } from 'next-intl'

export function LayoutHeaderTitleClient() {
  const t = useTranslations('app')

  return (
    <h1 className="text-lg font-bold text-primary">{t('title')}</h1>
  )
}

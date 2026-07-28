'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { DataBudgetDashboard } from '@/components/settings/DataBudgetDashboard'

export default function DataBudgetPage() {
  const t = useTranslations('dataBudget')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground" aria-label={t('backToSettings')}>
          <DirectionalIcon category="navigation">
            <ChevronLeft size={20} />
          </DirectionalIcon>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t('usageTitle')}</h1>
      </div>
      <DataBudgetDashboard />
    </div>
  )
}
